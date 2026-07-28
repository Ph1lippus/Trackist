#!/usr/bin/env ts-node
/**
 * Backfill script to update last_season_number for all TV shows in the database
 * 
 * Usage:
 *   npx ts-node scripts/backfillLastSeasons.ts --userId=xxx
 *   npx ts-node scripts/backfillLastSeasons.ts --all-users
 * 
 * This script uses the Supabase Admin SDK (service_role key) to bypass RLS.
 */

import { createClient } from '@supabase/supabase-js'

// Parse command line arguments
const args = process.argv.slice(2)
const userIdArg = args.find(arg => arg.startsWith('--userId='))
const allUsersFlag = args.includes('--all-users')

if (!userIdArg && !allUsersFlag) {
    console.error('Error: Please specify --userId=xxx or --all-users')
    process.exit(1)
}

const userId = userIdArg?.split('=')[1]

// Environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const tmdbApiKey = process.env.TMDB_API_KEY

console.log('Environment check:')
console.log('SUPABASE_URL:', supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : 'NOT SET')
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'SET' : 'NOT SET')
console.log('TMDB_API_KEY:', tmdbApiKey ? 'SET' : 'NOT SET')

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment')
    process.exit(1)
}

if (!tmdbApiKey) {
    console.error('Error: TMDB_API_KEY must be set in environment')
    process.exit(1)
}

// Create Supabase admin client (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    },
    db: {
        schema: 'public'
    }
})

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

interface WatchlistItem {
    id: string
    user_id: string
    media_type: 'movie' | 'tv' | 'anime'
    tmdb_id?: number
    title: string
    last_season_number?: number
    total_seasons?: number
}

interface TMDBSeason {
    season_number: number
    episode_count?: number
}

interface TMDBTVDetails {
    number_of_seasons: number
    seasons: TMDBSeason[]
}

interface TMDBSeasonDetails {
    episodes: Array<{
        id: number
        episode_number: number
        season_number: number
        name: string
        still_path?: string
        overview?: string
        vote_average?: number
        air_date?: string
        runtime?: number
    }>
}

/**
 * Fetch TV details from TMDB
 */
async function getTVDetails(tmdbId: number): Promise<TMDBTVDetails> {
    const response = await fetch(
        `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${tmdbApiKey}`
    )
    if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`)
    }
    return response.json()
}

/**
 * Fetch season details from TMDB
 */
async function getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<TMDBSeasonDetails> {
    const response = await fetch(
        `${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${tmdbApiKey}`
    )
    if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`)
    }
    return response.json()
}

/**
 * Process a single show
 */
async function processShow(show: WatchlistItem): Promise<{ updated: boolean; error?: string }> {
    if (!show.tmdb_id) {
        return { updated: false, error: 'No TMDB ID' }
    }

    try {
        // Fetch TMDB details
        const details = await getTVDetails(show.tmdb_id)
        const seasonNumbers = details.seasons
            .filter((s: TMDBSeason) => s.season_number > 0)
            .map((s: TMDBSeason) => s.season_number)

        const latestSeasonNumber = seasonNumbers.length > 0 ? Math.max(...seasonNumbers) : 1

        // Update the watchlist with the latest season number
        const { error: updateError } = await supabase
            .from('watchlist')
            .update({
                last_season_number: latestSeasonNumber,
                total_seasons: details.number_of_seasons,
                last_season_check: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', show.id)

        if (updateError) {
            return { updated: false, error: updateError.message }
        }

        // Check which episodes already exist
        const { data: existingEpisodes } = await supabase
            .from('watchlist_episodes')
            .select('season_number, episode_number')
            .eq('watchlist_id', show.id)

        const existingKeys = new Set(
            (existingEpisodes || []).map(ep => `${ep.season_number}-${ep.episode_number}`)
        )

        // Fetch and save all episodes
        for (const season of seasonNumbers) {
            const seasonData = await getTVSeasonDetails(show.tmdb_id, season)
            const episodes = seasonData.episodes || []

            for (const ep of episodes) {
                const key = `${season}-${ep.episode_number}`
                if (existingKeys.has(key)) continue // Skip if already exists

                await supabase
                    .from('watchlist_episodes')
                    .insert({
                        watchlist_id: show.id,
                        season_number: season,
                        episode_number: ep.episode_number,
                        tmdb_episode_id: ep.id,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        vote_average: ep.vote_average,
                        air_date: ep.air_date,
                        runtime: ep.runtime,
                        watched: false
                    })
            }
        }

        return { updated: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { updated: false, error: message }
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🎬 Trackist Backfill Script')
    console.log('===========================\n')

    // Test database connection
    console.log('Testing database connection...')
    const { data: testData, error: testError } = await supabase
        .from('watchlist')
        .select('count', { count: 'exact', head: true })

    if (testError) {
        console.error('Database connection error:', testError.message)
        console.error('Details:', JSON.stringify(testError, null, 2))
        process.exit(1)
    }

    console.log(`Total items in watchlist table: ${testData || 0}`)

    // Try to fetch actual data to see what's accessible
    const { data: sampleData, error: sampleError } = await supabase
        .from('watchlist')
        .select('id, user_id, media_type, title')
        .limit(5)

    if (sampleError) {
        console.error('Error fetching sample data:', sampleError.message)
    } else {
        console.log(`Sample data found: ${sampleData?.length || 0} items`)
        if (sampleData && sampleData.length > 0) {
            console.log('Sample items:', sampleData.map(d => `${d.media_type}: ${d.title}`))
        }
    }

    // List all tables to verify we're in the right database
    const { data: tablesData, error: tablesError } = await supabase
        .rpc('get_tables')

    if (tablesError) {
        console.log('Cannot list tables (may not have permission)')
    } else {
        console.log('Available tables:', tablesData?.map((t: any) => t.table_name))
    }

    let usersToProcess: string[] = []

    if (userId) {
        usersToProcess = [userId]
        console.log(`Processing single user: ${userId}`)
    } else {
        // Fetch all users from watchlist table (not profiles)
        const { data: allUsers, error } = await supabase
            .from('watchlist')
            .select('user_id')

        if (error) {
            console.error('Error fetching users:', error.message)
            process.exit(1)
        }

        // Get unique user IDs
        const uniqueUserIds = new Set(allUsers?.map(u => u.user_id) || [])
        usersToProcess = Array.from(uniqueUserIds)
        console.log(`Processing all users: ${usersToProcess.length} users found`)
    }

    let totalUpdated = 0
    let totalErrors = 0
    let totalProcessed = 0

    for (const currentUserId of usersToProcess) {
        console.log(`\n👤 Processing user: ${currentUserId}`)

        // Fetch all TV shows for the user
        const { data: shows, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', currentUserId)
            .eq('media_type', 'tv')

        if (fetchError) {
            console.error(`  Error fetching watchlist: ${fetchError.message}`)
            continue
        }

        // Debug: fetch all items to see what media types exist
        const { data: allItems, error: allError } = await supabase
            .from('watchlist')
            .select('media_type, title')
            .eq('user_id', currentUserId)

        if (!allError && allItems) {
            const mediaTypes = [...new Set(allItems.map(item => item.media_type))]
            console.log(`  All items in watchlist: ${allItems.length}`)
            console.log(`  Media types found: ${mediaTypes.join(', ')}`)
            console.log(`  Sample items:`, allItems.slice(0, 5).map(i => `${i.media_type}: ${i.title}`))
        }

        if (!shows || shows.length === 0) {
            console.log('  No TV shows found for this user (with media_type in tv,anime)')
            continue
        }

        console.log(`  Found ${shows.length} TV shows`)

        // Process each show
        for (let i = 0; i < shows.length; i++) {
            const show = shows[i]
            const progress = `[${i + 1}/${shows.length}]`
            console.log(`  ${progress} Processing: ${show.title}`)

            const result = await processShow(show)

            if (result.updated) {
                totalUpdated++
                console.log(`  ${progress} ✅ Updated: ${show.title}`)
            } else {
                totalErrors++
                console.log(`  ${progress} ❌ Failed: ${show.title} - ${result.error}`)
            }

            totalProcessed++

            // Rate limiting: 500ms delay between TMDB calls
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }

    console.log('\n===========================')
    console.log('📊 Summary')
    console.log('===========================')
    console.log(`Total processed: ${totalProcessed}`)
    console.log(`Total updated: ${totalUpdated}`)
    console.log(`Total errors: ${totalErrors}`)
    console.log('\n✅ Backfill complete!')
}

main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})

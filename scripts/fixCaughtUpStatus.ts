/**
 * Script to fix TV shows in the database that should be marked as 'caught_up'
 * instead of 'completed'. This is for shows where:
 * - All episodes are watched
 * - But the show is still airing on TMDB (not ended)
 * 
 * Run with: npx tsx scripts/fixCaughtUpStatus.ts
 */

// Load environment variables from .env file FIRST, before any other imports
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const tmdbApiKey = process.env.VITE_TMDB_API_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file')
    process.exit(1)
}

if (!tmdbApiKey) {
    console.error('❌ Missing TMDB API key in .env file')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// TMDB API function (inline to avoid import.meta.env issues)
async function getTVDetails(tmdbId: number) {
    const response = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}`)
    if (!response.ok) {
        throw new Error(`TMDB API error: ${response.statusText}`)
    }
    return response.json()
}

declare const process: {
    exit(code: number): never
    env: Record<string, string | undefined>
}

async function fixCaughtUpStatus() {
    console.log('🔍 Fetching all TV shows from watchlist...\n')

    const { data: shows, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('media_type', 'tv')

    if (error) {
        console.error('❌ Error fetching watchlist:', error)
        process.exit(1)
    }

    if (!shows || shows.length === 0) {
        console.log('✅ No TV shows found in watchlist')
        return
    }

    console.log(`📊 Found ${shows.length} TV shows to check\n`)

    let fixed = 0
    let errors = 0
    let skipped = 0

    for (const show of shows) {
        try {
            console.log(`Checking: ${show.title} (current status: ${show.status})`)

            // Skip if not completed or caught_up
            if (show.status !== 'completed' && show.status !== 'caught_up') {
                console.log(`  ⏭️  Skipped (status is ${show.status})\n`)
                skipped++
                continue
            }

            if (!show.tmdb_id) {
                console.log(`  ⏭️  Skipped (no TMDB ID)\n`)
                skipped++
                continue
            }

            // Fetch current details from TMDB
            const details = await getTVDetails(show.tmdb_id)
            const showEnded = details.status === 'Ended'
            const currentTotalEpisodes = details.number_of_episodes || 0

            console.log(`  TMDB Status: ${details.status}`)
            console.log(`  TMDB Total Episodes: ${currentTotalEpisodes}`)
            console.log(`  DB Total Episodes: ${show.total_episodes}`)

            // If show is still airing but marked as completed, fix it
            if (!showEnded && show.status === 'completed') {
                console.log(`  🔄 Updating to 'caught_up' (show is still airing)`)

                const { error: updateError } = await supabase
                    .from('watchlist')
                    .update({
                        status: 'caught_up',
                        completed_at: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', show.id)

                if (updateError) {
                    console.error(`  ❌ Error updating:`, updateError)
                    errors++
                } else {
                    console.log(`  ✅ Fixed!\n`)
                    fixed++
                }
            } 
            // If show ended but marked as caught_up, fix it
            else if (showEnded && show.status === 'caught_up') {
                console.log(`  🔄 Updating to 'completed' (show has ended)`)

                const { error: updateError } = await supabase
                    .from('watchlist')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', show.id)

                if (updateError) {
                    console.error(`  ❌ Error updating:`, updateError)
                    errors++
                } else {
                    console.log(`  ✅ Fixed!\n`)
                    fixed++
                }
            }
            // If show ended but marked as watching, fix it
            else if (showEnded && show.status === 'watching') {
                console.log(`  🔄 Updating to 'completed' (show has ended and all episodes watched)`)

                const { error: updateError } = await supabase
                    .from('watchlist')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', show.id)

                if (updateError) {
                    console.error(`  ❌ Error updating:`, updateError)
                    errors++
                } else {
                    console.log(`  ✅ Fixed!\n`)
                    fixed++
                }
            }
            else {
                console.log(`  ✅ Already correct\n`)
                skipped++
            }

            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200))

        } catch (err) {
            console.error(`  ❌ Error processing ${show.title}:`, err)
            errors++
        }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 SUMMARY')
    console.log('='.repeat(50))
    console.log(`Total shows checked: ${shows.length}`)
    console.log(`✅ Fixed: ${fixed}`)
    console.log(`⏭️  Skipped (already correct): ${skipped}`)
    console.log(`❌ Errors: ${errors}`)
    console.log('='.repeat(50))
}

// Run the script
fixCaughtUpStatus()
    .then(() => {
        console.log('\n✅ Script completed successfully')
        process.exit(0)
    })
    .catch((err) => {
        console.error('\n❌ Script failed:', err)
        process.exit(1)
    })
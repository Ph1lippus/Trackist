/**
 * One-time migration script to populate denormalized progress columns
 * Run this with: npx ts-node scripts/migrateProgressColumns.ts
 */

import { supabase } from '../src/services/supabaseClient'
import { getWatchedEpisodeCount, getNextEpisodeToWatch } from '../src/services/watchlistService'

async function migrate() {
    console.log('Starting migration of progress columns...')

    // Get all TV shows
    const { data: shows, error } = await supabase
        .from('watchlist')
        .select('id, title, media_type')
        .eq('media_type', 'tv')

    if (error) {
        console.error('Failed to fetch shows:', error)
        process.exit(1)
    }

    if (!shows || shows.length === 0) {
        console.log('No TV shows found')
        return
    }

    console.log(`Found ${shows.length} TV shows to migrate`)

    let updated = 0
    let errors = 0

    for (const show of shows) {
        try {
            // Get watched count
            const watchedCount = await getWatchedEpisodeCount(show.id)

            // Get next episode
            const nextEp = await getNextEpisodeToWatch(show.id)

            // Update the watchlist item
            const { error: updateError } = await supabase
                .from('watchlist')
                .update({
                    watched_episodes_count: watchedCount,
                    next_season_number: nextEp?.season_number || null,
                    next_episode_number: nextEp?.episode_number || null
                })
                .eq('id', show.id)

            if (updateError) {
                console.error(`Failed to update ${show.title}:`, updateError)
                errors++
            } else {
                updated++
                console.log(`[${updated}/${shows.length}] Updated ${show.title}: watched=${watchedCount}, next=${nextEp?.season_number ?? '?'}x${nextEp?.episode_number ?? '?'}`)
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100))
        } catch (err) {
            console.error(`Error processing ${show.title}:`, err)
            errors++
        }
    }

    console.log(`\nMigration complete!`)
    console.log(`Updated: ${updated}`)
    console.log(`Errors: ${errors}`)
}

migrate().catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
})

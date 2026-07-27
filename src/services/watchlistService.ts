import { supabase } from './supabaseClient'
import { getTVDetails } from './tmdbService'
import type { WatchlistItem } from '../types'

export interface FixProgress {
    total: number
    processed: number
    fixed: number
    errors: number
    currentShow?: string
    errorDetails: string[]
}

/**
 * Recalculate progress for a single TV show
 * Fetches latest TMDB data and updates total_episodes, total_seasons,
 * recalculates current_episode based on watched episodes, and updates status
 */
export const recalculateProgress = async (showId: string): Promise<{ fixed: boolean; error?: string }> => {
    try {
        // Get the watchlist item
        const { data: show, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('id', showId)
            .single()

        if (fetchError || !show) {
            return { fixed: false, error: `Failed to fetch show: ${fetchError?.message || 'Not found'}` }
        }

        if (!show.tmdb_id) {
            return { fixed: false, error: 'No TMDB ID' }
        }

        // Fetch TMDB details
        const details = await getTVDetails(show.tmdb_id)
        const totalEpisodes = details.number_of_episodes || 0
        const totalSeasons = details.number_of_seasons || 1

        // Count watched episodes from watchlist_episodes
        const { data: watchedEpisodes, error: epError } = await supabase
            .from('watchlist_episodes')
            .select('*')
            .eq('watchlist_id', showId)
            .eq('watched', true)

        if (epError) {
            return { fixed: false, error: `Failed to fetch episodes: ${epError.message}` }
        }

        const watchedCount = watchedEpisodes?.length || 0

        // Determine new status
        let newStatus = show.status
        let newCurrentEpisode = show.current_episode || 0
        let newCurrentSeason = show.current_season || 1

        if (totalEpisodes > 0 && watchedCount >= totalEpisodes) {
            // All episodes watched
            newStatus = 'completed'
            newCurrentEpisode = totalEpisodes
            // Find the last season with watched episodes
            if (watchedEpisodes && watchedEpisodes.length > 0) {
                const lastWatched = watchedEpisodes.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEpisodes[0])
                newCurrentSeason = lastWatched.season_number
            }
        } else if (watchedCount > 0) {
            // Some episodes watched
            newStatus = show.status === 'completed' ? 'watching' : show.status
            newCurrentEpisode = watchedCount
            if (watchedEpisodes && watchedEpisodes.length > 0) {
                const lastWatched = watchedEpisodes.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEpisodes[0])
                newCurrentSeason = lastWatched.season_number
            }
        } else if (totalEpisodes > 0) {
            // No episodes watched but we have data, set to 0
            newCurrentEpisode = 0
            newCurrentSeason = 1
        }

        // Update the watchlist item
        const updates: Partial<WatchlistItem> = {
            total_episodes: totalEpisodes,
            total_seasons: totalSeasons,
            current_episode: newCurrentEpisode,
            current_season: newCurrentSeason,
            status: newStatus as WatchlistItem['status'],
            updated_at: new Date().toISOString()
        }

        if (newStatus === 'completed') {
            updates.completed_at = show.completed_at || new Date().toISOString()
        }

        const { error: updateError } = await supabase
            .from('watchlist')
            .update(updates)
            .eq('id', showId)

        if (updateError) {
            return { fixed: false, error: `Failed to update: ${updateError.message}` }
        }

        return { fixed: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { fixed: false, error: message }
    }
}

/**
 * Clean up duplicate episodes in watchlist_episodes for a given watchlist item
 */
export const cleanupDuplicateEpisodes = async (watchlistId: string): Promise<number> => {
    // Find duplicate episodes (same season_number + episode_number)
    const { data: episodes, error } = await supabase
        .from('watchlist_episodes')
        .select('id, season_number, episode_number')
        .eq('watchlist_id', watchlistId)
        .order('created_at', { ascending: true })

    if (error || !episodes) return 0

    // Track seen episodes and find duplicates
    const seen = new Map<string, string[]>() // key -> array of ids (first is kept)
    const toDelete: string[] = []

    for (const ep of episodes) {
        const key = `${ep.season_number}-${ep.episode_number}`
        if (seen.has(key)) {
            // This is a duplicate, mark for deletion
            toDelete.push(ep.id)
        } else {
            seen.set(key, [ep.id])
        }
    }

    if (toDelete.length === 0) return 0

    // Delete duplicates in batches of 100 (Supabase limit)
    const batchSize = 100
    for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize)
        await supabase
            .from('watchlist_episodes')
            .delete()
            .in('id', batch)
    }

    return toDelete.length
}

/**
 * Fix all TV shows with missing or invalid progress data for a user
 */
export const fixAllProgress = async (
    userId: string,
    onProgress?: (progress: FixProgress) => void
): Promise<FixProgress> => {
    const progress: FixProgress = {
        total: 0,
        processed: 0,
        fixed: 0,
        errors: 0,
        errorDetails: []
    }

    try {
        // Fetch all TV shows for the user with missing or invalid data
        const { data: shows, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', userId)
            .in('media_type', ['tv', 'anime'])
            .or('total_episodes.eq.0,current_episode.eq.0,total_episodes.is.null,current_episode.is.null')

        if (fetchError) {
            throw new Error(`Failed to fetch watchlist: ${fetchError.message}`)
        }

        if (!shows || shows.length === 0) {
            // Also check for shows with inconsistent status (completed but no progress)
            const { data: allShows } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', userId)
                .in('media_type', ['tv', 'anime'])
                .eq('status', 'completed')

            if (allShows) {
                for (const show of allShows) {
                    if (!shows) continue
                    const alreadyIncluded = shows.some(s => s.id === show.id)
                    if (!alreadyIncluded && (!show.total_episodes || show.total_episodes === 0 || !show.current_episode || show.current_episode === 0)) {
                        shows.push(show)
                    }
                }
            }

            if (!shows || shows.length === 0) {
                onProgress?.({
                    ...progress,
                    total: 0,
                    currentShow: 'No shows need fixing'
                })
                return progress
            }
        }

        progress.total = shows.length
        onProgress?.(progress)

        // Process each show
        for (const show of shows) {
            progress.processed++
            progress.currentShow = show.title || 'Unknown Show'
            onProgress?.({ ...progress })

            // First clean up any duplicate episodes
            try {
                await cleanupDuplicateEpisodes(show.id)
            } catch {
                // Non-critical, continue
            }

            // Recalculate progress
            const result = await recalculateProgress(show.id)
            if (result.fixed) {
                progress.fixed++
            } else {
                progress.errors++
                if (result.error) {
                    progress.errorDetails.push(`${show.title}: ${result.error}`)
                }
            }

            onProgress?.({ ...progress })

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300))
        }

        progress.currentShow = undefined
        onProgress?.({ ...progress })

        return progress
    } catch (err) {
        progress.errors++
        const message = err instanceof Error ? err.message : 'Unknown error'
        progress.errorDetails.push(message)
        onProgress?.({ ...progress })
        return progress
    }
}
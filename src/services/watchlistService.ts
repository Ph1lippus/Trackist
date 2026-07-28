import { supabase } from './supabaseClient'
import { getTVDetails, getTVSeasonDetails } from './tmdbService'
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
 * Mark an episode as watched by INSERTING it into watchlist_episodes.
 * If it already exists (unique constraint), this is a no-op.
 */
export const markEpisodeWatched = async (
    watchlistId: string,
    seasonNumber: number,
    episodeNumber: number,
    episodeData: {
        tmdb_episode_id?: number
        title?: string
        still_path?: string
        overview?: string
        vote_average?: number
        air_date?: string
        runtime?: number
    }
): Promise<boolean> => {
    const { error } = await supabase
        .from('watchlist_episodes')
        .insert({
            watchlist_id: watchlistId,
            season_number: seasonNumber,
            episode_number: episodeNumber,
            tmdb_episode_id: episodeData.tmdb_episode_id,
            title: episodeData.title,
            still_path: episodeData.still_path,
            overview: episodeData.overview,
            vote_average: episodeData.vote_average,
            air_date: episodeData.air_date,
            runtime: episodeData.runtime
        })

    if (error) {
        // If it's a duplicate (already watched), that's fine
        if (error.code === '23505') return true
        console.error('Failed to mark episode as watched:', error)
        return false
    }
    return true
}

/**
 * Unmark an episode as watched by DELETING it from watchlist_episodes.
 */
export const unmarkEpisodeWatched = async (
    watchlistId: string,
    seasonNumber: number,
    episodeNumber: number
): Promise<boolean> => {
    const { error } = await supabase
        .from('watchlist_episodes')
        .delete()
        .eq('watchlist_id', watchlistId)
        .eq('season_number', seasonNumber)
        .eq('episode_number', episodeNumber)

    if (error) {
        console.error('Failed to unmark episode:', error)
        return false
    }
    return true
}

/**
 * Get all watched episodes for a watchlist item.
 */
export const getWatchedEpisodes = async (watchlistId: string) => {
    const { data, error } = await supabase
        .from('watchlist_episodes')
        .select('*')
        .eq('watchlist_id', watchlistId)

    if (error) {
        console.error('Failed to fetch watched episodes:', error)
        return []
    }
    return data || []
}

/**
 * Get the count of watched episodes for a watchlist item.
 */
export const getWatchedEpisodeCount = async (watchlistId: string): Promise<number> => {
    const { count, error } = await supabase
        .from('watchlist_episodes')
        .select('*', { count: 'exact', head: true })
        .eq('watchlist_id', watchlistId)

    if (error) {
        console.error('Failed to count watched episodes:', error)
        return 0
    }
    return count || 0
}

/**
 * Update watchlist status from 'planning' to 'watching' when episodes are marked
 */
export const updateStatusToWatching = async (watchlistId: string): Promise<void> => {
    try {
        await supabase
            .from('watchlist')
            .update({
                status: 'watching',
                updated_at: new Date().toISOString()
            })
            .eq('id', watchlistId)
            .eq('status', 'planning')
    } catch (err) {
        console.error('Failed to update status to watching:', err)
    }
}

/**
 * Check if the user has watched all episodes of the latest season.
 * If so, update status to 'caught_up'.
 */
export const checkAndUpdateCaughtUp = async (watchlistId: string, tmdbId: number): Promise<void> => {
    try {
        const details = await getTVDetails(tmdbId)
        const latestSeasonNumber = details.number_of_seasons || 1

        // Get the latest season details from TMDB
        const seasonData = await getTVSeasonDetails(tmdbId, latestSeasonNumber)
        const totalEpisodesInLatestSeason = seasonData.episodes?.length || 0

        if (totalEpisodesInLatestSeason === 0) return

        // Count how many episodes of the latest season the user has watched
        const { count, error } = await supabase
            .from('watchlist_episodes')
            .select('*', { count: 'exact', head: true })
            .eq('watchlist_id', watchlistId)
            .eq('season_number', latestSeasonNumber)

        if (error) return

        const watchedInLatestSeason = count || 0

        // If all episodes of the latest season are watched, set to caught_up
        if (watchedInLatestSeason >= totalEpisodesInLatestSeason) {
            await supabase
                .from('watchlist')
                .update({
                    status: 'caught_up',
                    current_season: latestSeasonNumber,
                    current_episode: totalEpisodesInLatestSeason,
                    updated_at: new Date().toISOString()
                })
                .eq('id', watchlistId)
        } else {
            // Still watching
            await supabase
                .from('watchlist')
                .update({
                    status: 'watching',
                    current_season: latestSeasonNumber,
                    current_episode: watchedInLatestSeason,
                    updated_at: new Date().toISOString()
                })
                .eq('id', watchlistId)
        }
    } catch (err) {
        console.error('Failed to check caught_up status:', err)
    }
}

/**
 * Check if all episodes across ALL seasons are watched.
 * If the show has ended on TMDB, mark as 'completed'.
 * If the show is still airing, mark as 'caught_up'.
 */
export const checkAndUpdateCompleted = async (watchlistId: string, tmdbId: number): Promise<void> => {
    try {
        const details = await getTVDetails(tmdbId)
        const totalEpisodes = details.number_of_episodes || 0

        if (totalEpisodes === 0) return

        const watchedCount = await getWatchedEpisodeCount(watchlistId)

        if (watchedCount >= totalEpisodes) {
            // Check TMDB show status to determine if truly completed or just caught up
            const showEnded = details.status === 'Ended'
            
            await supabase
                .from('watchlist')
                .update({
                    status: showEnded ? 'completed' : 'caught_up',
                    completed_at: showEnded ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', watchlistId)
        }
    } catch (err) {
        console.error('Failed to check completed status:', err)
    }
}

/**
 * Backfill tmdb_episode_id for episodes that have it as NULL
 */
export const backfillTmdbEpisodeIds = async (tmdbId: number, watchlistId: string): Promise<number> => {
    let fixedCount = 0
    try {
        const { data: episodes, error } = await supabase
            .from('watchlist_episodes')
            .select('season_number, episode_number, id')
            .eq('watchlist_id', watchlistId)
            .is('tmdb_episode_id', null)

        if (error || !episodes || episodes.length === 0) return 0

        const details = await getTVDetails(tmdbId)
        const seasonNumbers = (details.seasons || [])
            .filter((s: { season_number: number }) => s.season_number > 0)
            .map((s: { season_number: number }) => s.season_number)

        const episodeIdMap = new Map<string, number>()
        for (const season of seasonNumbers) {
            const sData = await getTVSeasonDetails(tmdbId, season)
            const sEpisodes = sData.episodes || []
            for (const ep of sEpisodes) {
                episodeIdMap.set(`${ep.season_number}-${ep.episode_number}`, ep.id)
            }
        }

        for (const ep of episodes) {
            const key = `${ep.season_number}-${ep.episode_number}`
            const tmdbEpisodeId = episodeIdMap.get(key)
            if (tmdbEpisodeId) {
                const { error: updateError } = await supabase
                    .from('watchlist_episodes')
                    .update({ tmdb_episode_id: tmdbEpisodeId, updated_at: new Date().toISOString() })
                    .eq('id', ep.id)

                if (!updateError) {
                    fixedCount++
                }
            }
        }
    } catch (err) {
        console.error(`Failed to backfill tmdb_episode_ids for watchlist ${watchlistId}:`, err)
    }
    return fixedCount
}

/**
 * Recalculate progress for a single TV show
 */
export const recalculateProgress = async (showId: string): Promise<{ fixed: boolean; error?: string }> => {
    try {
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

        const details = await getTVDetails(show.tmdb_id)
        const totalEpisodes = details.number_of_episodes || 0
        const totalSeasons = details.number_of_seasons || 1

        // Backfill tmdb_episode_id for episodes that are missing it
        await backfillTmdbEpisodeIds(show.tmdb_id, showId)

        // Count watched episodes
        const watchedCount = await getWatchedEpisodeCount(showId)

        // Determine new status
        let newStatus = show.status
        let newCurrentEpisode = show.current_episode || 0
        let newCurrentSeason = show.current_season || 1

        if (totalEpisodes > 0 && watchedCount >= totalEpisodes) {
            newStatus = 'completed'
            newCurrentEpisode = totalEpisodes
            const watchedEps = await getWatchedEpisodes(showId)
            if (watchedEps.length > 0) {
                const lastWatched = watchedEps.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEps[0])
                newCurrentSeason = lastWatched.season_number
            }
        } else if (watchedCount > 0) {
            newStatus = 'watching'
            newCurrentEpisode = watchedCount
            const watchedEps = await getWatchedEpisodes(showId)
            if (watchedEps.length > 0) {
                const lastWatched = watchedEps.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEps[0])
                newCurrentSeason = lastWatched.season_number
            }
        } else {
            newStatus = 'watching'
            newCurrentEpisode = 0
            newCurrentSeason = 1
        }

        const updates: Partial<WatchlistItem> = {
            total_episodes: totalEpisodes,
            total_seasons: totalSeasons,
            current_episode: newCurrentEpisode,
            current_season: newCurrentSeason,
            status: newStatus as WatchlistItem['status'],
            last_season_number: totalSeasons,
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
    const { data: episodes, error } = await supabase
        .from('watchlist_episodes')
        .select('id, season_number, episode_number')
        .eq('watchlist_id', watchlistId)
        .order('created_at', { ascending: true })

    if (error || !episodes) return 0

    const seen = new Map<string, string[]>()
    const toDelete: string[] = []

    for (const ep of episodes) {
        const key = `${ep.season_number}-${ep.episode_number}`
        if (seen.has(key)) {
            toDelete.push(ep.id)
        } else {
            seen.set(key, [ep.id])
        }
    }

    if (toDelete.length === 0) return 0

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
 * Check for and update new seasons for TV shows in a user's watchlist
 */
export const checkForNewSeasons = async (userId: string): Promise<{ updated: number; errors: number }> => {
    let updated = 0
    let errors = 0

    try {
        const { data: shows, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', userId)
            .eq('media_type', 'tv')

        if (fetchError) {
            throw new Error(`Failed to fetch watchlist: ${fetchError.message}`)
        }

        if (!shows || shows.length === 0) {
            return { updated: 0, errors: 0 }
        }

        for (const show of shows) {
            if (!show.tmdb_id) continue

            try {
                const details = await getTVDetails(show.tmdb_id)
                const currentTotalSeasons = details.number_of_seasons || 1
                const storedLastSeason = show.last_season_number || 1

                if (currentTotalSeasons > storedLastSeason) {
                    const { error: updateError } = await supabase
                        .from('watchlist')
                        .update({
                            last_season_number: currentTotalSeasons,
                            total_seasons: currentTotalSeasons,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', show.id)

                    if (updateError) {
                        errors++
                        continue
                    }

                    updated++

                    // If the show was completed or caught_up, move it back to watching
                    if (show.status === 'completed' || show.status === 'caught_up') {
                        await supabase
                            .from('watchlist')
                            .update({ status: 'watching', updated_at: new Date().toISOString() })
                            .eq('id', show.id)
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 100))
            } catch (err) {
                console.error(`Failed to check for new seasons for ${show.title}:`, err)
                errors++
            }
        }

        return { updated, errors }
    } catch (err) {
        console.error('Failed to check for new seasons:', err)
        return { updated, errors: errors + 1 }
    }
}

/**
 * Update last_season_number for all TV shows in a user's watchlist
 */
export const updateLastSeasonNumbers = async (
    userId: string,
    onProgress?: (current: number, total: number, currentShow?: string) => void
): Promise<{ updated: number; errors: number }> => {
    let updated = 0
    let errors = 0

    try {
        const { data: shows, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', userId)
            .eq('media_type', 'tv')

        if (fetchError) {
            throw new Error(`Failed to fetch watchlist: ${fetchError.message}`)
        }

        if (!shows || shows.length === 0) {
            return { updated: 0, errors: 0 }
        }

        const total = shows.length
        onProgress?.(0, total)

        for (let i = 0; i < shows.length; i++) {
            const show = shows[i]
            onProgress?.(i + 1, total, show.title || 'Unknown Show')

            if (!show.tmdb_id) {
                errors++
                continue
            }

            try {
                const details = await getTVDetails(show.tmdb_id)
                const seasonNumbers = (details.seasons || [])
                    .filter((s: { season_number: number }) => s.season_number > 0)
                    .map((s: { season_number: number }) => s.season_number)

                const latestSeasonNumber = seasonNumbers.length > 0 ? Math.max(...seasonNumbers) : 1

                const { error: updateError } = await supabase
                    .from('watchlist')
                    .update({ last_season_number: latestSeasonNumber, updated_at: new Date().toISOString() })
                    .eq('id', show.id)

                if (!updateError) {
                    updated++
                } else {
                    errors++
                }

                await new Promise(resolve => setTimeout(resolve, 200))
            } catch (err) {
                console.error(`Failed to update last_season_number for ${show.title}:`, err)
                errors++
            }
        }

        return { updated, errors }
    } catch (err) {
        console.error('Failed to update last_season_numbers:', err)
        return { updated, errors: errors + 1 }
    }
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
        const { data: shows, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', userId)
            .eq('media_type', 'tv')
            .or('total_episodes.eq.0,current_episode.eq.0,total_episodes.is.null,current_episode.is.null')

        if (fetchError) {
            throw new Error(`Failed to fetch watchlist: ${fetchError.message}`)
        }

        if (!shows || shows.length === 0) {
            const { data: allShows } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', userId)
                .eq('media_type', 'tv')
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

        for (const show of shows) {
            progress.processed++
            progress.currentShow = show.title || 'Unknown Show'
            onProgress?.({ ...progress })

            try {
                await cleanupDuplicateEpisodes(show.id)
            } catch {
                // Non-critical, continue
            }

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
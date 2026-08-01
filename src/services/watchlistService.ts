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
 * Save all episodes for a TV show to the watchlist_episodes table.
 * Called when a new show is added to the watchlist to pre-populate
 * all episodes so users can mark individual episodes as watched.
 */
export const saveAllEpisodesForShow = async (tmdbId: number, watchlistId: string): Promise<void> => {
    try {
        const details = await getTVDetails(tmdbId)
        const seasonNumbers = (details.seasons || [])
            .filter((s: { season_number: number }) => s.season_number > 0)
            .map((s: { season_number: number }) => s.season_number)

        for (const season of seasonNumbers) {
            const seasonData = await getTVSeasonDetails(tmdbId, season)
            const episodes = seasonData.episodes || []
            const episodeInserts = episodes.map((ep: { episode_number: number; id?: number; name?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number }) => ({
                watchlist_id: watchlistId,
                season_number: season,
                episode_number: ep.episode_number,
                tmdb_episode_id: ep.id,
                title: ep.name,
                still_path: ep.still_path,
                overview: ep.overview,
                air_date: ep.air_date,
                runtime: ep.runtime
            }))

            // Insert in batches to avoid hitting limits
            const batchSize = 100
            for (let i = 0; i < episodeInserts.length; i += batchSize) {
                const batch = episodeInserts.slice(i, i + batchSize)
                await supabase.from('watchlist_episodes').upsert(batch, {
                    onConflict: 'watchlist_id,season_number,episode_number'
                })
            }
        }
    } catch (err) {
        console.error(`Failed to save all episodes for show ${tmdbId}:`, err)
    }
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
 * If so, update status to 'caught_up' (only if show is still airing).
 * If the show has ended, this function does nothing - checkAndUpdateCompleted handles that.
 */
export const checkAndUpdateCaughtUp = async (watchlistId: string, tmdbId: number): Promise<void> => {
    try {
        const details = await getTVDetails(tmdbId)
        
        // Don't update to caught_up if the show has ended - let checkAndUpdateCompleted handle it
        if (details.status === 'Ended' || details.status === 'Canceled') {
            return
        }
        
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

        // Check if there are any unreleased episodes (air_date > today)
        const unreleasedEpisodes = seasonData.episodes?.filter((ep: { air_date?: string }) => {
            if (!ep.air_date) return false // If no air date, assume released
            return new Date(ep.air_date) > new Date()
        }) || []

        const releasedEpisodesCount = totalEpisodesInLatestSeason - unreleasedEpisodes.length

        // If all released episodes are watched OR there are no released episodes yet, set to caught_up
        if ((watchedInLatestSeason >= releasedEpisodesCount && releasedEpisodesCount > 0) || releasedEpisodesCount === 0) {
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
            // Still watching - there are released episodes that haven't been watched
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
 * If no episodes are watched, reset to 'planning'.
 */
export const checkAndUpdateCompleted = async (watchlistId: string, tmdbId: number): Promise<void> => {
    try {
        const details = await getTVDetails(tmdbId)
        
        // Count only released episodes across all seasons
        let totalReleasedEpisodes = 0
        const seasonNumbers = (details.seasons || [])
            .filter((s: { season_number: number }) => s.season_number > 0)
            .map((s: { season_number: number }) => s.season_number)

        for (const seasonNum of seasonNumbers) {
            const seasonData = await getTVSeasonDetails(tmdbId, seasonNum)
            const unreleasedInSeason = seasonData.episodes?.filter((ep: { air_date?: string }) => {
                if (!ep.air_date) return false
                return new Date(ep.air_date) > new Date()
            }).length || 0
            
            totalReleasedEpisodes += (seasonData.episodes?.length || 0) - unreleasedInSeason
        }

        if (totalReleasedEpisodes === 0) return

        const watchedCount = await getWatchedEpisodeCount(watchlistId)

        if (watchedCount >= totalReleasedEpisodes) {
            // Check TMDB show status to determine if truly completed or just caught up
            const showEnded = details.status === 'Ended' || details.status === 'Canceled'

            await supabase
                .from('watchlist')
                .update({
                    status: showEnded ? 'completed' : 'caught_up',
                    completed_at: showEnded ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', watchlistId)
        } else if (watchedCount === 0) {
            // No episodes watched, reset to planning
            await supabase
                .from('watchlist')
                .update({
                    status: 'planning',
                    current_episode: 0,
                    current_season: 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', watchlistId)
        } else {
            // Some episodes watched but not all - set to watching
            await supabase
                .from('watchlist')
                .update({
                    status: 'watching',
                    current_episode: watchedCount,
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
        const totalSeasons = details.number_of_seasons || 1

        // Backfill tmdb_episode_id for episodes that are missing it
        await backfillTmdbEpisodeIds(show.tmdb_id, showId)

        // Count only released episodes across all seasons
        let totalReleasedEpisodes = 0
        const seasonNumbers = (details.seasons || [])
            .filter((s: { season_number: number }) => s.season_number > 0)
            .map((s: { season_number: number }) => s.season_number)

        for (const seasonNum of seasonNumbers) {
            const seasonData = await getTVSeasonDetails(show.tmdb_id, seasonNum)
            const unreleasedInSeason = seasonData.episodes?.filter((ep: { air_date?: string }) => {
                if (!ep.air_date) return false
                return new Date(ep.air_date) > new Date()
            }).length || 0
            
            totalReleasedEpisodes += (seasonData.episodes?.length || 0) - unreleasedInSeason
        }

        // Count watched episodes
        const watchedCount = await getWatchedEpisodeCount(showId)

        // Determine new status
        let newStatus = show.status
        let newCurrentEpisode = show.current_episode || 0
        let newCurrentSeason = show.current_season || 1

        if (totalReleasedEpisodes > 0 && watchedCount >= totalReleasedEpisodes) {
            // Check TMDB show status to determine if truly completed or just caught up
            const showEnded = details.status === 'Ended' || details.status === 'Canceled'
            newStatus = showEnded ? 'completed' : 'caught_up'
            newCurrentEpisode = totalReleasedEpisodes
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
            // No episodes watched, set to planning
            newStatus = 'planning'
            newCurrentEpisode = 0
            newCurrentSeason = 1
        }

        const updates: Partial<WatchlistItem> = {
            total_episodes: totalReleasedEpisodes,
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
 * Fix all TV shows and movies with missing or invalid progress data for a user
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
        // Fetch all TV shows and movies for the user
        const { data: allItems, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', userId)
            .in('media_type', ['tv', 'movie'])

        if (fetchError) {
            throw new Error(`Failed to fetch watchlist: ${fetchError.message}`)
        }

        if (!allItems || allItems.length === 0) {
            onProgress?.({
                ...progress,
                total: 0,
                currentShow: 'No items need fixing'
            })
            return progress
        }

        const itemsToFix: typeof allItems = []

        for (const item of allItems) {
            // For TV shows: fix if missing episode data or wrong status
            if (item.media_type === 'tv' || item.media_type === 'anime') {
                const hasMissingData = !item.total_episodes || item.total_episodes === 0 || 
                                      !item.current_episode || item.current_episode === 0 ||
                                      item.total_episodes === null || item.current_episode === null
                
                // Always include shows that need status fixing
                if (hasMissingData || item.status === 'watching' || item.status === 'completed' || item.status === 'caught_up') {
                    itemsToFix.push(item)
                }
            } 
            // For movies: fix if status is 'watching' (should be 'planning' or 'completed')
            else if (item.media_type === 'movie') {
                if (item.status === 'watching') {
                    itemsToFix.push(item)
                }
            }
        }

        if (itemsToFix.length === 0) {
            onProgress?.({
                ...progress,
                total: 0,
                currentShow: 'No items need fixing'
            })
            return progress
        }

        progress.total = itemsToFix.length
        onProgress?.(progress)

        for (const item of itemsToFix) {
            progress.processed++
            progress.currentShow = item.title || 'Unknown Item'
            onProgress?.({ ...progress })

            try {
                if (item.media_type === 'tv' || item.media_type === 'anime') {
                    // For TV shows, recalculate progress
                    await cleanupDuplicateEpisodes(item.id)
                    const result = await recalculateProgress(item.id)
                    if (result.fixed) {
                        progress.fixed++
                    } else {
                        progress.errors++
                        if (result.error) {
                            progress.errorDetails.push(`${item.title}: ${result.error}`)
                        }
                    }
                } else if (item.media_type === 'movie') {
                    // For movies, change 'watching' to 'planning'
                    const { error: updateError } = await supabase
                        .from('watchlist')
                        .update({
                            status: 'planning',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', item.id)

                    if (updateError) {
                        progress.errors++
                        progress.errorDetails.push(`${item.title}: ${updateError.message}`)
                    } else {
                        progress.fixed++
                    }
                }
            } catch (err) {
                progress.errors++
                const message = err instanceof Error ? err.message : 'Unknown error'
                progress.errorDetails.push(`${item.title}: ${message}`)
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

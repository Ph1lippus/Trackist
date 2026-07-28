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
 * Save all episodes for a TV show to the watchlist_episodes table
 * This ensures episodes exist even before they are marked as watched
 */
export const saveAllEpisodesForShow = async (tmdbId: number, watchlistId: string): Promise<number> => {
    let savedCount = 0
    try {
        // Fetch TV details to get seasons
        const details = await getTVDetails(tmdbId)
        const seasonNumbers = (details.seasons || [])
            .filter((s: { season_number: number }) => s.season_number > 0)
            .map((s: { season_number: number }) => s.season_number)

        // Get the latest season number
        const latestSeasonNumber = seasonNumbers.length > 0 ? Math.max(...seasonNumbers) : 1

        // Update the watchlist with the latest season number
        await supabase
            .from('watchlist')
            .update({ last_season_number: latestSeasonNumber, updated_at: new Date().toISOString() })
            .eq('id', watchlistId)

        // Check which episodes already exist
        const { data: existingEpisodes } = await supabase
            .from('watchlist_episodes')
            .select('season_number, episode_number')
            .eq('watchlist_id', watchlistId)

        const existingKeys = new Set(
            (existingEpisodes || []).map(ep => `${ep.season_number}-${ep.episode_number}`)
        )

        // Fetch and save all episodes
        for (const season of seasonNumbers) {
            const sData = await getTVSeasonDetails(tmdbId, season)
            const sEpisodes = sData.episodes || []

            for (const ep of sEpisodes) {
                const key = `${season}-${ep.episode_number}`
                if (existingKeys.has(key)) continue // Skip if already exists

                const { error } = await supabase
                    .from('watchlist_episodes')
                    .insert({
                        watchlist_id: watchlistId,
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

                if (!error) {
                    savedCount++
                }
            }
        }
    } catch (err) {
        console.error(`Failed to save episodes for watchlist ${watchlistId}:`, err)
    }
    return savedCount
}

/**
 * Backfill tmdb_episode_id for episodes that have it as NULL
 */
export const backfillTmdbEpisodeIds = async (tmdbId: number, watchlistId: string): Promise<number> => {
    let fixedCount = 0
    try {
        // Get all episodes in the DB for this watchlist that have NULL tmdb_episode_id
        const { data: episodes, error } = await supabase
            .from('watchlist_episodes')
            .select('season_number, episode_number, id')
            .eq('watchlist_id', watchlistId)
            .is('tmdb_episode_id', null)

        if (error || !episodes || episodes.length === 0) return 0

        // Fetch season details from TMDB to get episode IDs
        const details = await getTVDetails(tmdbId)
        const seasonNumbers = (details.seasons || [])
            .filter((s: { season_number: number }) => s.season_number > 0)
            .map((s: { season_number: number }) => s.season_number)

        // Build a map of (season, episode) -> tmdb_episode_id
        const episodeIdMap = new Map<string, number>()
        for (const season of seasonNumbers) {
            const sData = await getTVSeasonDetails(tmdbId, season)
            const sEpisodes = sData.episodes || []
            for (const ep of sEpisodes) {
                episodeIdMap.set(`${ep.season_number}-${ep.episode_number}`, ep.id)
            }
        }

        // Update each episode that has a match
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

        // Check if there are any episodes in watchlist_episodes for this show
        const { data: existingEpisodes, error: epCheckError } = await supabase
            .from('watchlist_episodes')
            .select('id')
            .eq('watchlist_id', showId)
            .limit(1)

        // If no episodes exist, save all episodes first
        if (!epCheckError && (!existingEpisodes || existingEpisodes.length === 0)) {
            await saveAllEpisodesForShow(show.tmdb_id, showId)
        }

        // Backfill tmdb_episode_id for episodes that are missing it
        await backfillTmdbEpisodeIds(show.tmdb_id, showId)

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

        // Special case: if show is marked as completed but has no watched episodes, mark all as watched
        if (show.status === 'completed' && watchedCount === 0 && totalEpisodes > 0) {
            // Fetch all episodes from TMDB and mark them as watched
            const seasonNumbers = (details.seasons || [])
                .filter((s: { season_number: number }) => s.season_number > 0)
                .map((s: { season_number: number }) => s.season_number)

            for (const season of seasonNumbers) {
                const sData = await getTVSeasonDetails(show.tmdb_id, season)
                const sEpisodes = sData.episodes || []

                for (const ep of sEpisodes) {
                    await supabase
                        .from('watchlist_episodes')
                        .upsert({
                            watchlist_id: showId,
                            season_number: season,
                            episode_number: ep.episode_number,
                            tmdb_episode_id: ep.id,
                            title: ep.name,
                            still_path: ep.still_path,
                            overview: ep.overview,
                            vote_average: ep.vote_average,
                            air_date: ep.air_date,
                            runtime: ep.runtime,
                            watched: true,
                            watched_at: show.completed_at || new Date().toISOString()
                        }, {
                            onConflict: 'watchlist_id,season_number,episode_number'
                        })
                }
            }

            // Recount after marking all as watched
            const { data: newWatchedEpisodes } = await supabase
                .from('watchlist_episodes')
                .select('*')
                .eq('watchlist_id', showId)
                .eq('watched', true)

            newStatus = 'completed'
            newCurrentEpisode = totalEpisodes
            if (newWatchedEpisodes && newWatchedEpisodes.length > 0) {
                const lastWatched = newWatchedEpisodes.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , newWatchedEpisodes[0])
                newCurrentSeason = lastWatched.season_number
            }
        } else if (totalEpisodes > 0 && watchedCount >= totalEpisodes) {
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
            // Some episodes watched - if show was completed but now has unwatched episodes, change to watching
            newStatus = 'watching'
            newCurrentEpisode = watchedCount
            if (watchedEpisodes && watchedEpisodes.length > 0) {
                const lastWatched = watchedEpisodes.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEpisodes[0])
                newCurrentSeason = lastWatched.season_number
            }
        } else if (totalEpisodes > 0) {
            // No episodes watched but we have data, set to watching
            newStatus = 'watching'
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
 * Check for and update new seasons for TV shows in a user's watchlist
 * This should be called periodically (e.g., when visiting the Upcoming page)
 * to detect when new seasons have been released
 */
export const checkForNewSeasons = async (userId: string): Promise<{ updated: number; errors: number }> => {
    let updated = 0
    let errors = 0

    try {
        // Fetch all TV/anime shows for the user
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

        // Process each show
        for (const show of shows) {
            if (!show.tmdb_id) continue

            try {
                const details = await getTVDetails(show.tmdb_id)
                const currentTotalSeasons = details.number_of_seasons || 1
                const storedLastSeason = show.last_season_number || 1

                // If TMDB reports more seasons than we have stored, update and fetch new episodes
                if (currentTotalSeasons > storedLastSeason) {
                    // Update the watchlist with the new season number
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

                    // Fetch and save episodes for the new season(s)
                    const newSeasonNumbers = (details.seasons || [])
                        .filter((s: { season_number: number }) => s.season_number > storedLastSeason)
                        .map((s: { season_number: number }) => s.season_number)

                    for (const season of newSeasonNumbers) {
                        const seasonData = await getTVSeasonDetails(show.tmdb_id, season)
                        const episodes = seasonData.episodes || []

                        for (const ep of episodes) {
                            await supabase
                                .from('watchlist_episodes')
                                .upsert({
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
                                }, {
                                    onConflict: 'watchlist_id,season_number,episode_number'
                                })
                        }
                    }

                    updated++

                    // If the show was completed, move it back to watching
                    if (show.status === 'completed') {
                        await supabase
                            .from('watchlist')
                            .update({ status: 'watching', updated_at: new Date().toISOString() })
                            .eq('id', show.id)
                    }
                }

                // Small delay to avoid rate limiting
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
 * This is a one-time migration function to backfill the new column
 */
export const updateLastSeasonNumbers = async (
    userId: string,
    onProgress?: (current: number, total: number, currentShow?: string) => void
): Promise<{ updated: number; errors: number }> => {
    let updated = 0
    let errors = 0

    try {
        // Fetch all TV/anime shows for the user
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

        // Process each show
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

                // Small delay to avoid rate limiting
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
        // Fetch all TV shows for the user with missing or invalid data
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
            // Also check for shows with inconsistent status (completed but no progress)
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

            // Also check for shows that have no episodes in watchlist_episodes table
            const { data: allTvShows } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', userId)
                .eq('media_type', 'tv')

            if (allTvShows) {
                for (const show of allTvShows) {
                    if (!shows) continue
                    const alreadyIncluded = shows.some(s => s.id === show.id)
                    if (!alreadyIncluded) {
                        // Check if this show has any episodes
                        const { data: showEpisodes } = await supabase
                            .from('watchlist_episodes')
                            .select('id')
                            .eq('watchlist_id', show.id)
                            .limit(1)
                        
                        if (!showEpisodes || showEpisodes.length === 0) {
                            shows.push(show)
                        }
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

            // Recalculate progress (this now also saves episodes if none exist)
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
import { useEffect, useRef } from 'react'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { countReleasedEpisodesAcrossSeasons } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { getUTCTodayString } from '../utils/dateUtils'

interface SyncShow {
    id: string
    tmdb_id: number
    status: string
    last_season_check?: string | null
}

const SYNC_BATCH_SIZE = 5
const SYNC_BATCH_DELAY_MS = 150

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Determine whether a show's progress is stale relative to the current UTC day.
 * A show is due when it was never checked, or when its last check happened on a
 * previous UTC calendar day (i.e. a new day has started since it was checked).
 */
const isDueForSync = (lastCheck?: string | null): boolean => {
    if (!lastCheck) return true
    try {
        const checkDate = lastCheck.slice(0, 10)
        return checkDate !== getUTCTodayString()
    } catch {
        return true
    }
}

/**
 * Refresh the released-episode count (and thus the "episodes left" badge) for a
 * single `watching` show. Also serves as the daily status check.
 */
const syncWatchingShow = async (show: SyncShow): Promise<void> => {
    const totalReleasedEpisodes = await countReleasedEpisodesAcrossSeasons(show.tmdb_id)

    const { error } = await supabase
        .from('watchlist')
        .update({
            total_episodes: totalReleasedEpisodes,
            last_season_check: new Date().toISOString()
        })
        .eq('id', show.id)
        .eq('status', 'watching')

    if (error) {
        console.error(`Failed to sync watching show ${show.id}:`, error)
        return
    }

    await useLibraryStore.getState().refreshItem(show.id)
}

/**
 * Check whether a caught_up/completed show now has a newly released episode in
 * its latest season that the user hasn't watched. If so, move it back to
 * `watching` so it reappears in the active list.
 */
const syncCaughtUpShow = async (show: SyncShow): Promise<void> => {
    const details = await getTVDetails(show.tmdb_id)
    const latestSeasonNumber = details.number_of_seasons || 1

    // Skip non-started / future seasons entirely.
    const seasonMeta = (details.seasons || []).find(
        (s: { season_number: number }) => s.season_number === latestSeasonNumber
    )
    if (seasonMeta?.air_date && new Date(seasonMeta.air_date) > new Date()) return

    const seasonData = await getTVSeasonDetails(show.tmdb_id, latestSeasonNumber)
    const today = new Date()

    // Count released episodes in the latest season (must have air_date, today or past).
    const releasedInSeason = (seasonData.episodes || []).filter((ep: { air_date?: string }) => {
        if (!ep.air_date) return false
        return new Date(ep.air_date) <= today
    }).length

    if (releasedInSeason === 0) return

    // Count how many of those latest-season episodes the user has watched.
    const { count: watchedCount } = await supabase
        .from('watchlist_episodes')
        .select('*', { count: 'exact', head: true })
        .eq('watchlist_id', show.id)
        .eq('season_number', latestSeasonNumber)

    const watched = watchedCount || 0

    // If there are released episodes the user hasn't watched, move back to watching.
    if (releasedInSeason > watched) {
        const { error } = await supabase
            .from('watchlist')
            .update({
                status: 'watching',
                last_season_check: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', show.id)

        if (error) {
            console.error(`Failed to move caught_up show ${show.id} back to watching:`, error)
            return
        }

        await useLibraryStore.getState().refreshItem(show.id)
    }
}

/**
 * One-time-per-UTC-day background sweep over the user's TV/anime watchlist.
 *
 * - Refreshes the "episodes left" badge for `watching` shows (recalcs the
 *   released-episode count).
 * - Moves `caught_up`/`completed` shows back to `watching` when a new released
 *   episode is available.
 *
 * Runs on the first open of the app each UTC day, plus when the tab becomes
 * visible again, to reflect newly-airing episodes. Bounded to ~once per show per
 * day via the `last_season_check` UTC-date gate, and rate-limited across batched
 * concurrency to avoid hammering the TMDB proxy.
 */
export const useDailyTVSync = (userId: string | null) => {
    const running = useRef(false)
    const isInitialized = useLibraryStore((state) => state.isInitialized)

    useEffect(() => {
        if (!userId || !isInitialized) return
        if (running.current) return

        running.current = true

        const sweep = async () => {
            // Fetch the user's TV/anime shows once; filter by our scopes on the client.
            const allShows: SyncShow[] = []
            let hasMore = true
            let page = 0
            const pageSize = 1000
            while (hasMore) {
                const { data, error } = await supabase
                    .from('watchlist')
                    .select('id, tmdb_id, status, last_season_check')
                    .eq('user_id', userId)
                    .in('media_type', ['tv', 'anime'])
                    .range(page * pageSize, (page + 1) * pageSize - 1)

                if (error) {
                    console.error('useDailyTVSync: failed to fetch watchlist:', error)
                    return
                }
                if (data) {
                    allShows.push(...data)
                    if (data.length < pageSize) hasMore = false
                } else {
                    hasMore = false
                }
                page++
            }

            if (allShows.length === 0) return

            // Split into scopes and only process shows that are due (not yet checked today or a previous UTC day).
            const watching = allShows.filter(s => s.status === 'watching' && isDueForSync(s.last_season_check))
            const caughtUp = allShows.filter(
                s => (s.status === 'caught_up' || s.status === 'completed') && isDueForSync(s.last_season_check)
            )

            // Process batches with small concurrency to stay TMDB-friendly.
            for (const group of [watching, caughtUp]) {
                for (let i = 0; i < group.length; i += SYNC_BATCH_SIZE) {
                    const batch = group.slice(i, i + SYNC_BATCH_SIZE)
                    await Promise.allSettled(
                        batch.map(show =>
                            show.status === 'watching'
                                ? syncWatchingShow(show)
                                : syncCaughtUpShow(show)
                        )
                    )
                    if (i + SYNC_BATCH_SIZE < group.length) {
                        await delay(SYNC_BATCH_DELAY_MS)
                    }
                }
            }
        }

        void sweep().catch(err => {
            console.error('useDailyTVSync: sweep failed:', err)
        })

        // Re-run when the tab becomes visible again (covers staying open past midnight).
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && running.current === false) {
                running.current = true
                void sweep().catch(err => {
                    console.error('useDailyTVSync: visibility sweep failed:', err)
                })
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
            // running flag intentionally left: once the hook mounts we allow repeats via visibility.
            running.current = false
        }
    }, [userId, isInitialized])
}

import { useEffect, useCallback } from 'react'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { getReleaseIndex, getShowAirSchedule, isEpisodeAired } from '../services/tvmazeService'
import { countReleasedEpisodesAcrossSeasons } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { getUTCTodayString } from '../utils/dateUtils'

interface SyncShow {
    id: string
    tmdb_id: number
    status: string
    last_season_check?: string | null
}

// Lightweight result of a single show's sync — the fields the sweep computed
// that need to be reflected back in the in-memory store. Passed to the store's
// `applySyncUpdates` in one batched call at the end of the sweep.
interface SyncResult {
    id: string
    status: 'watching' | 'caught_up' | 'completed' | 'dropped' | 'planning'
    total_episodes?: number
    last_season_check?: string
    updated_at?: string
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
 * single `watching` show. Also serves as the daily status check. Returns the
 * lightweight in-memory update (or null for ended shows) rather than going
 * through the full store refresh pipeline.
 *
 * When `refreshOnly` is true, only the in-memory episode count is updated —
 * no DB writes are made, keeping the operation cheap for tab-focus refreshes.
 */
const syncWatchingShow = async (show: SyncShow, refreshOnly = false): Promise<SyncResult | null> => {
    const details = await getTVDetails(show.tmdb_id)

    if (details.status === 'Ended' || details.status === 'Canceled') {
        if (refreshOnly) {
            return {
                id: show.id,
                status: 'watching',
            }
        }

        const { error } = await supabase
            .from('watchlist')
            .update({ last_season_check: new Date().toISOString() })
            .eq('id', show.id)
            .eq('status', 'watching')

        if (error) {
            console.error(`Failed to mark ended show ${show.id} as checked:`, error)
            return null
        }
        return {
            id: show.id,
            status: 'watching',
            last_season_check: new Date().toISOString(),
        }
    }

    const totalReleasedEpisodes = await countReleasedEpisodesAcrossSeasons(show.tmdb_id)
    const lastSeasonCheck = new Date().toISOString()

    if (!refreshOnly) {
        const { error } = await supabase
            .from('watchlist')
            .update({
                total_episodes: totalReleasedEpisodes,
                last_season_check: lastSeasonCheck
            })
            .eq('id', show.id)
            .eq('status', 'watching')

        if (error) {
            console.error(`Failed to sync watching show ${show.id}:`, error)
            return null
        }
    }

    return {
        id: show.id,
        status: 'watching',
        total_episodes: totalReleasedEpisodes,
        last_season_check: lastSeasonCheck,
    }
}

/**
 * Check whether a caught_up/completed show now has a newly released episode in
 * its latest season that the user hasn't watched. If so, move it back to
 * `watching` so it reappears in the active list. Returns the lightweight update.
 */
const syncCaughtUpShow = async (show: SyncShow): Promise<SyncResult | null> => {
    const details = await getTVDetails(show.tmdb_id)

    if (details.status === 'Ended' || details.status === 'Canceled') return null

    const latestSeasonNumber = details.number_of_seasons || 1

    const seasonData = await getTVSeasonDetails(show.tmdb_id, latestSeasonNumber)

    // TVmaze air times refine which latest-season episodes are really out yet
    const releaseIndex = getReleaseIndex(await getShowAirSchedule(show.tmdb_id))

    // Count released episodes in the latest season using TVmaze airstamps.
    const releasedInSeason = (seasonData.episodes || []).filter((ep: { episode_number: number; air_date?: string }) => {
        return isEpisodeAired(releaseIndex, latestSeasonNumber, ep.episode_number, ep.air_date)
    }).length

    if (releasedInSeason === 0) return null

    // Count how many of those latest-season episodes the user has watched.
    const { count: watchedCount } = await supabase
        .from('watchlist_episodes')
        .select('*', { count: 'exact', head: true })
        .eq('watchlist_id', show.id)
        .eq('season_number', latestSeasonNumber)

    const watched = watchedCount || 0

    // If there are released episodes the user hasn't watched, move back to watching.
    if (releasedInSeason > watched) {
        const nowIso = new Date().toISOString()
        const totalReleasedEpisodes = await countReleasedEpisodesAcrossSeasons(show.tmdb_id)

        const { error } = await supabase
            .from('watchlist')
            .update({
                status: 'watching',
                total_episodes: totalReleasedEpisodes,
                last_season_check: nowIso,
                updated_at: nowIso
            })
            .eq('id', show.id)

        if (error) {
            console.error(`Failed to move caught_up show ${show.id} back to watching:`, error)
            return null
        }

        return {
            id: show.id,
            status: 'watching',
            total_episodes: totalReleasedEpisodes,
            last_season_check: nowIso,
            updated_at: nowIso,
        }
    }

    return null
}

/**
 * Fetch all TV shows for the user with pagination.
 */
const fetchUserTVShows = async (userId: string): Promise<SyncShow[]> => {
    const allShows: SyncShow[] = []
    let hasMore = true
    let page = 0
    const pageSize = 1000
    while (hasMore) {
        const { data, error } = await supabase
            .from('watchlist')
            .select('id, tmdb_id, status, last_season_check')
            .eq('user_id', userId)
            .in('media_type', ['tv'])
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error) {
            console.error('useDailyTVSync: failed to fetch watchlist:', error)
            return []
        }
        if (data) {
            allShows.push(...data)
            if (data.length < pageSize) hasMore = false
        } else {
            hasMore = false
        }
        page++
    }
    return allShows
}

/**
 * Process a group of shows in batches, calling the appropriate sync function
 * for each. Returns collected results after all batches complete.
 */
const processSyncShows = async (
    shows: SyncShow[],
    syncFn: (show: SyncShow) => Promise<SyncResult | null>,
): Promise<SyncResult[]> => {
    const collected: (SyncResult | null)[] = []
    for (let i = 0; i < shows.length; i += SYNC_BATCH_SIZE) {
        const batch = shows.slice(i, i + SYNC_BATCH_SIZE)
        const results = await Promise.allSettled(batch.map(syncFn))
        for (const r of results) {
            if (r.status === 'fulfilled') collected.push(r.value)
        }
        if (i + SYNC_BATCH_SIZE < shows.length) {
            await delay(SYNC_BATCH_DELAY_MS)
        }
    }
    return collected.filter((u): u is SyncResult => u != null)
}

/**
 * Apply collected sync results to the Zustand store via `applySyncUpdates`.
 */
const applyResults = (results: SyncResult[]) => {
    if (results.length === 0) return
    const updates = results.map((u) => ({
        id: u.id,
        status: u.status,
        ...(u.total_episodes != null ? { total_episodes: u.total_episodes } : {}),
        ...(u.last_season_check != null ? { last_season_check: u.last_season_check } : {}),
        ...(u.updated_at != null ? { updated_at: u.updated_at } : {}),
    }))
    useLibraryStore.getState().applySyncUpdates(updates)
}

/**
 * Background TV sync hook.
 *
 * Performs two complementary syncs:
 *
 * 1. **Daily sweep** (once per UTC day on mount): Full sync that refreshes
 *    episode counts for `watching` shows and moves `caught_up` shows back to
 *    `watching` when new episodes air. Bounded by the `last_season_check`
 *    UTC-date gate to avoid re-processing shows already checked today.
 *
 * 2. **Tab-focus refresh** (on `visibilitychange`): Lightweight sync that only
 *    recalculates `total_episodes` for `watching` shows. No DB writes, no status
 *    transitions. Ensures the "episodes left" badge stays accurate when the user
 *    switches back to the app after an episode airs during the day.
 */
export const useDailyTVSync = (userId: string | null) => {
    const isInitialized = useLibraryStore((state) => state.isInitialized)

    // Lightweight episode-count refresh for watching shows only.
    // Runs on tab focus — no DB writes, no status transitions, just updates the
    // in-memory badge count so the TVShows page shows accurate episode counts.
    const refreshCounts = useCallback(async () => {
        if (!userId || !isInitialized) return

        const allShows = await fetchUserTVShows(userId)
        if (allShows.length === 0) return

        const watching = allShows.filter(s => s.status === 'watching')
        if (watching.length === 0) return

        const results = await processSyncShows(watching, (show) =>
            syncWatchingShow(show, true)
        )
        applyResults(results)
    }, [userId, isInitialized])

    useEffect(() => {
        if (!userId || !isInitialized) return

        let cancelled = false

        const sweep = async (scope: 'daily' | 'focus') => {
            const allShows = await fetchUserTVShows(userId)
            if (allShows.length === 0 || cancelled) return

            // Daily: process watching + caught_up, gated by last_season_check.
            // Focus: watching (no gate) + caught_up (no gate) — always refresh
            // episode counts and move newly-available caught_up shows back to watching.
            const watching = allShows.filter(s =>
                s.status === 'watching' &&
                (scope === 'focus' || isDueForSync(s.last_season_check))
            )
            const caughtUp = allShows.filter(s =>
                s.status === 'caught_up' &&
                (scope === 'focus' || isDueForSync(s.last_season_check))
            )

            const watchingResults = await processSyncShows(watching, (show) =>
                syncWatchingShow(show, scope === 'focus')
            )
            if (cancelled) return

            const caughtUpResults = await processSyncShows(caughtUp, syncCaughtUpShow)
            if (cancelled) return

            applyResults([...watchingResults, ...caughtUpResults])
        }

        // Full daily sweep on mount
        void sweep('daily').catch(err => {
            console.error('useDailyTVSync: sweep failed:', err)
        })

        // Lightweight episode-count refresh when the user returns to the tab.
        // Only recalculates total_episodes for watching shows — no DB writes,
        // no status transitions, just in-memory badge updates.
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                void sweep('focus').catch(err => {
                    console.error('useDailyTVSync: focus refresh failed:', err)
                })
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            cancelled = true
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [userId, isInitialized, refreshCounts])
}

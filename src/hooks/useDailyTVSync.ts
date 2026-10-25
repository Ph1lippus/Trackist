import { useEffect } from 'react'
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
    /** Stored released-episode count, used to skip unchanged writes. */
    total_episodes?: number | null
}

// Lightweight result of a single show's sync — the fields the sweep computed
// that need to be reflected back in the in-memory store. Passed to the store's
// `applySyncUpdates` in one batched call at the end of the sweep.
interface SyncResult {
    id: string
    status: 'watching' | 'caught_up' | 'completed' | 'dropped' | 'planning' | 'paused'
    total_episodes?: number
    last_season_check?: string
    updated_at?: string
}

const WATCH_STATUSES = ['watching', 'caught_up', 'completed', 'dropped', 'planning', 'paused'] as const

/**
 * Echo the show's real status back to the store.
 *
 * `syncWatchingShow` hardcoded 'watching' because it only ever ran against
 * `watching` rows, and `applySyncUpdates` writes `status` unconditionally.
 * Reusing it for the count refresh across every TV show would therefore have
 * dragged Paused / Finished / Dropped entries into "Currently Watching".
 * Unrecognised values fall back to 'watching' so a status added to the database
 * later can never blank the field.
 */
const statusOf = (status: string): SyncResult['status'] =>
    (WATCH_STATUSES as readonly string[]).includes(status) ? (status as SyncResult['status']) : 'watching'

const SYNC_BATCH_SIZE = 5
const SYNC_BATCH_DELAY_MS = 150

/**
 * User id whose badge counts have already been recomputed this session.
 *
 * Module scope rather than component state because `useDailyTVSync` is mounted
 * at the app root but its effect re-runs on identity changes; this keeps the
 * mount refresh to once per session per user instead of once per mount.
 */
// let countsRefreshedFor: string | null = null

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
 * single show. Also serves as the daily status check. Returns the
 * lightweight in-memory update (or null for ended shows) rather than going
 * through the full store refresh pipeline.
 *
 * `show.status` is echoed back unchanged - see `statusOf`. Only `watching` rows
 * are persisted, via the `.eq('status', 'watching')` guard on each update.
 *
 * When `refreshOnly` is true, only the in-memory episode count is updated —
 * no DB writes are made, keeping the operation cheap for count refreshes.
 */
const syncWatchingShow = async (show: SyncShow, refreshOnly = false): Promise<SyncResult | null> => {
    const details = await getTVDetails(show.tmdb_id)

    if (details.status === 'Ended' || details.status === 'Canceled') {
        if (refreshOnly) {
            return {
                id: show.id,
                status: statusOf(show.status),
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
            status: statusOf(show.status),
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
        status: statusOf(show.status),
        total_episodes: totalReleasedEpisodes,
        last_season_check: lastSeasonCheck,
    }
}

/**
 * Recompute the released-episode count backing the "+N episodes left" badge.
 *
 * Deliberately separate from `syncWatchingShow` rather than reusing it with a
 * flag: that function carries daily-sweep semantics (watching-only persistence,
 * status transitions), while this one is a pure, idempotent count refresh that
 * may run for any show and must never change a show's status.
 *
 * Two properties keep this cheap enough to run on every page load:
 *
 *  - **Finished shows short-circuit.** A series TMDB reports as Ended/Canceled
 *    can never gain another released episode, so its stored count is already
 *    final and the season-by-season fan-out is skipped entirely. This removes
 *    the long tail of completed shows from every load.
 *  - **Only genuine changes are persisted.** The stored column converges to the
 *    correct value and then stays quiet, so steady state costs zero writes.
 *    `updated_at` has no database trigger, so this cannot reshuffle the library.
 */
// const refreshShowCount = async (show: SyncShow): Promise<SyncResult | null> => {
//     const details = await getTVDetails(show.tmdb_id)
//     const hasStoredCount = typeof show.total_episodes === 'number' && show.total_episodes > 0

//     if ((details.status === 'Ended' || details.status === 'Canceled') && hasStoredCount) {
//         return { id: show.id, status: statusOf(show.status) }
//     }

//     const totalReleasedEpisodes = await countReleasedEpisodesAcrossSeasons(show.tmdb_id)

//     if (totalReleasedEpisodes !== show.total_episodes) {
//         const { error } = await supabase
//             .from('watchlist')
//             .update({ total_episodes: totalReleasedEpisodes })
//             .eq('id', show.id)

//         if (error) {
//             // Not fatal: the in-memory badge still gets corrected below.
//             console.error(`Failed to persist episode count for ${show.id}:`, error)
//         }
//     }

//     return { id: show.id, status: statusOf(show.status), total_episodes: totalReleasedEpisodes }
// }

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
            .select('id, tmdb_id, status, last_season_check, total_episodes')
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
 *
 * `onBatch` is invoked with each batch's results as soon as that batch settles,
 * so callers can surface progress incrementally instead of blocking on the whole
 * library.
 */
const processSyncShows = async (
    shows: SyncShow[],
    syncFn: (show: SyncShow) => Promise<SyncResult | null>,
    onBatch?: (results: SyncResult[]) => void,
): Promise<SyncResult[]> => {
    const collected: (SyncResult | null)[] = []
    for (let i = 0; i < shows.length; i += SYNC_BATCH_SIZE) {
        const batch = shows.slice(i, i + SYNC_BATCH_SIZE)
        const results = await Promise.allSettled(batch.map(syncFn))
        const settled: SyncResult[] = []
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value != null) {
                collected.push(r.value)
                settled.push(r.value)
            }
        }
        if (onBatch && settled.length > 0) onBatch(settled)
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
 * Performs three complementary syncs:
 *
 * 1. **Daily sweep** (once per UTC day on mount): Full sync that refreshes
 *    episode counts for `watching` shows and moves `caught_up` shows back to
 *    `watching` when new episodes air. Bounded by the `last_season_check`
 *    UTC-date gate to avoid re-processing shows already checked today.
 *
 * 2. **Count refresh on mount** (once per session): Ungated, in-memory-only
 *    recomputation of the "+N episodes left" badge for every TV show. This is
 *    what keeps the badge honest on a page load, because the server-side
 *    `check-new-seasons` cron writes the same `last_season_check` field the
 *    daily sweep gates on - without ever recomputing counts - so the sweep
 *    alone can legitimately skip every show for the rest of the day.
 *
 * 3. **Tab-focus refresh** (on `visibilitychange`): Same lightweight
 *    `watching`/`caught_up` sync as the daily sweep but ungated, so a newly
 *    aired episode is picked up while the app is already open.
 */
export const useDailyTVSync = (userId: string | null) => {
    const isInitialized = useLibraryStore((state) => state.isInitialized)

    /**
     * Lightweight, in-memory episode-count refresh for every TV show.
     *
     * No status transitions - this only recomputes `total_episodes`, so it can
     * run freely and is safe to apply to shows in any state.
     *
     * Covers every show, not just `watching` ones: the "+N episodes left" badge
     * is rendered in the Paused / Not started / Finished / Dropped sections too,
     * and refreshing only `watching` leaves those permanently stale.
     */
    // const refreshCounts = useCallback(async (    ) => {
    //     if (!userId || !isInitialized) return

    //     const allShows = await fetchUserTVShows(userId)
    //     if (allShows.length === 0) return

    //     // Actively-watched shows first. They are the ones most likely to change
    //     // (new episodes airing) and the ones the user is looking at, so they
    //     // should not sit on a stale badge behind a long tail of finished series.
    //     const order = (s: SyncShow): number => (s.status === 'watching' ? 0 : s.status === 'caught_up' ? 1 : 2)
    //     const prioritised = [...allShows].sort((a, b) => order(a) - order(b))

    //     // Apply each batch as it settles rather than once at the very end. Each show
    //     // costs a details lookup, a TVmaze schedule and one request per season, so
    //     // a full-library pass takes long enough that applying only at the end
    //     // would leave every badge on its stale stored count until the whole
    //     // library had finished.
    //     await processSyncShows(
    //         prioritised,
    //         refreshShowCount,
    //         (batch) => applyResults(batch)
    //     )
    // }, [userId, isInitialized])

    useEffect(() => {
        if (!userId || !isInitialized) return

        let cancelled = false

        const sweep = async (scope: 'daily' | 'focus') => {
            const allShows = await fetchUserTVShows(userId)
            if (allShows.length === 0 || cancelled) return

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

        // Lightweight episode-count refresh when the user returns to the tab.
        // Only recalculates total_episodes for watching shows — no DB writes,
        // no status transitions, just in-memory badge updates.
        // The heavy daily sweep and full count refresh are intentionally NOT run
        // on mount so that opening/refreshing the page isn't blocked by hundreds
        // of TMDB/TVmaze API calls. Server-side cron jobs (check-new-seasons,
        // notify-new-content) already keep the data fresh while you're away.
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
    }, [userId, isInitialized])
}

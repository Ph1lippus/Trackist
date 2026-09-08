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
 */
const syncWatchingShow = async (show: SyncShow): Promise<SyncResult | null> => {
    const details = await getTVDetails(show.tmdb_id)

    if (details.status === 'Ended' || details.status === 'Canceled') {
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
    const releasedInSeason = (seasonData.episodes || []).filter((ep: { episode_number: number }) => {
        return isEpisodeAired(releaseIndex, latestSeasonNumber, ep.episode_number)
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
 * One-time-per-UTC-day background sweep over the user's TV watchlist.
 *
 * - Refreshes the "episodes left" badge for `watching` shows (recalcs the
 *   released-episode count).
 * - Moves `caught_up` shows back to `watching` when a new released
 *   episode is available.
 *
 * Runs on the first open of the app each UTC day, bounded to ~once per show per
 * day via the `last_season_check` UTC-date gate, and rate-limited across batched
 * concurrency to avoid hammering the TMDB proxy.
 *
 * Deliberately NOT re-run on tab focus/visibility: returning to a tab should
 * never trigger a re-verify of the whole library. The once-per-UTC-day mount
 * sweep — plus the per-show `last_season_check` gate — is enough to catch
 * newly-airing episodes when the app is actually opened on a new day.
 */
export const useDailyTVSync = (userId: string | null) => {
    const isInitialized = useLibraryStore((state) => state.isInitialized)

    useEffect(() => {
        if (!userId || !isInitialized) return

        let cancelled = false

        const sweep = async () => {
            // Fetch the user's TV shows once; filter by our scopes on the client.
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
                s => s.status === 'caught_up' && isDueForSync(s.last_season_check)
            )

            // Process batches with small concurrency to stay TMDB-friendly,
            // collecting lightweight updates to apply to the store in one pass at
            // the end (instead of a heavy cache-invalidating refresh per show).
            const collected: (SyncResult | null)[] = []
            for (const group of [watching, caughtUp]) {
                for (let i = 0; i < group.length; i += SYNC_BATCH_SIZE) {
                    const batch = group.slice(i, i + SYNC_BATCH_SIZE)
                    const results = await Promise.allSettled(
                        batch.map(show =>
                            show.status === 'watching'
                                ? syncWatchingShow(show)
                                : syncCaughtUpShow(show)
                        )
                    )
                    for (const r of results) {
                        if (r.status === 'fulfilled') collected.push(r.value)
                    }
                    if (i + SYNC_BATCH_SIZE < group.length) {
                        await delay(SYNC_BATCH_DELAY_MS)
                    }
                }
            }

            if (cancelled) return

            const updates = collected.filter(
                (u): u is SyncResult => u != null
            ).map((u) => ({
                id: u.id,
                status: u.status,
                ...(u.total_episodes != null ? { total_episodes: u.total_episodes } : {}),
                ...(u.last_season_check != null ? { last_season_check: u.last_season_check } : {}),
                ...(u.updated_at != null ? { updated_at: u.updated_at } : {}),
            }))

            if (updates.length > 0) {
                useLibraryStore.getState().applySyncUpdates(updates)
            }
        }

        void sweep().catch(err => {
            console.error('useDailyTVSync: sweep failed:', err)
        })

        return () => {
            cancelled = true
        }
    }, [userId, isInitialized])
}

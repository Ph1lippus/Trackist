import { getExternalIds } from './tmdbService'
import { cacheService } from './cacheService'
import { getUTCTodayString } from '../utils/dateUtils'


/**
 * TVmaze air-time lookup for precise "is this episode out yet" gating.
 *
 * TMDB episode data only carries a calendar date (air_date) with no time of
 * day, so an episode that airs at, say, 8pm is indistinguishable from one that
 * aired at midnight. TVmaze publishes a per-episode `airstamp` (an exact
 * instant including timezone) for airing shows, which lets the app unlock an
 * episode exactly when it goes out instead of at the local start of its air
 * date.
 *
 * One `/shows/{id}/episodes` call returns the whole series schedule, so the
 * result is cached per show (memory + IndexedDB via cacheService). When a show
 * or episode has no airstamp yet (not on TVmaze, or time still TBA) callers
 * fall back to the existing date-only rule through isEpisodeAired().
 */

export interface AirstampEpisode {
    season: number
    episode: number
    /** Exact release instant as an ISO timestamp (with timezone), or null when unknown. */
    airstamp: string | null
}

export interface ShowAirSchedule {
    episodes: AirstampEpisode[]
}

// 12h: aired times are stable, but scheduled times for upcoming episodes shift.
const AIRSTAMP_TTL = 12 * 60 * 60 * 1000

// Empty schedules (show absent from TVmaze, or a transient failure) are cached
// only briefly so a hiccup can't freeze every caller into assuming nothing is out.
const EMPTY_SCHEDULE_TTL = 30 * 60 * 1000

// External IDs (IMDB etc.) are stable for the lifetime of a show — cache them
// aggressively to skip the TMDB round-trip on repeat visits.
const EXTERNAL_ID_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

// Dedupe concurrent fetches within the session so a burst of consumers for the
// same show only triggers a single network round-trip.
const inflight = new Map<number, Promise<ShowAirSchedule>>()

/**
 * Fetch the IMDB ID for a show, caching the result to skip the TMDB
 * round-trip on subsequent visits. IMDB IDs are stable for released shows.
 */
async function getImdbId(tmdbId: number): Promise<string | null> {
    const cached = await cacheService.get<{ imdb_id?: string }>(
        'tvmaze:external-ids', tmdbId,
    )
    if (cached) return cached.imdb_id ?? null

    try {
        const external = await getExternalIds(tmdbId, 'tv')
        await cacheService.set('tvmaze:external-ids', tmdbId, external, EXTERNAL_ID_TTL)
        return external.imdb_id ?? null
    } catch {
        return null
    }
}

async function fetchSchedule(tmdbId: number): Promise<ShowAirSchedule> {
    try {
        const imdbId = await getImdbId(tmdbId)
        if (!imdbId) return { episodes: [] }

        const look = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`)
        if (!look.ok) {
            console.warn('[TVMaze] lookup failed', look.status, look.statusText)
            return { episodes: [] }
        }
        const show = (await look.json()) as { id?: number }
        if (!show.id) return { episodes: [] }

        const res = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`)
        if (!res.ok) {
            console.warn('[TVMaze] episodes fetch failed', res.status, res.statusText)
            return { episodes: [] }
        }
        const entries = (await res.json()) as {
            season?: number
            number?: number | null
            airstamp?: string | null
        }[]

        return {
            episodes: entries.map(entry => ({
                season: entry.season ?? 0,
                episode: entry.number ?? 0,
                airstamp: entry.airstamp ?? null,
            })),
        }
    } catch {
        // Network or TMDB hiccup: treat as "no schedule" so callers keep the
        // date-only fallback instead of failing the surrounding operation.
        return { episodes: [] }
    }
}

/**
 * Full air-time schedule for a show, cached (memory + IndexedDB) for AIRSTAMP_TTL.
 *
 * Uses stale-while-revalidate: when cached data exists but is expired, the stale
 * data is returned immediately and a background refresh updates the cache. This
 * keeps Calendar, TVShowDetail, and MobileTVShows fast on every visit — the first
 * load after cache expiry shows stale data instantly while fresh data arrives
 * within seconds.
 *
 * Never throws; returns an empty schedule when the show has no TVmaze data.
 */
export async function getShowAirSchedule(tmdbId: number): Promise<ShowAirSchedule> {
    // Dedupe concurrent callers for the same show
    const pending = inflight.get(tmdbId)
    if (pending) return pending

    const request = (async () => {
        // Check for any cached data (valid or stale)
        const existing = await cacheService.getAny<ShowAirSchedule>(
            'tvmaze:air-schedule-v2', tmdbId,
        )

        if (existing) {
            const ttl = existing.data.episodes.length > 0 ? AIRSTAMP_TTL : EMPTY_SCHEDULE_TTL
            const isStale = existing.age >= ttl

            if (!isStale) {
                // Cache is fresh — no work needed
                return existing.data
            }

            // Cache is stale — return it immediately, refresh in background
            void refreshSchedule(tmdbId)
            return existing.data
        }

        // No cache at all — must fetch (first visit)
        const fresh = await fetchSchedule(tmdbId)
        await cacheService.set(
            'tvmaze:air-schedule-v2',
            tmdbId,
            fresh,
            fresh.episodes.length > 0 ? AIRSTAMP_TTL : EMPTY_SCHEDULE_TTL,
        )
        return fresh
    })()

    inflight.set(tmdbId, request)
    void request.finally(() => inflight.delete(tmdbId))
    return request
}

/**
 * Background refresh — updates the cache without blocking the caller.
 * Separate from getShowAirSchedule so the inflight dedup map doesn't
 * interfere with the foreground stale-while-revalidate flow.
 */
async function refreshSchedule(tmdbId: number): Promise<void> {
    try {
        const fresh = await fetchSchedule(tmdbId)
        await cacheService.set(
            'tvmaze:air-schedule-v2',
            tmdbId,
            fresh,
            fresh.episodes.length > 0 ? AIRSTAMP_TTL : EMPTY_SCHEDULE_TTL,
        )
    } catch {
        // Background refresh failed — stale data is already in use, no action needed
    }
}

/**
 * Pre-parsed lookup of "${season}-${episode}" -> release timestamp (ms).
 * Episodes without an airstamp are omitted so isEpisodeAired falls back.
 */
export function getReleaseIndex(schedule: ShowAirSchedule | null | undefined): Map<string, number> {
    const index = new Map<string, number>()
    if (!schedule) return index
    for (const entry of schedule.episodes) {
        if (!entry.airstamp || entry.season <= 0 || entry.episode <= 0) continue
        const ts = new Date(entry.airstamp).getTime()
        if (!Number.isNaN(ts)) index.set(`${entry.season}-${entry.episode}`, ts)
    }
    return index
}

/** Whole days between two YYYY-MM-DD strings (positive when `a` is later). */
const dayGap = (a: string, b: string): number => {
    const toUtcMs = (value: string): number => {
        const [y, m, d] = value.split('-').map(Number)
        return Date.UTC(y, (m || 1) - 1, d || 1)
    }
    const gap = toUtcMs(a) - toUtcMs(b)
    return Number.isFinite(gap) ? Math.round(gap / 86_400_000) : 0
}

/**
 * Airstamps carry a timezone while TMDB's `air_date` is a bare calendar date, so
 * an episode broadcast late in the evening can legitimately land on an adjacent
 * UTC day. Anything further apart than that is not a timezone artifact.
 */
const SAME_EPISODE_MAX_DAY_GAP = 1

/**
 * True when a TVmaze airstamp genuinely refers to the episode identified by
 * `fallbackAirDate`, i.e. the two sources agree on *which* episode this is.
 *
 * Both schedules are keyed "season-episode", but the two sites do not always
 * agree on what those numbers mean. TMDB follows the original broadcast order
 * and may merge or split whole story arcs, while TVmaze follows its own
 * editorial split. Lupin (TMDB 96677) is the clearest case:
 *
 *   TMDB    Season 1 = Part 1 + Part 2 merged (10 eps)
 *           Season 2 = Part 3 (7 eps), Season 3 = Part 4 (8 eps, unaired)
 *   TVmaze  Season 1 = Part 1 (5), Season 2 = Part 2 (5),
 *           Season 3 = Part 3 (7), Season 4 = Part 4
 *
 * So a lookup of "3-1" returns Part 3 Chapter 1's 2023 airstamp while TMDB means
 * the first episode of Part 4, unreleased until 2026-10-23. Without this check
 * the airstamp marks an unaired episode as long released, which inflates the
 * "episodes left" count and can revive an unaired season as newly available.
 *
 * Air dates are the stronger evidence here precisely because they stay
 * self-consistent within TMDB's own numbering; the airstamp is only the more
 * precise refinement *within* a confirmed episode.
 */
function airstampMatchesEpisode(airstampMs: number, airDate: string | undefined): boolean {
    if (!airDate) return true
    const airstampDay = new Date(airstampMs).toISOString().slice(0, 10)
    return Math.abs(dayGap(airstampDay, airDate)) <= SAME_EPISODE_MAX_DAY_GAP
}

/**
 * True when the episode is available to watch.
 *
 * The airstamp refines the release to the minute, but only once it is confirmed
 * to describe the same episode (see `airstampMatchesEpisode`). When it does
 * not - or when TVmaze has no time for it - this falls back to TMDB's date-only
 * rule, which is correct for any show whose season numbering lines up and for
 * every show TVmaze doesn't cover at all.
 */
export function isEpisodeAired(
    releaseIndex: Map<string, number>,
    season: number,
    episode: number,
    fallbackAirDate?: string
): boolean {
    const ts = releaseIndex.get(`${season}-${episode}`)
    if (ts !== undefined && airstampMatchesEpisode(ts, fallbackAirDate)) return Date.now() >= ts
    // Either TVmaze has no airstamp for this coordinate, or the one it has
    // belongs to a differently-numbered episode. Both cases fall through to
    // TMDB's date-only rule, when the caller supplied an air_date.
    if (fallbackAirDate) return fallbackAirDate <= getUTCTodayString()
    return false
}

/**
 * Exact release instant for a single episode, or null when TVmaze has no time
 * for it (caller should fall back to the date-only rule).
 *
 * Applies the same same-episode check as `isEpisodeAired`: pass TMDB's `airDate`
 * for the episode so a coordinate belonging to a differently-numbered episode
 * is reported as unknown rather than as a wrong release time. Omitting it keeps
 * the previous, unguarded behaviour.
 */
export async function getEpisodeReleaseTimestamp(
    tmdbId: number,
    season: number,
    episode: number,
    airDate?: string
): Promise<Date | null> {
    const schedule = await getShowAirSchedule(tmdbId)
    const ts = getReleaseIndex(schedule).get(`${season}-${episode}`)
    if (ts === undefined) return null
    if (!airstampMatchesEpisode(ts, airDate)) return null
    return new Date(ts)
}

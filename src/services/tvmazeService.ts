import { getExternalIds } from './tmdbService'
import { getCachedOrFetch } from './cacheService'


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

// Dedupe concurrent fetches within the session so a burst of consumers for the
// same show only triggers a single network round-trip.
const inflight = new Map<number, Promise<ShowAirSchedule>>()

async function fetchSchedule(tmdbId: number): Promise<ShowAirSchedule> {
    try {
        const external = await getExternalIds(tmdbId, 'tv')
        if (!external?.imdb_id) return { episodes: [] }

        const look = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${external.imdb_id}`)
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
 * Never throws; returns an empty schedule when the show has no TVmaze data.
 */
export async function getShowAirSchedule(tmdbId: number): Promise<ShowAirSchedule> {
    const pending = inflight.get(tmdbId)
    if (pending) return pending

    const request = getCachedOrFetch(
        'tvmaze:air-schedule-v1',
        tmdbId,
        () => fetchSchedule(tmdbId),
        { ttl: AIRSTAMP_TTL }
    )
    inflight.set(tmdbId, request)
    void request.finally(() => inflight.delete(tmdbId))
    return request
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

/**
 * True when the episode is available to watch. When the exact airstamp is
 * known the release requires the instant to have passed; otherwise it falls
 * back to TMDB's date-only rule (air_date today or past).
 */
export function isEpisodeAired(
    releaseIndex: Map<string, number>,
    season: number,
    episode: number,
    _fallbackAirDate?: string
): boolean {
    const ts = releaseIndex.get(`${season}-${episode}`)
    if (ts !== undefined) return Date.now() >= ts
    return false
}

/**
 * Exact release instant for a single episode, or null when TVmaze has no time
 * for it (caller should fall back to the date-only rule).
 */
export async function getEpisodeReleaseTimestamp(
    tmdbId: number,
    season: number,
    episode: number
): Promise<Date | null> {
    const schedule = await getShowAirSchedule(tmdbId)
    const ts = getReleaseIndex(schedule).get(`${season}-${episode}`)
    return ts === undefined ? null : new Date(ts)
}
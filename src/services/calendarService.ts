import { supabase } from './supabaseClient'
import { shouldRevalidateByDate } from '../utils/dateUtils'

// Invalidate calendar cache on auth state change
let currentUserId: string | null = null

export const invalidateCalendarCache = (userId: string): void => {
    if (currentUserId && currentUserId !== userId) {
        // User changed, invalidate old cache
        const cacheKey = getCacheKey(currentUserId)
        localStorage.removeItem(cacheKey)
    }
    currentUserId = userId
}

export interface CalendarEpisodeItem {
    id: string
    media_type: 'tv'
    tmdb_id: number
    watchlist_id: string
    title: string
    poster_path: string | null
    air_date: string
    season_number: number
    episode_number: number
    episode_title?: string
    still_path?: string | null
}

export interface CalendarMovieItem {
    id: string
    media_type: 'movie'
    tmdb_id: number
    watchlist_id: string
    title: string
    poster_path: string | null
    release_date: string
}

export type CalendarItem = CalendarEpisodeItem | CalendarMovieItem

const CACHE_PREFIX = 'trackist-calendar'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CalendarCache {
    upcoming: CalendarItem[]
    last_fetched_timestamp: number | null
}

const fetchFromEdgeFunction = async (userId: string): Promise<CalendarItem[]> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) throw new Error('No active session')

    const res = await fetch(`${supabaseUrl}/functions/v1/get-upcoming-calendar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId })
    })

    if (!res.ok) throw new Error(`Calendar fetch failed with status ${res.status}`)

    const data = await res.json()
    return data.upcoming || []
}

const getCacheKey = (userId: string) => `${CACHE_PREFIX}:${userId}`

const readCache = (userId: string): CalendarCache | null => {
    try {
        const raw = localStorage.getItem(getCacheKey(userId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as CalendarCache
        if (!Array.isArray(parsed.upcoming)) return null
        return parsed
    } catch {
        return null
    }
}

const writeCache = (userId: string, upcoming: CalendarItem[]): void => {
    try {
        const cache: CalendarCache = { upcoming, last_fetched_timestamp: Date.now() }
        localStorage.setItem(getCacheKey(userId), JSON.stringify(cache))
    } catch {
        // Storage unavailable — fail silently
    }
}

const isCacheStale = (cache: CalendarCache | null): boolean => {
    if (!cache || !cache.last_fetched_timestamp) return true
    
    // Check if cache is older than TTL
    const isOlderThanTTL = Date.now() - cache.last_fetched_timestamp > CACHE_TTL_MS
    
    // Check if cache was created on a different calendar day (UTC)
    const isDifferentDay = shouldRevalidateByDate(cache.last_fetched_timestamp)
    
    return isOlderThanTTL || isDifferentDay
}

/**
 * Stale-While-Revalidate calendar loader.
 *
 * 1. If cached data exists, resolve with it immediately (0ms delay).
 * 2. If the cache is older than 24h (or missing), quietly revalidate in the
 *    background via the Edge Function. When fresh data arrives, overwrite the
 *    local storage cache, update the timestamp, and call onFreshData so the
 *    UI state updates seamlessly without a full-screen spinner.
 */
export const loadCalendar = (
    userId: string,
    onFreshData: (items: CalendarItem[]) => void
): Promise<CalendarItem[]> => {
    return new Promise((resolve) => {
        const cached = readCache(userId)

        if (cached && !isCacheStale(cached)) {
            resolve(cached.upcoming)
            return
        }

        if (cached) {
            resolve(cached.upcoming)
        }

        fetchFromEdgeFunction(userId)
            .then((fresh) => {
                writeCache(userId, fresh)
                onFreshData(fresh)
                if (!cached) resolve(fresh)
            })
            .catch((err) => {
                console.error('Calendar background revalidation failed:', err)
                if (!cached) {
                    onFreshData([])
                    resolve([])
                }
            })
    })
}
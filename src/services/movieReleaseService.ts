import { supabase } from './supabaseClient'
import { fetchMovieReleaseDates, getCountryReleaseDates } from './tmdbService'
import { getProfile } from './profileService'
import type { WatchlistItem } from '../types'

/**
 * Country-localized movie release dates.
 *
 * TMDB's primary `release_date` on a movie is its home/primary-market date
 * (usually the US), which is not necessarily the day the movie actually
 * reaches the user's country. These helpers resolve the theatrical + digital
 * dates for the user's `profiles.country_code` so the Upcoming calendar, the
 * Movies "Not Released" section, and Release Day alerts all use the local day.
 *
 * The sync-movie-releases edge function applies the exact same rules as a
 * backstop; doing it at add time (and on country change) removes the window
 * where the primary-market date is shown instead.
 */

const DEFAULT_COUNTRY = 'PT'
const RESOLVE_CONCURRENCY = 4

export interface MovieReleaseDates {
    release_date?: string
    digital_release_date?: string
}

export interface LocalizedMovieRow extends MovieReleaseDates {
    id: string
}

/**
 * The ISO-3166 country the user's release dates should be resolved for.
 * Falls back to the schema default ('PT') when the profile can't be read —
 * the same fallback the edge functions use.
 */
export const getUserCountryCode = async (userId: string): Promise<string> => {
    if (!userId) return DEFAULT_COUNTRY
    try {
        const { data, error } = await getProfile(userId)
        if (error || !data) return DEFAULT_COUNTRY
        return String(data.country_code || DEFAULT_COUNTRY).toUpperCase()
    } catch {
        return DEFAULT_COUNTRY
    }
}

/**
 * Resolve the release dates a movie row should carry for this user's country.
 * Never throws: on any TMDB/profile failure it degrades to the caller's
 * fallback (TMDB's primary release date) so adding a movie can't be blocked.
 *
 * Only defined values are returned — callers must not overwrite an existing
 * value with `undefined`.
 */
export const resolveMovieReleaseDates = async (
    userId: string,
    tmdbId: number,
    fallbackReleaseDate?: string
): Promise<MovieReleaseDates> => {
    try {
        const [country, results] = await Promise.all([
            getUserCountryCode(userId),
            fetchMovieReleaseDates(tmdbId),
        ])
        const localized = getCountryReleaseDates(results, country)
        return {
            release_date: localized.theatrical || fallbackReleaseDate,
            digital_release_date: localized.digital,
        }
    } catch (error) {
        console.error(`Failed to resolve country release dates for movie ${tmdbId}:`, error)
        return { release_date: fallbackReleaseDate }
    }
}

/** Map with bounded concurrency so a large watchlist can't burst the proxy. */
const mapWithConcurrency = async <T, R>(
    values: T[],
    worker: (value: T) => Promise<R>,
    concurrency: number
): Promise<R[]> => {
    const results = new Array<R>(values.length)
    let nextIndex = 0
    const run = async () => {
        while (true) {
            const index = nextIndex++
            if (index >= values.length) return
            results[index] = await worker(values[index])
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(concurrency, Math.max(values.length, 1)) }, () => run())
    )
    return results
}

/**
 * Re-resolve release dates for every movie in a user's watchlist. Called after
 * the user changes their country in Settings so existing rows don't keep the
 * previous country's (or the primary market's) theatrical day.
 *
 * Returns only the rows that actually changed, so the caller can patch the
 * in-memory library and clear the calendar cache without a full reload.
 */
export const relocalizeUserMovieDates = async (userId: string): Promise<LocalizedMovieRow[]> => {
    if (!userId) return []

    const country = await getUserCountryCode(userId)

    // Paginated read of the user's movie rows.
    const rows: Pick<WatchlistItem, 'id' | 'tmdb_id' | 'release_date' | 'digital_release_date'>[] = []
    const pageSize = 1000
    let page = 0
    while (true) {
        const { data, error } = await supabase
            .from('watchlist')
            .select('id, tmdb_id, release_date, digital_release_date')
            .eq('user_id', userId)
            .eq('media_type', 'movie')
            .not('tmdb_id', 'is', null)
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error) {
            console.error('Failed to fetch movies for re-localization:', error)
            return []
        }
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < pageSize) break
        page++
    }

    if (rows.length === 0) return []

    const changed: LocalizedMovieRow[] = []

    await mapWithConcurrency(rows, async (row) => {
        if (!row.tmdb_id) return
        try {
            const results = await fetchMovieReleaseDates(row.tmdb_id)
            const localized = getCountryReleaseDates(results, country)

            const update: Record<string, unknown> = {}
            // Keep the current value when TMDB has no entry for this country —
            // wiping it would make the date worse than before.
            if (localized.theatrical && localized.theatrical !== row.release_date) {
                update.release_date = localized.theatrical
            }
            if (localized.digital && localized.digital !== row.digital_release_date) {
                update.digital_release_date = localized.digital
            }
            if (Object.keys(update).length === 0) return

            const { error } = await supabase
                .from('watchlist')
                .update(update)
                .eq('id', row.id)
            if (error) {
                console.error(`Failed to re-localize release dates for watchlist ${row.id}:`, error)
                return
            }

            changed.push({
                id: row.id,
                release_date: typeof update.release_date === 'string' ? update.release_date : undefined,
                digital_release_date: typeof update.digital_release_date === 'string' ? update.digital_release_date : undefined,
            })
        } catch (error) {
            console.error(`Failed to re-localize release dates for movie ${row.tmdb_id}:`, error)
        }
    }, RESOLVE_CONCURRENCY)

    return changed
}


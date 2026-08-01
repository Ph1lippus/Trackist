import { supabase } from './supabaseClient'
import { searchMulti, searchPerson, imageUrl } from './tmdbService'
import { isFollowing } from './profileService'
import { fuzzyFilter } from '../utils/fuzzyMatch'
import type { TMDBResult, UserList } from '../types'
import type {
    BaseSearchResult,
    SearchContextType,
    SearchResultsByKind,
} from '../types/search'

/**
 * Map a TMDB result into a unified search result.
 */
function tmdbToSearchResult(r: TMDBResult, score?: number): BaseSearchResult {
    const isPerson = r.media_type === 'person'
    const title = r.title || r.name || 'Untitled'
    const year = r.release_date || r.first_air_date
    const subtitle = isPerson
        ? r.known_for_department || 'Person'
        : year
            ? new Date(year).getFullYear().toString()
            : r.media_type === 'tv'
                ? 'TV Show'
                : 'Movie'

    return {
        id: r.id,
        kind: (isPerson ? 'person' : (r.media_type as 'movie' | 'tv')) ?? 'movie',
        title,
        subtitle,
        image: isPerson ? r.profile_path ?? null : r.poster_path ?? null,
        tmdbResult: r,
        score,
    }
}

/**
 * Context A — Discover: global scope across Movies, TV, People, and Public User Lists.
 * Uses TMDB multi + person search, then applies fuzzy post-filtering for typo tolerance.
 */
async function searchDiscover(
    query: string,
    signal: AbortSignal,
    maxPerKind: number
): Promise<BaseSearchResult[]> {
    // TMDB search (multi + person in parallel)
    const [multiRes, personRes] = await Promise.all([
        searchMulti(query, 1),
        searchPerson(query, 1),
    ])

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    let combined: TMDBResult[] = [
        ...((multiRes as { results?: TMDBResult[] }).results || []),
        ...((personRes as { results?: TMDBResult[] }).results || []),
    ]

    // Deduplicate by id
    const seen = new Set<number>()
    combined = combined.filter(item => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })

    // Normalize media_type
    combined = combined.map(r => {
        if (r.profile_path && !r.title && !r.media_type) {
            return { ...r, media_type: 'person' as const }
        }
        return {
            ...r,
            media_type: r.media_type || (r.title ? 'movie' as const : 'tv' as const),
        }
    })

    // Fuzzy post-filter for typo tolerance
    const scored = fuzzyFilter(query, combined, r => r.title || r.name || '', 0.25)

    // Bucket by kind
    const movies: BaseSearchResult[] = []
    const tv: BaseSearchResult[] = []
    const people: BaseSearchResult[] = []

    for (const { item, score } of scored) {
        const result = tmdbToSearchResult(item, score)
        if (result.kind === 'movie' && movies.length < maxPerKind) movies.push(result)
        else if (result.kind === 'tv' && tv.length < maxPerKind) tv.push(result)
        else if (result.kind === 'person' && people.length < maxPerKind) people.push(result)
    }

    // Also search public user lists from Supabase
    const lists = await searchPublicLists(query, signal, maxPerKind)

    return [...movies, ...tv, ...people, ...lists]
}

/**
 * Context B — Movies / TV Shows / Finished: strict media-type lock.
 * - Movies page: only type === 'movie'
 * - TV Shows page: only type === 'tv'
 * - Finished page: both movie + tv
 */
async function searchMedia(
    query: string,
    signal: AbortSignal,
    maxPerKind: number,
    allowedTypes: Array<'movie' | 'tv'>
): Promise<BaseSearchResult[]> {
    const [multiRes, personRes] = await Promise.all([
        searchMulti(query, 1),
        searchPerson(query, 1),
    ])

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    let combined: TMDBResult[] = [
        ...((multiRes as { results?: TMDBResult[] }).results || []),
        ...((personRes as { results?: TMDBResult[] }).results || []),
    ]

    // Deduplicate
    const seen = new Set<number>()
    combined = combined.filter(item => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })

    // Normalize + STRICT type lock: omit people, lists, cross-media
    combined = combined
        .map(r => ({
            ...r,
            media_type: r.media_type || (r.title ? 'movie' as const : 'tv' as const),
        }))
        .filter(r => allowedTypes.includes(r.media_type as 'movie' | 'tv'))

    // Fuzzy post-filter
    const scored = fuzzyFilter(query, combined, r => r.title || r.name || '', 0.25)

    const results: BaseSearchResult[] = []
    for (const { item, score } of scored) {
        if (results.length >= maxPerKind * allowedTypes.length) break
        results.push(tmdbToSearchResult(item, score))
    }

    return results
}

/**
 * Context C — Friends: social directory. Internal DB only (profiles table).
 * Searches display_name and friendship status.
 */
async function searchFriends(
    query: string,
    signal: AbortSignal,
    maxPerKind: number
): Promise<BaseSearchResult[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!user) return []

    const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .ilike('display_name', `%${query}%`)
        .neq('id', user.id)
        .limit(20)

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (error || !data) return []

    // Fuzzy post-filter for typo tolerance on usernames/handles
    const scored = fuzzyFilter(query, data, p => p.display_name || '', 0.25)

    // Resolve following status for top results
    const top = scored.slice(0, maxPerKind)
    const results: BaseSearchResult[] = await Promise.all(
        top.map(async ({ item, score }) => {
            const following = await isFollowing(user.id, item.id)
            return {
                id: item.id,
                kind: 'user' as const,
                title: item.display_name || 'Anonymous',
                subtitle: following ? 'Following' : 'Not following',
                image: item.avatar_url ?? null,
                userRecord: { ...item, is_following: following },
                score,
            }
        })
    )

    return results
}

/**
 * Context D — Lists: personal/curated asset filter.
 * Searches public lists + the current user's own lists.
 */
async function searchLists(
    query: string,
    signal: AbortSignal,
    maxPerKind: number
): Promise<BaseSearchResult[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!user) return []

    // User's own lists
    const { data: ownLists } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Public lists by anyone
    const { data: publicLists } = await supabase
        .from('lists')
        .select('*')
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(50)

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Merge + dedupe (own lists take priority)
    const seen = new Set<string>()
    const merged: UserList[] = []
    for (const list of [...(ownLists || []), ...(publicLists || [])]) {
        if (seen.has(list.id)) continue
        seen.add(list.id)
        merged.push(list)
    }

    // Fuzzy filter on title + description
    const scored = fuzzyFilter(
        query,
        merged,
        l => `${l.title} ${l.description || ''}`,
        0.25
    )

    return scored.slice(0, maxPerKind).map(({ item, score }) => ({
        id: item.id,
        kind: 'list' as const,
        title: item.title,
        subtitle: item.is_public ? 'Public list' : 'Private list',
        listRecord: item,
        score,
    }))
}

/**
 * Search only public lists (used by the Discover context).
 */
async function searchPublicLists(
    query: string,
    signal: AbortSignal,
    maxPerKind: number
): Promise<BaseSearchResult[]> {
    const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('is_public', true)
        .ilike('title', `%${query}%`)
        .order('updated_at', { ascending: false })
        .limit(maxPerKind)

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (error || !data) return []

    return data.map((list, idx) => ({
        id: list.id,
        kind: 'list' as const,
        title: list.title,
        subtitle: 'Public list',
        listRecord: list,
        score: 1 - idx * 0.05,
    }))
}

/**
 * Public entry point: run a context-aware search.
 * The caller is responsible for passing an AbortSignal so that
 * in-flight requests can be cancelled on new keystrokes.
 */
export async function runSearch(
    query: string,
    context: SearchContextType,
    signal: AbortSignal,
    maxPerKind = 6
): Promise<BaseSearchResult[]> {
    switch (context) {
        case 'discover':
            return searchDiscover(query, signal, maxPerKind)
        case 'movies':
            return searchMedia(query, signal, maxPerKind, ['movie'])
        case 'tvshows':
            return searchMedia(query, signal, maxPerKind, ['tv'])
        case 'finished':
            return searchMedia(query, signal, maxPerKind, ['movie', 'tv'])
        case 'friends':
            return searchFriends(query, signal, maxPerKind)
        case 'lists':
            return searchLists(query, signal, maxPerKind)
        default:
            return []
    }
}

/**
 * Group flat results by kind for UI rendering.
 */
export function groupResultsByKind(results: BaseSearchResult[]): SearchResultsByKind {
    const grouped: SearchResultsByKind = {
        movies: [],
        tv: [],
        people: [],
        users: [],
        lists: [],
    }
    for (const r of results) {
        switch (r.kind) {
            case 'movie':
                grouped.movies.push(r)
                break
            case 'tv':
                grouped.tv.push(r)
                break
            case 'person':
                grouped.people.push(r)
                break
            case 'user':
                grouped.users.push(r)
                break
            case 'list':
                grouped.lists.push(r)
                break
        }
    }
    return grouped
}

/**
 * Resolve the image URL for a search result (TMDB path or raw URL).
 */
export function getResultImageUrl(result: BaseSearchResult): string | null {
    if (!result.image) return null
    // User avatars are stored as full URLs in Supabase storage
    if (result.kind === 'user') return result.image
    // TMDB paths are relative and need the image base
    return imageUrl(result.image)
}
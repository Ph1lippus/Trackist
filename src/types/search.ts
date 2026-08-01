import type { TMDBResult, UserList } from './index'

/**
 * The page contexts that the unified search engine understands.
 * The active context is derived from the router location and drives
 * the search scope, data sources, and result layout.
 */
export type SearchContextType =
    | 'discover'
    | 'movies'
    | 'tvshows'
    | 'finished'
    | 'friends'
    | 'lists'

/**
 * A single unified search result item. The `kind` field tells the UI
 * which renderer to use (media card vs. person row vs. user row vs. list row).
 */
export type SearchResultKind = 'movie' | 'tv' | 'person' | 'user' | 'list'

export interface BaseSearchResult {
    id: string | number
    kind: SearchResultKind
    title: string
    /** Secondary text shown under the title (year, department, handle, etc.) */
    subtitle?: string
    /** Image path (TMDB poster/profile path or avatar URL) */
    image?: string | null
    /** Raw TMDB result when the item originates from TMDB */
    tmdbResult?: TMDBResult
    /** Raw user record when the item originates from the profiles table */
    userRecord?: {
        id: string
        display_name: string | null
        avatar_url: string | null
        is_following?: boolean
    }
    /** Raw list record when the item originates from the lists table */
    listRecord?: UserList
    /** Relevance score from fuzzy matching (higher = better) */
    score?: number
}

export interface SearchResultsByKind {
    movies: BaseSearchResult[]
    tv: BaseSearchResult[]
    people: BaseSearchResult[]
    users: BaseSearchResult[]
    lists: BaseSearchResult[]
}

export interface SearchState {
    query: string
    context: SearchContextType
    isLoading: boolean
    results: BaseSearchResult[]
    error: string | null
    /** True when the query is below the min-character limit */
    belowMinChars: boolean
}

export interface SearchConfig {
    /** Debounce delay in ms (strictly 250ms per spec) */
    debounceMs: number
    /** Minimum characters before real-time execution (>= 3 per spec) */
    minChars: number
    /** Maximum results to keep per kind for dropdown display */
    maxPerKind: number
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
    debounceMs: 250,
    minChars: 3,
    maxPerKind: 6,
}
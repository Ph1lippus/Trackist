import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '../services/supabaseClient'
import type { TMDBResult } from '../types'
import type { GridStateSnapshot } from 'react-virtuoso'
import {
    searchMulti,
    searchPerson,
    getPersonMovies,
    getPersonTV,
    getPopularPeople,
    discoverMovies,
    discoverTV,
    getGenres,
} from '../services/tmdbService'
import { getCachedOrFetch } from '../services/cacheService'

export type SortBy =
    | 'popularity.desc'
    | 'popularity.asc'
    | 'vote_average.desc'
    | 'vote_average.asc'
    | 'release_date.desc'
    | 'release_date.asc'
    | 'original_title.asc'
    | 'original_title.desc'

export type MediaType = 'all' | 'movie' | 'tv' | 'person'

export interface DiscoverFilters {
    mediaType: MediaType
    sortBy: SortBy
    selectedGenre: number | null
    selectedYear: number | null
    query: string
}

interface DiscoverState extends DiscoverFilters {
    // Data
    results: TMDBResult[]
    page: number
    hasMore: boolean
    totalPages: number

    // Tracks which filter signature the current data corresponds to.
    // Prevents refetching when returning from a detail page.
    loadedFilterKey: string

    // Loading flags
    isLoading: boolean
    isLoadingMore: boolean
    isDataLoaded: boolean

    // Watchlist
    watchlistIds: Set<number>

    // Genres
    genres: { id: number; name: string }[]

    // Virtuoso grid state for scroll restoration
    virtuosoState: GridStateSnapshot | null

    // Actions
    setQuery: (query: string) => void
    setMediaType: (mediaType: MediaType) => void
    setSortBy: (sortBy: SortBy) => void
    setSelectedGenre: (genre: number | null) => void
    setSelectedYear: (year: number | null) => void
    setVirtuosoState: (state: GridStateSnapshot | null) => void
    addToWatchlist: (id: number, item?: TMDBResult) => Promise<void>
    removeFromWatchlist: (id: number) => Promise<void>
    resetFilters: () => void
    reset: () => void
    fetchData: (pageNum?: number) => Promise<void>
    fetchGenres: () => Promise<void>
    fetchWatchlistIds: () => Promise<void>
}

// Module-level request tracking for race condition prevention
let currentRequestId = 0

const DEFAULT_FILTERS: DiscoverFilters = {
    mediaType: 'all',
    sortBy: 'popularity.desc',
    selectedGenre: null,
    selectedYear: null,
    query: '',
}

const useDiscoverStore = create<DiscoverState>((set, get) => ({
    // Initial state
    ...DEFAULT_FILTERS,
    results: [],
    page: 1,
    hasMore: true,
    totalPages: 1,
    loadedFilterKey: '',
    isLoading: false,
    isLoadingMore: false,
    isDataLoaded: false,
    watchlistIds: new Set<number>(),
    genres: [],
    virtuosoState: null,

    // Actions
    setQuery: (query) => set({ query }),

    setMediaType: (mediaType) => set({ mediaType }),

    setSortBy: (sortBy) => set({ sortBy }),

    setSelectedGenre: (selectedGenre) => set({ selectedGenre }),

    setSelectedYear: (selectedYear) => set({ selectedYear }),

    setVirtuosoState: (virtuosoState) => set({ virtuosoState }),

    addToWatchlist: async (id, item?) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: item?.media_type || 'movie',
            tmdb_id: id,
            title: item?.title || item?.name || '',
            poster_path: item?.poster_path,
            overview: item?.overview,
            release_date: item?.release_date || item?.first_air_date,
            vote_average: item?.vote_average,
            status: 'watching',
        })
        if (error) {
            console.error('Failed to add to watchlist:', error)
            return
        }
        set((state) => ({
            watchlistIds: new Set([...state.watchlistIds, id]),
        }))
    },

    removeFromWatchlist: async (id) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase
            .from('watchlist')
            .delete()
            .eq('user_id', user.id)
            .eq('tmdb_id', id)
        set((state) => {
            const newSet = new Set(state.watchlistIds)
            newSet.delete(id)
            return { watchlistIds: newSet }
        })
    },

    resetFilters: () => set({
        ...DEFAULT_FILTERS,
        results: [],
        page: 1,
        hasMore: true,
        totalPages: 1,
        loadedFilterKey: '',
        isDataLoaded: false,
        virtuosoState: null,
    }),

    reset: () => set({
        ...DEFAULT_FILTERS,
        results: [],
        page: 1,
        hasMore: true,
        totalPages: 1,
        loadedFilterKey: '',
        watchlistIds: new Set<number>(),
        isLoading: true,
        isLoadingMore: false,
        isDataLoaded: false,
        virtuosoState: null,
    }),

    fetchWatchlistIds: async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
            .from('watchlist')
            .select('tmdb_id')
            .eq('user_id', user.id)
        if (data) {
            const ids = new Set(data.map(item => item.tmdb_id).filter((id): id is number => id != null))
            set({ watchlistIds: ids })
        }
    },

    fetchGenres: async () => {
        const [movieGenres, tvGenres] = await Promise.all([
            getGenres('movie'),
            getGenres('tv'),
        ])
        const allGenres = [...movieGenres, ...tvGenres]
        const uniqueGenres = Array.from(
            new Map(allGenres.map(g => [g.id, g])).values()
        ).sort((a, b) => a.name.localeCompare(b.name))
        set({ genres: uniqueGenres })
    },

    fetchData: async (pageNum = 1) => {
        const state = get()
        const {
            mediaType,
            sortBy,
            query,
            selectedGenre,
            selectedYear,
            isLoading,
            isLoadingMore,
        } = state

        // Build a stable key from the current filter signature
        const filterKey = `${mediaType}|${sortBy}|${selectedGenre ?? ''}|${selectedYear ?? ''}|${query.trim()}`

        // Guard: prevent refetching when returning from a detail page.
        // If we already have data for this exact filter combination, skip.
        if (pageNum === 1 && state.loadedFilterKey === filterKey && state.isDataLoaded) return

        // Guard: prevent concurrent fetches for the same phase
        if (pageNum === 1 && isLoading) return
        if (pageNum > 1 && isLoadingMore) return

        // Assign a unique ID to this request for race condition prevention
        const requestId = ++currentRequestId

        // Set loading flags WITHOUT clearing results (prevents layout shift / flash)
        if (pageNum === 1) {
            set({ isLoading: true })
        } else {
            set({ isLoadingMore: true })
        }

        // Helper: map sort parameters for TV shows
        const mapSortParamForTV = (sortValue: string): string => {
            if (sortValue.includes('release_date')) {
                return sortValue.replace('release_date', 'first_air_date')
            }
            return sortValue
        }

        // Helper: sort merged results client-side
        const sortMergedResults = (items: TMDBResult[], sortValue: string): TMDBResult[] => {
            const [field, direction] = sortValue.split('.')
            const isAscending = direction === 'asc'

            return [...items].sort((a, b) => {
                let aValue: string | number
                let bValue: string | number

                switch (field) {
                    case 'popularity':
                        aValue = a.popularity ?? 0
                        bValue = b.popularity ?? 0
                        break
                    case 'vote_average':
                        aValue = a.vote_average ?? 0
                        bValue = b.vote_average ?? 0
                        break
                    case 'release_date':
                    case 'first_air_date':
                        aValue = a.media_type === 'tv' ? (a.first_air_date ?? '') : (a.release_date ?? '')
                        bValue = b.media_type === 'tv' ? (b.first_air_date ?? '') : (b.release_date ?? '')
                        if (!aValue) aValue = isAscending ? '1900-01-01' : '2100-01-01'
                        if (!bValue) bValue = isAscending ? '1900-01-01' : '2100-01-01'
                        break
                    case 'original_title':
                        aValue = (a.media_type === 'tv' ? (a.name ?? '') : (a.title ?? '')).toLowerCase()
                        bValue = (b.media_type === 'tv' ? (b.name ?? '') : (b.title ?? '')).toLowerCase()
                        break
                    default:
                        return 0
                }

                if (typeof aValue === 'string') {
                    return isAscending
                        ? aValue.localeCompare(bValue as string)
                        : (bValue as string).localeCompare(aValue)
                }
                return isAscending
                    ? (aValue as number) - (bValue as number)
                    : (bValue as number) - (aValue as number)
            })
        }

        try {
            let newResults: TMDBResult[] = []
            let totalPages = 1

            // SEARCH MODE
            if (query.trim()) {
                const [multiData, personData] = await Promise.all([
                    searchMulti(query, pageNum),
                    searchPerson(query, pageNum),
                ])
                let combined = [...(multiData.results || []), ...(personData.results || [])]
                totalPages = Math.max(
                    (multiData as { total_pages?: number }).total_pages || 1,
                    (personData as { total_pages?: number }).total_pages || 1,
                )

                // Deduplicate by id
                const seen = new Set<number>()
                combined = combined.filter(item => {
                    if (seen.has(item.id)) return false
                    seen.add(item.id)
                    return true
                })

                combined = combined.map(r => {
                    if (r.profile_path && !r.title && !r.media_type) {
                        return { ...r, media_type: 'person' as const }
                    }
                    return { ...r, media_type: r.media_type || (r.title ? 'movie' as const : 'tv' as const) }
                })

                if (mediaType === 'movie') {
                    combined = combined.filter(r => r.media_type === 'movie')
                } else if (mediaType === 'tv') {
                    combined = combined.filter(r => r.media_type === 'tv')
                } else if (mediaType === 'person') {
                    const data = await getPopularPeople(pageNum)
                    const raw = (data.results || []).map(r => ({ ...r, media_type: 'person' as const }))
                    const seen2 = new Set<number>()
                    newResults = raw.filter(item => {
                        if (seen2.has(item.id)) return false
                        seen2.add(item.id)
                        return true
                    })
                    totalPages = (data as { total_pages?: number }).total_pages || 1
                }

                // If searching for people, also fetch their filmography
                if (query.trim() && combined.some(r => r.media_type === 'person')) {
                    const personIds = combined.filter(r => r.media_type === 'person').map(r => r.id)
                    const [personMovies, personTV] = await Promise.all([
                        Promise.all(personIds.map(id => getPersonMovies(id))),
                        Promise.all(personIds.map(id => getPersonTV(id))),
                    ])
                    const films = [
                        ...personMovies.flatMap(d => (d.results || []).map(r => ({ ...r, media_type: 'movie' as const }))),
                        ...personTV.flatMap(d => (d.results || []).map(r => ({ ...r, media_type: 'tv' as const }))),
                    ]
                    const filmSeen = new Set<number>()
                    const uniqueFilms = films.filter(f => {
                        if (filmSeen.has(f.id)) return false
                        filmSeen.add(f.id)
                        return true
                    })
                    combined = [...combined, ...uniqueFilms]
                }

                newResults = combined
            }
            // PERSON MODE
            else if (mediaType === 'person') {
                const data = await getPopularPeople(pageNum)
                newResults = (data.results || []).map(r => ({ ...r, media_type: 'person' as const }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            }
            // ALL MEDIA TYPE MODE
            else if (mediaType === 'all') {
                const movieCacheKey = `${query}-${pageNum}-${sortBy}-${selectedYear}-${selectedGenre}`
                const tvCacheKey = `${query}-${pageNum}-${mapSortParamForTV(sortBy)}-${selectedYear}-${selectedGenre}`

                const [moviesData, tvData] = await Promise.all([
                    getCachedOrFetch(
                        'discover-movie',
                        movieCacheKey,
                        () => discoverMovies({
                            page: pageNum,
                            sort_by: sortBy,
                            primary_release_year: selectedYear ?? undefined,
                            with_genres: selectedGenre ? String(selectedGenre) : undefined,
                        }),
                        { ttl: 6 * 60 * 60 * 1000 },
                    ),
                    getCachedOrFetch(
                        'discover-tv',
                        tvCacheKey,
                        () => discoverTV({
                            page: pageNum,
                            sort_by: mapSortParamForTV(sortBy),
                            first_air_date_year: selectedYear ?? undefined,
                            with_genres: selectedGenre ? String(selectedGenre) : undefined,
                        }),
                        { ttl: 6 * 60 * 60 * 1000 },
                    ),
                ])

                const movies = ((moviesData as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'movie' as const,
                }))
                const tv = ((tvData as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'tv' as const,
                }))

                const combined = sortMergedResults([...movies, ...tv], sortBy)
                newResults = combined

                const moviesTotal = (moviesData as { total_pages?: number }).total_pages || 1
                const tvTotal = (tvData as { total_pages?: number }).total_pages || 1
                totalPages = Math.max(moviesTotal, tvTotal)
            }
            // MOVIE MODE
            else if (mediaType === 'movie') {
                const movieCacheKey = `${query}-${pageNum}-${sortBy}-${selectedYear}-${selectedGenre}`
                const data = await getCachedOrFetch(
                    'discover-movie',
                    movieCacheKey,
                    () => discoverMovies({
                        page: pageNum,
                        sort_by: sortBy,
                        primary_release_year: selectedYear ?? undefined,
                        with_genres: selectedGenre ? String(selectedGenre) : undefined,
                    }),
                    { ttl: 6 * 60 * 60 * 1000 },
                )
                newResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'movie' as const,
                }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            }
            // TV MODE
            else if (mediaType === 'tv') {
                const tvCacheKey = `${query}-${pageNum}-${mapSortParamForTV(sortBy)}-${selectedYear}-${selectedGenre}`
                const data = await getCachedOrFetch(
                    'discover-tv',
                    tvCacheKey,
                    () => discoverTV({
                        page: pageNum,
                        sort_by: mapSortParamForTV(sortBy),
                        first_air_date_year: selectedYear ?? undefined,
                        with_genres: selectedGenre ? String(selectedGenre) : undefined,
                    }),
                    { ttl: 6 * 60 * 60 * 1000 },
                )
                newResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'tv' as const,
                }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            }

            // Race condition check: discard if a newer request was started
            if (requestId !== currentRequestId) return

            set((state) => {
                if (pageNum === 1) {
                    return {
                        results: newResults,
                        page: pageNum,
                        hasMore: pageNum < totalPages,
                        totalPages,
                        loadedFilterKey: filterKey,
                        isLoading: false,
                        isLoadingMore: false,
                        isDataLoaded: true,
                    }
                }
                // Deduplicate when appending new results
                const existingIds = new Set(state.results.map(item => item.id))
                const newUniqueItems = newResults.filter(item => !existingIds.has(item.id))
                return {
                    results: [...state.results, ...newUniqueItems],
                    page: pageNum,
                    hasMore: pageNum < totalPages,
                    totalPages,
                    loadedFilterKey: filterKey,
                    isLoading: false,
                    isLoadingMore: false,
                    isDataLoaded: true,
                }
            })
        } catch (err) {
            // Race condition check: only handle error if this is still the latest request
            if (requestId !== currentRequestId) return
            console.error('Failed to load:', err)
            set({ isLoading: false, isLoadingMore: false })
        }
    },
}))

// ─── Selector hooks for optimized re-renders ──────────────────────────────────

export const useDiscoverResults = () => useDiscoverStore((state) => state.results)
export const useDiscoverWatchlistIds = () => useDiscoverStore((state) => state.watchlistIds)
export const useDiscoverGenres = () => useDiscoverStore((state) => state.genres)
export const useDiscoverVirtuosoState = () => useDiscoverStore((state) => state.virtuosoState)

export const useDiscoverFilters = () => {
    const selector = useShallow((state: DiscoverState) => ({
        mediaType: state.mediaType,
        sortBy: state.sortBy,
        selectedGenre: state.selectedGenre,
        selectedYear: state.selectedYear,
        query: state.query,
    }))
    return useDiscoverStore(selector)
}

export const useDiscoverLoading = () => {
    const selector = useShallow((state: DiscoverState) => ({
        isLoading: state.isLoading,
        isLoadingMore: state.isLoadingMore,
        hasMore: state.hasMore,
        isDataLoaded: state.isDataLoaded,
    }))
    return useDiscoverStore(selector)
}

export const useDiscoverActions = () => {
    const selector = useShallow((state: DiscoverState) => ({
        fetchData: state.fetchData,
        fetchGenres: state.fetchGenres,
        fetchWatchlistIds: state.fetchWatchlistIds,
        setQuery: state.setQuery,
        setMediaType: state.setMediaType,
        setSortBy: state.setSortBy,
        setSelectedGenre: state.setSelectedGenre,
        setSelectedYear: state.setSelectedYear,
        setVirtuosoState: state.setVirtuosoState,
        resetFilters: state.resetFilters,
        addToWatchlist: state.addToWatchlist,
        removeFromWatchlist: state.removeFromWatchlist,
    }))
    return useDiscoverStore(selector)
}

export const useDiscoverPage = () => {
    const selector = useShallow((state: DiscoverState) => ({
        page: state.page,
        hasMore: state.hasMore,
        isLoading: state.isLoading,
        isLoadingMore: state.isLoadingMore,
    }))
    return useDiscoverStore(selector)
}

export default useDiscoverStore
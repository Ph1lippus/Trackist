import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '../services/supabaseClient'
import type { TMDBResult, WatchlistItem } from '../types'
import { useLibraryStore } from './useLibraryStore'
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

type SortBy =
    | 'popularity.desc'
    | 'popularity.asc'
    | 'vote_average.desc'
    | 'vote_average.asc'
    | 'release_date.desc'
    | 'release_date.asc'
    | 'original_title.asc'
    | 'original_title.desc'

type MediaType = 'all' | 'movie' | 'tv' | 'person'

interface DiscoverState {
    // State
    results: TMDBResult[]
    mediaType: MediaType
    sortBy: SortBy
    selectedGenre: number | null
    selectedYear: number | null
    query: string
    page: number
    hasMore: boolean
    scrollY: number
    watchlistIds: Set<number>
    isLoading: boolean
    isLoadingMore: boolean
    genres: { id: number; name: string }[]
    isDataLoaded: boolean
    showAdded: boolean
    sessionAddedIds: Set<number>
    
    // Computed
    visibleResults: TMDBResult[]
    visibleCount: number

    // Actions
    setQuery: (query: string) => void
    setMediaType: (mediaType: MediaType) => void
    setSortBy: (sortBy: SortBy) => void
    setSelectedGenre: (genre: number | null) => void
    setSelectedYear: (year: number | null) => void
    setWatchlistIds: (ids: Set<number>) => void
    setShowAdded: (show: boolean) => void
    setSessionAddedIds: (ids: Set<number>) => void
    addToWatchlist: (id: number, item?: TMDBResult) => Promise<void>
    removeFromWatchlist: (id: number) => Promise<void>
    saveScroll: () => void
    restoreScroll: () => void
    resetFilters: () => void
    reset: () => void
    fetchData: (pageNum?: number) => Promise<void>
    loadInitialPages: (pagesToLoad?: number) => Promise<void>
    fetchGenres: () => Promise<void>
    fetchWatchlistIds: () => Promise<void>
    setIsVisible: (visible: boolean) => void
    setFilters: (filters: Partial<DiscoverState>) => void
}

// Generation counter to invalidate stale fetch requests when tabs/filters change rapidly
let fetchGeneration = 0

const useDiscoverStore = create<DiscoverState>((set, get) => ({
    // Initial state
    results: [],
    mediaType: 'movie',
    sortBy: 'popularity.desc',
    selectedGenre: null,
    selectedYear: null,
    query: '',
    page: 1,
    hasMore: true,
    scrollY: 0,
    watchlistIds: new Set<number>(),
    isLoading: false,
    isLoadingMore: false,
    genres: [],
    isDataLoaded: false,
    showAdded: true,
    sessionAddedIds: new Set<number>(),
    visibleResults: [],
    visibleCount: 0,

    // Actions
    setQuery: (query) => set({ query, sessionAddedIds: new Set() }),

    setMediaType: (mediaType) => set((state) => {
        const visibleResults = state.showAdded || mediaType === 'person'
            ? state.results 
            : state.results.filter(item => !state.watchlistIds.has(item.id))
        return { 
            mediaType,
            sessionAddedIds: new Set(), // Clear session overrides on tab switch
            visibleResults,
            visibleCount: visibleResults.length
        }
    }),

    setSortBy: (sortBy) => set({ sortBy, sessionAddedIds: new Set() }),

    setSelectedGenre: (selectedGenre) => set({ selectedGenre, sessionAddedIds: new Set() }),

    setSelectedYear: (selectedYear) => set({ selectedYear, sessionAddedIds: new Set() }),

    setWatchlistIds: (watchlistIds) => set((state) => {
        const visibleResults = state.showAdded || state.mediaType === 'person'
            ? state.results 
            : state.results.filter(item => !watchlistIds.has(item.id) || state.sessionAddedIds.has(item.id))
        return { 
            watchlistIds, 
            visibleResults,
            visibleCount: visibleResults.length
        }
    }),

    setShowAdded: (showAdded) => set((state) => {
        const visibleResults = showAdded || state.mediaType === 'person'
            ? state.results 
            : state.results.filter(item => !state.watchlistIds.has(item.id) || state.sessionAddedIds.has(item.id))
        return { 
            showAdded, 
            visibleResults,
            visibleCount: visibleResults.length
        }
    }),

    setSessionAddedIds: (sessionAddedIds: Set<number>) => set((state) => {
        const visibleResults = state.showAdded || state.mediaType === 'person'
            ? state.results 
            : state.results.filter(item => !state.watchlistIds.has(item.id) || sessionAddedIds.has(item.id))
        return { 
            sessionAddedIds, 
            visibleResults,
            visibleCount: visibleResults.length
        }
    }),

    addToWatchlist: async (id, item?) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const newItem: WatchlistItem = {
            id: crypto.randomUUID(),
            user_id: user.id,
            media_type: (item?.media_type as 'movie' | 'tv' | 'anime') || 'movie',
            tmdb_id: id,
            title: item?.title || item?.name || '',
            poster_path: item?.poster_path || undefined,
            overview: item?.overview || undefined,
            release_date: item?.release_date || item?.first_air_date || undefined,
            vote_average: item?.vote_average || undefined,
            status: 'planning',
            added_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }

        await useLibraryStore.getState().addItem(newItem)
    },

    removeFromWatchlist: async (id) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const libraryItem = useLibraryStore.getState().allItems.find(
            (item) => item.tmdb_id === id
        )

        if (libraryItem) {
            await useLibraryStore.getState().removeItem(libraryItem.id)
        } else {
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
        }
    },

    saveScroll: () => set({ scrollY: window.scrollY }),

    restoreScroll: () => {
        const { scrollY } = get()
        requestAnimationFrame(() => {
            window.scrollTo(0, scrollY)
        })
    },

    resetFilters: () => set({
        mediaType: 'all',
        sortBy: 'popularity.desc',
        selectedGenre: null,
        selectedYear: null,
        query: '',
        page: 1,
        results: [],
        hasMore: true,
        scrollY: 0,
        isDataLoaded: false,
        showAdded: true,
        sessionAddedIds: new Set<number>(),
        visibleResults: [],
        visibleCount: 0,
    }),

    reset: () => set({
        results: [],
        mediaType: 'all',
        sortBy: 'popularity.desc',
        selectedGenre: null,
        selectedYear: null,
        query: '',
        page: 1,
        hasMore: true,
        scrollY: 0,
        watchlistIds: new Set<number>(),
        sessionAddedIds: new Set<number>(),
        isLoading: true,
        isLoadingMore: false,
        isDataLoaded: false,
        showAdded: true,
        visibleResults: [],
        visibleCount: 0,
    }),

    setIsVisible: (visible) => {
        if (visible) {
            get().restoreScroll()
        }
    },

    setFilters: (filters) => set(filters),

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
        const filteredGenres = allGenres.filter(g => g.id !== 10763 && g.id !== 10767)
        const uniqueGenres = Array.from(
            new Map(filteredGenres.map(g => [g.id, g])).values()
        ).sort((a, b) => a.name.localeCompare(b.name))
        set({ genres: uniqueGenres })
    },

    loadInitialPages: async (pagesToLoad = 10) => {
        const { fetchData } = get()
        // Capture the generation at start so we stop if a newer tab/filter
        // switch invalidates this loading session.
        const initialGeneration = fetchGeneration
        let currentPage = 1
        
        for (let i = 0; i < pagesToLoad; i++) {
            // Stop if a newer tab/filter switch started another load
            if (fetchGeneration !== initialGeneration) break
            await fetchData(currentPage)
            if (fetchGeneration !== initialGeneration) break
            const state = get()
            if (!state.hasMore) break
            currentPage++
        }
    },

    fetchData: async (pageNum = 1) => {
        // Page 1 requests (tab/filter changes) bump the generation,
        // invalidating any in-flight requests from older generations.
        const isNewSearch = pageNum === 1
        if (isNewSearch) {
            fetchGeneration++
        }
        const generation = fetchGeneration

        const {
            mediaType,
            sortBy,
            query,
            selectedGenre,
            selectedYear,
            showAdded,
            watchlistIds,
        } = get()

        // Stale request from a previous tab/filter - abandon it.
        // Do not touch loading flags because the newer request owns them.
        if (generation !== fetchGeneration) return

        if (pageNum === 1) {
            // Reset sessionAddedIds when fetching page 1 (fresh query or filter change)
            set({ isLoading: true, isLoadingMore: false, results: [], page: 1, sessionAddedIds: new Set() })
        } else {
            set({ isLoadingMore: true })
        }

        const hasExcludedGenre = (item: TMDBResult & { genre_ids?: number[] }): boolean => {
            const excludedGenres = [10763, 10767]
            return (item.genres?.some(g => excludedGenres.includes(g.id)) ?? false) ||
                   (item.genre_ids?.some(id => excludedGenres.includes(id)) ?? false)
        }

        const MIN_VOTES = mediaType === 'tv' ? 200 : 100

        const mapSortParamForTV = (sortValue: string): string => {
            if (sortValue.includes('release_date')) {
                return sortValue.replace('release_date', 'first_air_date')
            }
            return sortValue
        }

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
                    return isAscending ? aValue.localeCompare(bValue as string) : (bValue as string).localeCompare(aValue)
                }
                return isAscending ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
            })
        }

        try {
            // Bail early if a newer tab/filter switch invalidated this request
            if (generation !== fetchGeneration) return

            let newResults: TMDBResult[] = []
            let totalPages = 1

            if (query.trim()) {
                const [multiData, personData] = await Promise.all([
                    searchMulti(query, pageNum),
                    searchPerson(query, pageNum),
                ])
                let combined = [...(multiData.results || []), ...(personData.results || [])]
                totalPages = Math.max(
                    (multiData as { total_pages?: number }).total_pages || 1,
                    (personData as { total_pages?: number }).total_pages || 1
                )

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
            } else if (mediaType === 'person') {
                const data = await getPopularPeople(pageNum)
                newResults = (data.results || []).map(r => ({ ...r, media_type: 'person' as const }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            } else if (mediaType === 'all') {
                const movieCacheKey = `${query}-${pageNum}-${sortBy}-${selectedYear}-${selectedGenre}-min-100`
                const tvCacheKey = `${query}-${pageNum}-${mapSortParamForTV(sortBy)}-${selectedYear}-${selectedGenre}-min-200`

                const [moviesData, tvData] = await Promise.all([
                    getCachedOrFetch(
                        'discover-movie',
                        movieCacheKey,
                        () => discoverMovies({
                            page: pageNum,
                            sort_by: sortBy,
                            primary_release_year: selectedYear ?? undefined,
                            with_genres: selectedGenre ? String(selectedGenre) : undefined,
                            'vote_count.gte': 100,
                        }),
                        { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                    ),
                    getCachedOrFetch(
                        'discover-tv',
                        tvCacheKey,
                        () => discoverTV({
                            page: pageNum,
                            sort_by: mapSortParamForTV(sortBy),
                            first_air_date_year: selectedYear ?? undefined,
                            with_genres: selectedGenre ? String(selectedGenre) : undefined,
                            'vote_count.gte': 200,
                        }),
                        { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
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

                let combined: TMDBResult[] = [...movies, ...tv]

                const shouldFilterGenres = !query.trim() && !selectedGenre
                if (shouldFilterGenres) {
                    combined = combined.filter(item => {
                        if (hasExcludedGenre(item)) return false
                        if ((item.vote_count || 0) < MIN_VOTES) return false
                        return true
                    })
                }

                combined = sortMergedResults(combined, sortBy)
                newResults = combined

                const moviesTotal = (moviesData as { total_pages?: number }).total_pages || 1
                const tvTotal = (tvData as { total_pages?: number }).total_pages || 1
                totalPages = Math.max(moviesTotal, tvTotal)
            } else if (mediaType === 'movie') {
                const movieCacheKey = `${query}-${pageNum}-${sortBy}-${selectedYear}-${selectedGenre}-min-100`
                const data = await getCachedOrFetch(
                    'discover-movie',
                    movieCacheKey,
                    () => discoverMovies({
                        page: pageNum,
                        sort_by: sortBy,
                        primary_release_year: selectedYear ?? undefined,
                        with_genres: selectedGenre ? String(selectedGenre) : undefined,
                        'vote_count.gte': 100,
                    }),
                    { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                )
                const movieResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'movie' as const,
                }))

                const shouldFilterGenres = !query.trim() && !selectedGenre
                if (shouldFilterGenres) {
                    newResults = movieResults.filter(item => {
                        if (hasExcludedGenre(item)) return false
                        if ((item.vote_count || 0) < MIN_VOTES) return false
                        return true
                    })
                } else {
                    newResults = movieResults
                }

                totalPages = (data as { total_pages?: number }).total_pages || 1
            } else if (mediaType === 'tv') {
                const tvCacheKey = `${query}-${pageNum}-${mapSortParamForTV(sortBy)}-${selectedYear}-${selectedGenre}-min-200`
                const data = await getCachedOrFetch(
                    'discover-tv',
                    tvCacheKey,
                    () => discoverTV({
                        page: pageNum,
                        sort_by: mapSortParamForTV(sortBy),
                        first_air_date_year: selectedYear ?? undefined,
                        with_genres: selectedGenre ? String(selectedGenre) : undefined,
                        'vote_count.gte': 200,
                    }),
                    { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                )
                const tvResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'tv' as const,
                }))

                const shouldFilterGenres = !query.trim() && !selectedGenre
                if (shouldFilterGenres) {
                    newResults = tvResults.filter(item => {
                        if (hasExcludedGenre(item)) return false
                        if ((item.vote_count || 0) < MIN_VOTES) return false
                        return true
                    })
                } else {
                    newResults = tvResults
                }

                totalPages = (data as { total_pages?: number }).total_pages || 1
            }

            // Ignore stale responses from a previous tab/filter generation
            if (generation !== fetchGeneration) return

            set((state) => {
                // Double-check inside the set callback as well - a newer request
                // may have started between the check above and the state update.
                if (generation !== fetchGeneration) return state

                const shouldFilterGenres = !query.trim() && !selectedGenre && mediaType !== 'person'
                let finalResults = newResults
                if (shouldFilterGenres) {
                    finalResults = newResults.filter(item => {
                        if (hasExcludedGenre(item)) return false
                        if ((item.vote_count || 0) < MIN_VOTES) return false
                        return true
                    })
                }

                let updatedResults: TMDBResult[]
                if (pageNum === 1) {
                    updatedResults = finalResults
                } else {
                    const existingIds = new Set(state.results.map(item => item.id))
                    const newUniqueItems = finalResults.filter(item => !existingIds.has(item.id))
                    updatedResults = [...state.results, ...newUniqueItems]
                }

                const currentSessionIds = pageNum === 1 ? new Set<number>() : state.sessionAddedIds;

                const visibleResults = showAdded || mediaType === 'person'
                    ? updatedResults 
                    : updatedResults.filter(item => !watchlistIds.has(item.id) || currentSessionIds.has(item.id))

                const visibleCount = visibleResults.length
                const hasMoreContent = pageNum < totalPages

                return {
                    results: updatedResults,
                    page: pageNum,
                    hasMore: hasMoreContent,
                    isLoading: false,
                    isLoadingMore: false,
                    isDataLoaded: true,
                    visibleResults,
                    visibleCount,
                }
            })
        } catch (err) {
            // Only reset loading flags if this request is still current
            if (generation === fetchGeneration) {
                console.error('Failed to load:', err)
                set({ isLoading: false, isLoadingMore: false })
            }
        }
    },
}))

let lastAllItems: WatchlistItem[] = []
useLibraryStore.subscribe((state) => {
    if (state.allItems !== lastAllItems) {
        lastAllItems = state.allItems
        const ids = new Set(
            state.allItems
                .map((item) => item.tmdb_id)
                .filter((id): id is number => id != null)
        )
        const discoverState = useDiscoverStore.getState()
        discoverState.setWatchlistIds(ids)
        
        const visibleResults = discoverState.showAdded || discoverState.mediaType === 'person'
            ? discoverState.results 
            : discoverState.results.filter(item => !ids.has(item.id) || discoverState.sessionAddedIds.has(item.id))
        useDiscoverStore.setState({
            visibleResults,
            visibleCount: visibleResults.length
        })
    }
})

export const useDiscoverResults = () => useDiscoverStore((state) => state.results)
export const useDiscoverVisibleResults = () => useDiscoverStore((state) => state.visibleResults)
export const useDiscoverWatchlistIds = () => useDiscoverStore((state) => state.watchlistIds)
export const useDiscoverShowAdded = () => useDiscoverStore((state) => state.showAdded)
export const useDiscoverSessionAddedIds = () => useDiscoverStore((state) => state.sessionAddedIds)
export const useDiscoverFilters = () => {
    const selector = useShallow((state: DiscoverState) => ({
        mediaType: state.mediaType,
        sortBy: state.sortBy,
        selectedGenre: state.selectedGenre,
        selectedYear: state.selectedYear,
        query: state.query,
        showAdded: state.showAdded,
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
        loadInitialPages: state.loadInitialPages,
        setQuery: state.setQuery,
        setMediaType: state.setMediaType,
        setSortBy: state.setSortBy,
        setSelectedGenre: state.setSelectedGenre,
        setSelectedYear: state.setSelectedYear,
        setShowAdded: state.setShowAdded,
        setSessionAddedIds: state.setSessionAddedIds,
        resetFilters: state.resetFilters,
        saveScroll: state.saveScroll,
        addToWatchlist: state.addToWatchlist,
        removeFromWatchlist: state.removeFromWatchlist,
    }))
    return useDiscoverStore(selector)
}

export default useDiscoverStore
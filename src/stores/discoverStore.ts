import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { TMDBResult } from '../types'
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
    
    // Actions
    setQuery: (query: string) => void
    setMediaType: (mediaType: MediaType) => void
    setSortBy: (sortBy: SortBy) => void
    setSelectedGenre: (genre: number | null) => void
    setSelectedYear: (year: number | null) => void
    setWatchlistIds: (ids: Set<number>) => void
    addToWatchlist: (id: number) => void
    removeFromWatchlist: (id: number) => void
    saveScroll: () => void
    restoreScroll: () => void
    resetFilters: () => void
    reset: () => void
    fetchData: (pageNum?: number) => Promise<void>
    fetchGenres: () => Promise<void>
    setIsVisible: (visible: boolean) => void
    setFilters: (filters: Partial<DiscoverState>) => void
}

const useDiscoverStore = create<DiscoverState>((set, get) => ({
    // Initial state
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
    isLoading: false,
    isLoadingMore: false,
    genres: [],
    isDataLoaded: false,

    // Actions
    setQuery: (query) => set({ query }),
    
    setMediaType: (mediaType) => set({ mediaType }),
    
    setSortBy: (sortBy) => set({ sortBy }),
    
    setSelectedGenre: (selectedGenre) => set({ selectedGenre }),
    
    setSelectedYear: (selectedYear) => set({ selectedYear }),
    
    setWatchlistIds: (watchlistIds) => set({ watchlistIds }),
    
    addToWatchlist: (id) => set((state) => ({
        watchlistIds: new Set([...state.watchlistIds, id])
    })),
    
    removeFromWatchlist: (id) => set((state) => {
        const newSet = new Set(state.watchlistIds)
        newSet.delete(id)
        return { watchlistIds: newSet }
    }),
    
    saveScroll: () => set({ scrollY: window.scrollY }),
    
    restoreScroll: () => {
        const { scrollY } = get()
        window.scrollTo(0, scrollY)
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
        isLoading: true,
        isLoadingMore: false,
        isDataLoaded: false,
    }),

    setIsVisible: (visible) => {
        if (visible) {
            get().restoreScroll()
        }
    },
    
    setFilters: (filters) => set(filters),

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
        const { 
            mediaType, 
            sortBy, 
            query, 
            selectedGenre, 
            selectedYear, 
            isLoading,
            isLoadingMore 
        } = get()

        if (isLoading || isLoadingMore) return

        if (pageNum === 1) {
            set({ isLoading: true, results: [], page: 1 })
        } else {
            set({ isLoadingMore: true })
        }

        // Helper function to map sort parameters for TV shows
        const mapSortParamForTV = (sortValue: string): string => {
            if (sortValue.includes('release_date')) {
                return sortValue.replace('release_date', 'first_air_date')
            }
            return sortValue
        }

        // Helper function to sort merged results client-side
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
                    (personData as { total_pages?: number }).total_pages || 1
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
                        { ttl: 6 * 60 * 60 * 1000 }
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
                        { ttl: 6 * 60 * 60 * 1000 }
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
                combined = sortMergedResults(combined, sortBy)
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
                    { ttl: 6 * 60 * 60 * 1000 }
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
                    { ttl: 6 * 60 * 60 * 1000 }
                )
                newResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({
                    ...r,
                    media_type: 'tv' as const,
                }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            }

            set((state) => {
                if (pageNum === 1) {
                    return {
                        results: newResults,
                        page: pageNum,
                        hasMore: pageNum < totalPages,
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
                    isLoading: false,
                    isLoadingMore: false,
                    isDataLoaded: true,
                }
            })
        } catch (err) {
            console.error('Failed to load:', err)
            set({ isLoading: false, isLoadingMore: false })
        }
    },
}))

// Selector hooks for optimized re-renders
export const useDiscoverResults = () => useDiscoverStore((state) => state.results)
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
        setQuery: state.setQuery,
        setMediaType: state.setMediaType,
        setSortBy: state.setSortBy,
        setSelectedGenre: state.setSelectedGenre,
        setSelectedYear: state.setSelectedYear,
        resetFilters: state.resetFilters,
        saveScroll: state.saveScroll,
        addToWatchlist: state.addToWatchlist,
        removeFromWatchlist: state.removeFromWatchlist,
        watchlistIds: state.watchlistIds,
    }))
    return useDiscoverStore(selector)
}

export default useDiscoverStore

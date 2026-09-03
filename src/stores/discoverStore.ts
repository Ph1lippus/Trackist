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

type MediaType = 'all' | 'movie' | 'tv' | 'person'

interface DiscoverState {
    // State
    results: TMDBResult[]
    mediaType: MediaType
    sortBy: SortBy
    selectedGenres: number[]
    yearFrom: number | null
    yearTo: number | null
    query: string
    page: number
    hasMore: boolean
    watchlistIds: Set<number>
    isLoading: boolean
    isLoadingMore: boolean
    genres: { id: number; name: string }[]
    isDataLoaded: boolean
    showAdded: boolean
    sessionAddedIds: Set<number>
    
    // Computed
    visibleResults: TMDBResult[]

    // Actions
    setQuery: (query: string) => void
    setMediaType: (mediaType: MediaType) => void
    setSortBy: (sortBy: SortBy) => void
    setSelectedGenres: (genres: number[]) => void
    setYearRange: (from: number | null, to: number | null) => void
    setWatchlistIds: (ids: Set<number>) => void
    setShowAdded: (show: boolean) => void
    setSessionAddedIds: (ids: Set<number>) => void
    addToWatchlist: (id: number, item?: TMDBResult) => Promise<void>
    removeFromWatchlist: (id: number) => Promise<void>
    resetFilters: () => void
    reset: () => void
    fetchData: (pageNum?: number) => Promise<void>
    loadInitialPages: (pagesToLoad?: number) => Promise<void>
    fetchGenres: () => Promise<void>
    fetchWatchlistIds: () => Promise<void>
    setFilters: (filters: Partial<DiscoverState>) => void
}

// Generation counter to invalidate stale fetch requests when tabs/filters change rapidly
let fetchGeneration = 0

const useDiscoverStore = create<DiscoverState>((set, get) => ({
    // Initial state
    results: [],
    mediaType: 'all',
    sortBy: 'popularity.desc',
    selectedGenres: [],
    yearFrom: null,
    yearTo: null,
    query: '',
    page: 1,
    hasMore: true,
    watchlistIds: new Set<number>(),
    isLoading: false,
    isLoadingMore: false,
    genres: [],
    isDataLoaded: false,
    showAdded: true,
    sessionAddedIds: new Set<number>(),
    visibleResults: [],

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
        }
    }),

    setSortBy: (sortBy) => set({ sortBy, sessionAddedIds: new Set() }),

    setSelectedGenres: (selectedGenres) => set({ selectedGenres, sessionAddedIds: new Set() }),

    setYearRange: (yearFrom, yearTo) => set({ yearFrom, yearTo, sessionAddedIds: new Set() }),

    setWatchlistIds: (watchlistIds) => set({ watchlistIds }),

    setShowAdded: (showAdded) => set({ showAdded }),

    setSessionAddedIds: (sessionAddedIds: Set<number>) => set({ sessionAddedIds }),

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
        
        // Manually update discover store's watchlistIds
        set((state) => {
            const newSet = new Set(state.watchlistIds)
            newSet.add(id)
            return { watchlistIds: newSet }
        })
    },

    removeFromWatchlist: async (id) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const libraryItem = useLibraryStore.getState().allItems.find(
            (item) => item.tmdb_id === id
        )

        if (libraryItem) {
            await useLibraryStore.getState().removeItem(libraryItem.id)
            // Manually update discover store's watchlistIds
            set((state) => {
                const newSet = new Set(state.watchlistIds)
                newSet.delete(id)
                return { watchlistIds: newSet }
            })
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

    resetFilters: () => set({
        mediaType: 'all',
        sortBy: 'popularity.desc',
        selectedGenres: [],
        yearFrom: null,
        yearTo: null,
        query: '',
        page: 1,
        results: [],
        hasMore: true,
        isDataLoaded: false,
        showAdded: true,
        sessionAddedIds: new Set<number>(),
        visibleResults: [],
    }),

    reset: () => set({
        results: [],
        mediaType: 'all',
        sortBy: 'popularity.desc',
        selectedGenres: [],
        yearFrom: null,
        yearTo: null,
        query: '',
        page: 1,
        hasMore: true,
        watchlistIds: new Set<number>(),
        sessionAddedIds: new Set<number>(),
        isLoading: true,
        isLoadingMore: false,
        isDataLoaded: false,
        showAdded: true,
    }),

    setFilters: (filters) => set(filters),

    fetchWatchlistIds: async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // First check if library store already has data loaded - use it as source of truth
        const libraryState = useLibraryStore.getState()
        if (libraryState.allItems.length > 0) {
            const ids = new Set(
                libraryState.allItems
                    .map(item => item.tmdb_id)
                    .filter((id): id is number => id != null)
            )
            set({ watchlistIds: ids })
            return
        }

        // Fall back to database query if library store has not loaded yet
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
        const allGenres = [...movieGenres.genres, ...tvGenres.genres]
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
            selectedGenres,
            yearFrom,
            yearTo
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
                    if (r.media_type) return r
                    return { ...r, media_type: r.title ? 'movie' as const : 'tv' as const }
                })

                if (mediaType === 'movie') {
                    combined = combined.filter(r => r.media_type === 'movie')
                } else if (mediaType === 'tv') {
                    combined = combined.filter(r => r.media_type === 'tv')
                } else if (mediaType === 'person') {
                    const data = await getPopularPeople(pageNum)
                    const raw = (data.results || []).map(r => {
                        if (r.media_type === 'person') return r
                        return { ...r, media_type: 'person' as const }
                    })
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
                        ...personMovies.flatMap(d => (d.results || []).map(r => {
                            if (r.media_type === 'movie') return r
                            return { ...r, media_type: 'movie' as const }
                        })),
                        ...personTV.flatMap(d => (d.results || []).map(r => {
                            if (r.media_type === 'tv') return r
                            return { ...r, media_type: 'tv' as const }
                        })),
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
                newResults = (data.results || []).map(r => {
                    if (r.media_type === 'person') return r
                    return { ...r, media_type: 'person' as const }
                })
                totalPages = (data as { total_pages?: number }).total_pages || 1
            } else if (mediaType === 'all') {
                const movieCacheKey = `${query}-${pageNum}-${sortBy}-${yearFrom}-${yearTo}-${selectedGenres.join(',')}-min-100`
                const tvCacheKey = `${query}-${pageNum}-${mapSortParamForTV(sortBy)}-${yearFrom}-${yearTo}-${selectedGenres.join(',')}-min-200`

                const [moviesData, tvData] = await Promise.all([
                    getCachedOrFetch(
                        'discover-movie',
                        movieCacheKey,
                        () => discoverMovies({
                            page: pageNum,
                            sort_by: sortBy,
                            primary_release_date_gte: yearFrom ? `${yearFrom}-01-01` : undefined,
                            primary_release_date_lte: yearTo ? `${yearTo}-12-31` : undefined,
                            with_genres: selectedGenres.length ? selectedGenres.join(',') : undefined,
                            vote_count_gte: 100,
                        }),
                        { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                    ),
                    getCachedOrFetch(
                        'discover-tv',
                        tvCacheKey,
                        () => discoverTV({
                            page: pageNum,
                            sort_by: mapSortParamForTV(sortBy),
                            first_air_date_gte: yearFrom ? `${yearFrom}-01-01` : undefined,
                            first_air_date_lte: yearTo ? `${yearTo}-12-31` : undefined,
                            with_genres: selectedGenres.length ? selectedGenres.join(',') : undefined,
                            vote_count_gte: 200,
                        }),
                        { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                    ),
                ])

                const movies = ((moviesData as { results: TMDBResult[] }).results || []).map(r => {
                    if (r.media_type === 'movie') return r
                    return { ...r, media_type: 'movie' as const }
                })
                const tv = ((tvData as { results: TMDBResult[] }).results || []).map(r => {
                    if (r.media_type === 'tv') return r
                    return { ...r, media_type: 'tv' as const }
                })

                let combined: TMDBResult[] = [...movies, ...tv]

                const shouldFilterGenres = !query.trim() && selectedGenres.length === 0
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
                const movieCacheKey = `${query}-${pageNum}-${sortBy}-${yearFrom}-${yearTo}-${selectedGenres.join(',')}-min-100`
                const data = await getCachedOrFetch(
                    'discover-movie',
                    movieCacheKey,
                    () => discoverMovies({
                        page: pageNum,
                        sort_by: sortBy,
                        primary_release_date_gte: yearFrom ? `${yearFrom}-01-01` : undefined,
                        primary_release_date_lte: yearTo ? `${yearTo}-12-31` : undefined,
                        with_genres: selectedGenres.length ? selectedGenres.join(',') : undefined,
                        vote_count_gte: 100,
                    }),
                    { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                )
                const movieResults = ((data as { results: TMDBResult[] }).results || []).map(r => {
                    if (r.media_type === 'movie') return r
                    return { ...r, media_type: 'movie' as const }
                })

                const shouldFilterGenres = !query.trim() && selectedGenres.length === 0
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
                const tvCacheKey = `${query}-${pageNum}-${mapSortParamForTV(sortBy)}-${yearFrom}-${yearTo}-${selectedGenres.join(',')}-min-200`
                const data = await getCachedOrFetch(
                    'discover-tv',
                    tvCacheKey,
                    () => discoverTV({
                        page: pageNum,
                        sort_by: mapSortParamForTV(sortBy),
                        first_air_date_gte: yearFrom ? `${yearFrom}-01-01` : undefined,
                        first_air_date_lte: yearTo ? `${yearTo}-12-31` : undefined,
                        with_genres: selectedGenres.length ? selectedGenres.join(',') : undefined,
                        vote_count_gte: 200,
                    }),
                    { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: true }
                )
                const tvResults = ((data as { results: TMDBResult[] }).results || []).map(r => {
                    if (r.media_type === 'tv') return r
                    return { ...r, media_type: 'tv' as const }
                })

                const shouldFilterGenres = !query.trim() && selectedGenres.length === 0
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

                const shouldFilterGenres = !query.trim() && selectedGenres.length === 0 && mediaType !== 'person'
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


                const hasMoreContent = pageNum < totalPages

                return {
                    results: updatedResults,
                    page: pageNum,
                    hasMore: hasMoreContent,
                    isLoading: false,
                    isLoadingMore: false,
                    isDataLoaded: true,
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
        useDiscoverStore.getState().setWatchlistIds(ids)
    }
})

export const useDiscoverResults = () => useDiscoverStore((state) => state.results)
export const useDiscoverWatchlistIds = () => useDiscoverStore((state) => state.watchlistIds)
export const useDiscoverShowAdded = () => useDiscoverStore((state) => state.showAdded)
export const useDiscoverSessionAddedIds = () => useDiscoverStore((state) => state.sessionAddedIds)
export const useDiscoverFilters = () => {
    const selector = useShallow((state: DiscoverState) => ({
        mediaType: state.mediaType,
        sortBy: state.sortBy,
        selectedGenres: state.selectedGenres,
        yearFrom: state.yearFrom,
        yearTo: state.yearTo,
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
        setSelectedGenres: state.setSelectedGenres,
        setYearRange: state.setYearRange,
        setShowAdded: state.setShowAdded,
        setSessionAddedIds: state.setSessionAddedIds,
        resetFilters: state.resetFilters,
        addToWatchlist: state.addToWatchlist,
        removeFromWatchlist: state.removeFromWatchlist,
    }))
    return useDiscoverStore(selector)
}

export default useDiscoverStore

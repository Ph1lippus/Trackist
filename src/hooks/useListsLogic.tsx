import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { UserList, ListItem, TMDBResult } from '../types'
import { discoverMovies, discoverTV, getGenres, searchMulti, getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { addToList, updateList, createList, removeFromList, swapListItems } from '../services/profileService'
import { useSearch } from '../hooks/useSearch'
import { cacheService } from '../services/cacheService'
import { useLibraryStore } from '../stores/useLibraryStore'

export type TabType = 'all' | 'movie' | 'tv'
export type BrowseMediaType = 'movie' | 'tv'

export interface UseListsLogicResult {
    // State
    lists: UserList[]
    publicLists: UserList[]
    selectedList: UserList | null
    listItems: ListItem[]
    loading: boolean
    activeTab: TabType
    title: string
    description: string
    isPublic: boolean
    saving: boolean
    isNewList: boolean
    browseResults: TMDBResult[]
    browseLoading: boolean
    browsePage: number
    hasMore: boolean
    browseMediaType: BrowseMediaType
    genres: { id: number; name: string }[]
    selectedGenre: number | null
    sortBy: string
    watchlistIds: Set<number>
    listItemIds: Set<number>
    watchedListItems: Set<number>
    showWatchConfirmModal: boolean
    pendingWatchItem: TMDBResult | null
    isWatchOperation: boolean
    showDeleteModal: boolean
    pendingDeleteItem: ListItem | null
    reordering: string | null
    isFetchingRef: React.MutableRefObject<boolean>

    // Setters
    setActiveTab: (tab: TabType) => void
    setTitle: (title: string) => void
    setDescription: (desc: string) => void
    setIsPublic: (val: boolean) => void
    setSaving: (val: boolean) => void
    setIsNewList: (val: boolean) => void
    setBrowseMediaType: (val: BrowseMediaType) => void
    setSelectedGenre: (val: number | null) => void
    setSortBy: (val: string) => void
    setShowWatchConfirmModal: (val: boolean) => void
    setShowDeleteModal: (val: boolean) => void
    setSelectedList: (val: UserList | null) => void
    setListItems: (val: ListItem[]) => void
    setListItemIds: (val: Set<number>) => void
    setWatchedListItems: (val: Set<number>) => void
    setLoading: (val: boolean) => void
    initNewList: () => void

    // Functions
    fetchLists: () => Promise<void>
    fetchListItems: (listId: string) => Promise<void>
    fetchWatchlistIds: () => Promise<void>
    loadListDetails: (listId: string) => Promise<void>
    fetchBrowseData: (page?: number, reset?: boolean) => Promise<void>
    handleSave: () => Promise<void>
    handleAddToList: (item: TMDBResult) => Promise<void>
    handleMarkWatched: (item: TMDBResult) => void
    confirmWatchAction: () => Promise<void>
    cancelWatchAction: () => void
    handleDeleteItem: (item: ListItem) => void
    confirmDeleteItem: () => Promise<void>
    cancelDeleteItem: () => void
    handleMoveUp: (item: ListItem, currentIndex: number) => Promise<void>
    handleMoveDown: (item: ListItem, currentIndex: number) => Promise<void>

    // Computed
    filteredLists: UserList[]
    filteredListItems: ListItem[]
    filteredWatchedItems: ListItem[]
    filteredBrowseResults: TMDBResult[]
    Footer: () => React.ReactElement | null

    // Hooks
    committedQuery: string
    navigate: ReturnType<typeof useNavigate>
    location: ReturnType<typeof useLocation>
    id: string | undefined
}

export const useListsLogic = (): UseListsLogicResult => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const { committedQuery } = useSearch()
    const libraryStore = useLibraryStore()

    // List state
    const [lists, setLists] = useState<UserList[]>([])
    const [publicLists, setPublicLists] = useState<UserList[]>([])
    const [selectedList, setSelectedList] = useState<UserList | null>(null)
    const [listItems, setListItems] = useState<ListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('all')

    // Form state
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [isPublic, setIsPublic] = useState(false)
    const [saving, setSaving] = useState(false)
    const [isNewList, setIsNewList] = useState(false)

    // Browse state
    const [browseResults, setBrowseResults] = useState<TMDBResult[]>([])
    const [browseLoading, setBrowseLoading] = useState(false)
    const [browsePage, setBrowsePage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [browseMediaType, setBrowseMediaType] = useState<BrowseMediaType>('movie')
    const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
    const [selectedGenre, setSelectedGenre] = useState<number | null>(null)
    const [sortBy, setSortBy] = useState('popularity.desc')

    // Watchlist state
    const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set())
    const [listItemIds, setListItemIds] = useState<Set<number>>(new Set())
    const [watchedListItems, setWatchedListItems] = useState<Set<number>>(new Set())

    // Modal state
    const [showWatchConfirmModal, setShowWatchConfirmModal] = useState(false)
    const [pendingWatchItem, setPendingWatchItem] = useState<TMDBResult | null>(null)
    const [isWatchOperation, setIsWatchOperation] = useState(true)

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [pendingDeleteItem, setPendingDeleteItem] = useState<ListItem | null>(null)

    // Reordering state
    const [reordering, setReordering] = useState<string | null>(null)

    const isFetchingRef = useRef(false)

    // Fetch functions
    const fetchLists = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            setLoading(false)
            return
        }

        // 1. Fetch lists (both user's own and public)
        const [userResult, publicResult] = await Promise.all([
            supabase
                .from('lists')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false }),
            supabase
                .from('lists')
                .select('*')
                .eq('is_public', true)
                .neq('user_id', user.id)
                .order('updated_at', { ascending: false })
        ])

        const userLists = userResult.data || []
        const publicListsData = publicResult.data || []

        // 2. Combine all list IDs
        const allListIds = [...userLists.map(l => l.id), ...publicListsData.map(l => l.id)]

        // 3. Fetch ALL list items for these lists (only poster_path and list_id)
        const posterMap: Record<string, string | null> = {}
        if (allListIds.length > 0) {
            const { data: items, error: itemsError } = await supabase
                .from('list_items')
                .select('list_id, poster_path')
                .in('list_id', allListIds)
                .order('added_at', { ascending: true })

            if (!itemsError && items) {
                // Group by list_id and take the first one
                items.forEach(item => {
                    if (!posterMap[item.list_id]) {
                        posterMap[item.list_id] = item.poster_path
                    }
                })
            }
        }

        // 4. Merge the poster into the list objects
        const userListsWithPoster = userLists.map(list => ({
            ...list,
            poster: posterMap[list.id] || null
        }))

        const publicListsWithPoster = publicListsData.map(list => ({
            ...list,
            poster: posterMap[list.id] || null
        }))

        setLists(userListsWithPoster)
        setPublicLists(publicListsWithPoster)
        setLoading(false)
}, [])

    const fetchListItems = useCallback(async (listId: string) => {
        const { data, error } = await supabase
            .from('list_items')
            .select('*')
            .eq('list_id', listId)
            .order('position', { ascending: true })

        if (!error && data) {
            setListItems(data)
            setListItemIds(new Set(data.map(item => item.tmdb_id)))

            // Try to get watched items from cache first
            const cacheKey = `list_watched:${listId}`
            const cachedWatched = await cacheService.get<number[]>(cacheKey, listId)

            if (cachedWatched) {
                setWatchedListItems(new Set(cachedWatched))
            } else {
                // Fetch which of these items are watched from database
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const tmdbIds = data.map(item => item.tmdb_id)
                    const { data: watchlistData } = await supabase
                        .from('watchlist')
                        .select('tmdb_id')
                        .eq('user_id', user.id)
                        .in('tmdb_id', tmdbIds)
                        .in('status', ['completed', 'caught_up'])

                    if (watchlistData) {
                        const watchedIds = watchlistData.map(item => item.tmdb_id)
                        setWatchedListItems(new Set(watchedIds))
                        // Cache the result
                        await cacheService.set(cacheKey, listId, watchedIds, 5 * 60 * 1000)
                    } else {
                        setWatchedListItems(new Set())
                    }
                } else {
                    setWatchedListItems(new Set())
                }
            }
        }
    }, [])

    const fetchWatchlistIds = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
            const { data } = await supabase
                .from('watchlist')
                .select('tmdb_id')
                .eq('user_id', user.id)
            if (data) {
                setWatchlistIds(new Set(data.map(item => item.tmdb_id).filter((id): id is number => id != null)))
            }
        }
    }, [])

    const loadListDetails = useCallback(async (listId: string) => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('lists')
                .select('*')
                .eq('id', listId)
                .single()

            if (!error && data) {
                setSelectedList(data)
                setTitle(data.title)
                setDescription(data.description || '')
                setIsPublic(data.is_public || false)
                setIsNewList(false)
                await fetchListItems(listId)
            }
        } catch (err) {
            console.error('Failed to load list:', err)
        } finally {
            setLoading(false)
        }
    }, [fetchListItems])

    // Initialize genres and watchlist IDs on mount
    useEffect(() => {
        const init = async () => {
            try {
                const [movieGenres, tvGenres] = await Promise.all([
                    getGenres('movie'),
                    getGenres('tv')
                ])
                const allGenres = [...movieGenres, ...tvGenres]
                const filteredGenres = allGenres.filter(g => g.id !== 10769)
                const uniqueGenres = Array.from(
                    new Map(filteredGenres.map(g => [g.id, g])).values()
                ).sort((a, b) => a.name.localeCompare(b.name))
                setGenres(uniqueGenres)

                await fetchWatchlistIds()
            } catch (err) {
                console.error('Failed to initialize lists page:', err)
            } finally {
                // Ensure loading is set to false even if initialization fails
                setLoading(false)
            }
        }
        init()
    }, [fetchWatchlistIds])

    // Initialize a new list form
    const initNewList = useCallback(() => {
        setIsNewList(true)
        setSelectedList(null)
        setTitle('')
        setDescription('')
        setIsPublic(false)
        setListItems([])
        setListItemIds(new Set())
        setWatchedListItems(new Set())
        setLoading(false)
    }, [])

    // Browse data fetching
    const fetchBrowseData = useCallback(async (page: number = 1, reset: boolean = false) => {
        // Allow reset to bypass the fetching guard
        if (isFetchingRef.current && !reset) {
            return
        }
        isFetchingRef.current = true
        setBrowseLoading(true)

        try {
            let data: { results: TMDBResult[]; total_pages?: number }
            let totalPages = 1

            if (committedQuery) {
                data = await searchMulti(committedQuery, page)
                totalPages = data.total_pages || 1
            } else {
                const params = {
                    page,
                    sort_by: sortBy,
                    with_genres: selectedGenre ? String(selectedGenre) : undefined,
                }

                if (browseMediaType === 'movie') {
                    data = await discoverMovies(params)
                } else {
                    const tvSortBy = sortBy.includes('release_date')
                        ? sortBy.replace('release_date', 'first_air_date')
                        : sortBy
                    data = await discoverTV({
                        ...params,
                        sort_by: tvSortBy,
                    })
                }
                totalPages = data.total_pages || 1
            }

            const newResults: TMDBResult[] = (data.results || [])
                .filter(r => {
                    if (committedQuery) {
                        return true
                    }
                    return r.media_type === browseMediaType ||
                        (!r.media_type && browseMediaType === 'movie' && !r.first_air_date) ||
                        (!r.media_type && browseMediaType === 'tv' && r.first_air_date)
                })
                .map(r => ({
                    ...r,
                    media_type: r.media_type || (r.first_air_date ? 'tv' : 'movie')
                }))

            if (reset || page === 1) {
                setBrowseResults(newResults)
            } else {
                setBrowseResults(prev => {
                    const existingIds = new Set(prev.map(item => item.id))
                    const uniqueNew = newResults.filter(item => !existingIds.has(item.id))
                    return [...prev, ...uniqueNew]
                })
            }
            setBrowsePage(page)
            setHasMore(page < totalPages)
        } catch (err) {
            console.error('Failed to fetch browse data:', err)
            // Ensure browse results are set to empty array on error
            if (reset || page === 1) {
                setBrowseResults([])
            }
        } finally {
            setBrowseLoading(false)
            isFetchingRef.current = false
        }
    }, [browseMediaType, sortBy, selectedGenre, committedQuery, isNewList, selectedList])

    // Handle save
    const handleSave = useCallback(async () => {
        if (!title.trim() || saving) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setSaving(true)
        try {
            if (isNewList) {
                const { data, error } = await createList(user.id, title.trim(), description.trim() || undefined, isPublic)
                if (error) {
                    alert('Error creating list: ' + error.message)
                    return
                }
                if (data) {
                    setIsNewList(false)
                    setSelectedList(data)
                    navigate(`/ListsDetail/${data.id}`)
                }
            } else if (selectedList) {
                const { error } = await updateList(selectedList.id, {
                    title: title.trim(),
                    description: description.trim() || undefined,
                    is_public: isPublic
                })
                if (error) {
                    alert('Error updating list: ' + error.message)
                    return
                }
                setSelectedList(prev => prev ? { ...prev, title: title.trim(), description: description.trim(), is_public: isPublic } : null)
                // Navigate back to detail page after saving
                navigate(`/ListsDetail/${selectedList.id}`)
            }
        } catch (err) {
            console.error('Failed to save list:', err)
            alert('Failed to save list. Please try again.')
        } finally {
            setSaving(false)
        }
    }, [title, description, isPublic, saving, isNewList, selectedList, navigate])

    const handleAddToList = useCallback(async (item: TMDBResult) => {
        if (!selectedList) return
        const { error } = await addToList(selectedList.id, {
            media_type: item.media_type as 'movie' | 'tv' | 'anime',
            tmdb_id: item.id,
            title: item.title || item.name || 'Untitled',
            poster_path: item.poster_path || undefined,
            overview: item.overview || undefined,
            vote_average: item.vote_average || undefined
        })
        if (!error) {
            // Invalidate all caches to reflect the change globally
            cacheService.clearPattern('library')
            cacheService.clearPattern('watchlist')
            cacheService.clearPattern('list_watched')
            cacheService.clearPattern('list_items')
            await fetchListItems(selectedList.id)
            // Refresh library store
            await libraryStore.initialize()
        }
    }, [selectedList, libraryStore, fetchListItems])

    const handleMarkWatched = useCallback(async (item: TMDBResult) => {
        const isWatched = watchedListItems.has(item.id)
        setPendingWatchItem(item)
        setIsWatchOperation(!isWatched)
        setShowWatchConfirmModal(true)
    }, [watchedListItems])

    const confirmWatchAction = useCallback(async () => {
        if (!pendingWatchItem) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setShowWatchConfirmModal(false)

        if (isWatchOperation) {
            // Mark as watched
            if (watchlistIds.has(pendingWatchItem.id)) {
                // Update existing watchlist item
                const isTv = pendingWatchItem.media_type === 'tv' || pendingWatchItem.media_type === 'anime'
                let showEnded = true
                if (isTv) {
                    const details = await getTVDetails(pendingWatchItem.id)
                    showEnded = details.status === 'Ended' || details.status === 'Canceled'
                }

                await supabase.from('watchlist')
                    .update({ 
                        status: isTv ? (showEnded ? 'completed' : 'caught_up') : 'completed', 
                        completed_at: showEnded ? new Date().toISOString() : null, 
                        updated_at: new Date().toISOString() 
                    })
                    .eq('user_id', user.id).eq('tmdb_id', pendingWatchItem.id)

                // If it's a TV show, mark all episodes as watched
                if (pendingWatchItem.media_type === 'tv' || pendingWatchItem.media_type === 'anime') {
                    const { data: watchlistItem } = await supabase
                        .from('watchlist')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('tmdb_id', pendingWatchItem.id)
                        .single()

                    if (watchlistItem) {
                        // Mark all episodes as watched
                        await supabase
                            .from('watchlist_episodes')
                            .update({ watched: true, watched_at: new Date().toISOString() })
                            .eq('watchlist_id', watchlistItem.id)

                        // Update current season/episode to total
                        await supabase
                            .from('watchlist')
                            .update({
                                current_season: pendingWatchItem.number_of_seasons || 1,
                                current_episode: pendingWatchItem.number_of_episodes || 0,
                                total_seasons: pendingWatchItem.number_of_seasons || 1,
                                total_episodes: pendingWatchItem.number_of_episodes || 0
                            })
                            .eq('id', watchlistItem.id)
                    }
                }
            } else {
                // Add to watchlist as completed
                const mediaType = pendingWatchItem.media_type || 'movie'
                const watchlistData = {
                    user_id: user.id,
                    media_type: mediaType,
                    tmdb_id: pendingWatchItem.id,
                    title: pendingWatchItem.title || pendingWatchItem.name || '',
                    poster_path: pendingWatchItem.poster_path,
                    overview: pendingWatchItem.overview,
                    release_date: pendingWatchItem.release_date || pendingWatchItem.first_air_date,
                    vote_average: pendingWatchItem.vote_average,
                    status: 'completed',
                    completed_at: new Date().toISOString()
                }

                if (mediaType === 'tv' || mediaType === 'anime') {
                    // For TV shows, include season/episode info
                    Object.assign(watchlistData, {
                        total_seasons: pendingWatchItem.number_of_seasons || 1,
                        total_episodes: pendingWatchItem.number_of_episodes || 0,
                        current_season: pendingWatchItem.number_of_seasons || 1,
                        current_episode: pendingWatchItem.number_of_episodes || 0
                    })
                }

                const { data: newWatchlistItem } = await supabase.from('watchlist').insert(watchlistData).select().single()

                setWatchlistIds(prev => new Set([...prev, pendingWatchItem.id]))

                // If it's a TV show, fetch and mark all episodes as watched
                if ((mediaType === 'tv' || mediaType === 'anime') && newWatchlistItem) {
                    // Fetch all episodes from TMDB
                    try {
                        const showDetails = await getTVDetails(pendingWatchItem.id)

                        if (showDetails && showDetails.seasons) {
                            // Add all episodes to watchlist_episodes as watched
                            for (const season of showDetails.seasons) {
                                if (season.season_number > 0 && season.episode_count) {
                                    const seasonData = await getTVSeasonDetails(pendingWatchItem.id, season.season_number)

                                    if (seasonData && seasonData.episodes) {
                                        for (const episode of seasonData.episodes) {
                                            await supabase.from('watchlist_episodes').insert({
                                                watchlist_id: newWatchlistItem.id,
                                                season_number: season.season_number,
                                                episode_number: episode.episode_number,
                                                tmdb_episode_id: episode.id,
                                                title: episode.name,
                                                still_path: episode.still_path,
                                                overview: episode.overview,
                                                vote_average: episode.vote_average,
                                                air_date: episode.air_date,
                                                runtime: episode.runtime,
                                                watched: true,
                                                watched_at: new Date().toISOString()
                                            })
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Failed to fetch TV show episodes:', error)
                    }
                }
            }
            // Update watched list items state immediately
            setWatchedListItems(prev => {
                const newSet = new Set([...prev, pendingWatchItem.id])
                // Update cache with new state
                if (selectedList) {
                    const cacheKey = `list_watched:${selectedList.id}`
                    cacheService.set(cacheKey, selectedList.id, Array.from(newSet), 5 * 60 * 1000)
                }
                // Invalidate all caches to reflect the change globally
                cacheService.clearPattern('library')
                cacheService.clearPattern('watchlist')
                cacheService.clearPattern('list_watched')
                cacheService.clearPattern('list_items')

                // Fetch fresh data and update cache
                setTimeout(async () => {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        const { data: freshWatchlist } = await supabase
                            .from('watchlist')
                            .select('*')
                            .eq('user_id', user.id)
                        if (freshWatchlist) {
                            await cacheService.set('library', user.id, freshWatchlist, 5 * 60 * 1000)
                        }
                    }
                    // Refresh the library store to update Finished page
                    await libraryStore.initialize()
                }, 100)

                return newSet
            })
        } else {
            // Unwatch
            await supabase.from('watchlist')
                .update({ status: 'planning', completed_at: null, updated_at: new Date().toISOString() })
                .eq('user_id', user.id).eq('tmdb_id', pendingWatchItem.id)

            // If it's a TV show, unmark all episodes as watched
            if (pendingWatchItem.media_type === 'tv' || pendingWatchItem.media_type === 'anime') {
                const { data: watchlistItem } = await supabase
                    .from('watchlist')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('tmdb_id', pendingWatchItem.id)
                    .single()

                if (watchlistItem) {
                    await supabase
                        .from('watchlist_episodes')
                        .update({ watched: false, watched_at: null })
                        .eq('watchlist_id', watchlistItem.id)

                    // Reset progress
                    await supabase
                        .from('watchlist')
                        .update({
                            current_season: 1,
                            current_episode: 0
                        })
                        .eq('id', watchlistItem.id)
                }
            }

            setWatchedListItems(prev => {
                const newSet = new Set(prev)
                newSet.delete(pendingWatchItem.id)
                // Update cache with new state
                if (selectedList) {
                    const cacheKey = `list_watched:${selectedList.id}`
                    cacheService.set(cacheKey, selectedList.id, Array.from(newSet), 5 * 60 * 1000)
                }
                // Invalidate all caches to reflect the change globally
                cacheService.clearPattern('library')
                cacheService.clearPattern('watchlist')
                cacheService.clearPattern('list_watched')
                cacheService.clearPattern('list_items')

                // Fetch fresh data and update cache
                setTimeout(async () => {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        const { data: freshWatchlist } = await supabase
                            .from('watchlist')
                            .select('*')
                            .eq('user_id', user.id)
                        if (freshWatchlist) {
                            await cacheService.set('library', user.id, freshWatchlist, 5 * 60 * 1000)
                        }
                    }
                    // Refresh the library store to update Finished page
                    await libraryStore.initialize()
                }, 100)

                return newSet
            })
        }

        setPendingWatchItem(null)

        // Refresh library store to update Finished page
        await libraryStore.initialize()
    }, [pendingWatchItem, isWatchOperation, watchlistIds, selectedList, libraryStore])

    const cancelWatchAction = useCallback(() => {
        setShowWatchConfirmModal(false)
        setPendingWatchItem(null)
    }, [])

    const handleDeleteItem = useCallback((item: ListItem) => {
        setPendingDeleteItem(item)
        setShowDeleteModal(true)
    }, [])

    const confirmDeleteItem = useCallback(async () => {
        if (!pendingDeleteItem || !selectedList) return

        const { error } = await removeFromList(selectedList.id, pendingDeleteItem.tmdb_id)
        if (!error) {
            // Invalidate all caches to reflect the change globally
            cacheService.clearPattern('library')
            cacheService.clearPattern('watchlist')
            cacheService.clearPattern('list_watched')
            cacheService.clearPattern('list_items')
            await fetchListItems(selectedList.id)
            // Refresh library store
            await libraryStore.initialize()
        }

        setShowDeleteModal(false)
        setPendingDeleteItem(null)
    }, [pendingDeleteItem, selectedList, libraryStore, fetchListItems])

    const cancelDeleteItem = useCallback(() => {
        setShowDeleteModal(false)
        setPendingDeleteItem(null)
    }, [])

    // Reorder handlers
    const handleMoveUp = useCallback(async (item: ListItem, currentIndex: number) => {
        if (currentIndex === 0 || reordering) return

        const prevItem = listItems[currentIndex - 1]
        if (!prevItem) return

        setReordering(item.id)
        try {
            await swapListItems(selectedList!.id, item.id, prevItem.id)
            // Invalidate cache
            const cacheKey = `list_items:${selectedList!.id}`
            await cacheService.clearPattern(cacheKey)
            await fetchListItems(selectedList!.id)
            // Refresh library store
            await libraryStore.initialize()
        } finally {
            setReordering(null)
        }
    }, [selectedList, listItems, reordering, fetchListItems, libraryStore])

    const handleMoveDown = useCallback(async (item: ListItem, currentIndex: number) => {
        if (currentIndex >= listItems.length - 1 || reordering) return

        const nextItem = listItems[currentIndex + 1]
        if (!nextItem) return

        setReordering(item.id)
        try {
            await swapListItems(selectedList!.id, item.id, nextItem.id)
            // Invalidate cache
            const cacheKey = `list_items:${selectedList!.id}`
            await cacheService.clearPattern(cacheKey)
            await fetchListItems(selectedList!.id)
            // Refresh library store
            await libraryStore.initialize()
        } finally {
            setReordering(null)
        }
    }, [selectedList, listItems, reordering, fetchListItems, libraryStore])

    // Filter lists based on global search (public + user's own lists)
    const filteredLists = useMemo(() => {
        if (!committedQuery) return lists
        const q = committedQuery.toLowerCase()
        return lists.filter(list =>
            list.title.toLowerCase().includes(q) ||
            (list.description || '').toLowerCase().includes(q)
        )
    }, [lists, committedQuery])

    // Filter list items based on active tab
    const filteredListItems = useMemo(() => {
        let items = listItems
        if (activeTab === 'movie') {
            items = listItems.filter(item => item.media_type === 'movie')
        } else if (activeTab === 'tv') {
            items = listItems.filter(item => item.media_type === 'tv' || item.media_type === 'anime')
        }
        // Exclude watched items from main list and sort by added_at (oldest first)
        return [...items]
            .filter(item => !watchedListItems.has(item.tmdb_id))
            .sort((a, b) => {
                const dateA = new Date(a.added_at || 0)
                const dateB = new Date(b.added_at || 0)
                return dateA.getTime() - dateB.getTime()
            })
    }, [listItems, activeTab, watchedListItems])

    // Filter watched items based on active tab
    const filteredWatchedItems = useMemo(() => {
        let items = listItems.filter(item => watchedListItems.has(item.tmdb_id))
        if (activeTab === 'movie') {
            items = items.filter(item => item.media_type === 'movie')
        } else if (activeTab === 'tv') {
            items = items.filter(item => item.media_type === 'tv' || item.media_type === 'anime')
        }
        // Sort by added_at to maintain consistent order (oldest first for stability)
        return [...items].sort((a, b) => {
            const dateA = new Date(a.added_at || 0)
            const dateB = new Date(b.added_at || 0)
            return dateA.getTime() - dateB.getTime()
        })
    }, [listItems, activeTab, watchedListItems])

    // Filter browse results to exclude items already in the list
    const filteredBrowseResults = useMemo<TMDBResult[]>(() => {
        if (!browseResults.length) return []
        return browseResults.filter((item: TMDBResult) => !listItemIds.has(item.id))
    }, [browseResults, listItemIds])

    // Footer component for VirtuosoGrid
    const Footer = useCallback(() => {
        if (browseLoading && browsePage === 1) {
            return (
                <div className="discover-loading" style={{ padding: "2rem" }}>
                    <div className="discover-spinner" />
                    <p>Loading...</p>
                </div>
            );
        }

        if (!hasMore && filteredBrowseResults.length > 0) {
            return (
                <p
                    style={{
                        textAlign: "center",
                        color: "rgba(255,255,255,0.3)",
                        fontSize: ".85rem",
                        padding: "1rem",
                    }}
                >
                    You've reached the end
                </p>
            );
        }

        return null;
    }, [browseLoading, browsePage, hasMore, filteredBrowseResults.length])

    return {
        // State
        lists, publicLists, selectedList, listItems, loading, activeTab,
        title, description, isPublic, saving, isNewList,
        browseResults, browseLoading, browsePage, hasMore, browseMediaType,
        genres, selectedGenre, sortBy,
        watchlistIds, listItemIds, watchedListItems,
        showWatchConfirmModal, pendingWatchItem, isWatchOperation,
        showDeleteModal, pendingDeleteItem,
        reordering, isFetchingRef,

        // Setters
        setActiveTab, setTitle, setDescription, setIsPublic, setSaving, setIsNewList,
        setBrowseMediaType, setSelectedGenre, setSortBy,
        setShowWatchConfirmModal, setShowDeleteModal,
        setSelectedList, setListItems, setListItemIds, setWatchedListItems, setLoading,

        // Functions
        fetchLists, fetchListItems, fetchWatchlistIds, loadListDetails,
        fetchBrowseData, handleSave, handleAddToList, handleMarkWatched,
        confirmWatchAction, cancelWatchAction, handleDeleteItem,
        confirmDeleteItem, cancelDeleteItem, handleMoveUp, handleMoveDown,
        initNewList,

        // Computed
        filteredLists, filteredListItems, filteredWatchedItems, filteredBrowseResults,
        Footer,

        // Hooks
        committedQuery, navigate, location, id,
    }
}
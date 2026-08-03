import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { UserList, ListItem, TMDBResult } from '../types'
import MediaCard from '../components/media/MediaCard'
import { discoverMovies, discoverTV, getGenres, searchMulti, getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { addToList, updateList, createList, deleteList, removeFromList, reorderListItem, swapListItems } from '../services/profileService'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSearch } from '../hooks/useSearch'
import { VirtuosoGrid } from 'react-virtuoso'
import ConfirmModal from '../components/modals/ConfirmModal'
import { cacheService } from '../services/cacheService'
import { useLibraryStore } from '../stores/useLibraryStore'


type TabType = 'all' | 'movie' | 'tv'
type BrowseMediaType = 'movie' | 'tv'

const Lists: React.FC = () => {
    usePageTitle('Trackist - Lists')
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const { committedQuery } = useSearch()
    const libraryStore = useLibraryStore()
    
    // List state
    const [lists, setLists] = useState<UserList[]>([])
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
    
    // View/Edit mode state
    const [isEditMode, setIsEditMode] = useState(false)
    
    const isFetchingRef = useRef(false)

    // Fetch functions
    const fetchLists = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from('lists')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })

        if (!error && data) {
            setLists(data)
        }
        setLoading(false)
    }

    const fetchListItems = async (listId: string) => {
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
                }
            }
        }
    }

    const fetchWatchlistIds = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
            .from('watchlist')
            .select('tmdb_id')
            .eq('user_id', user.id)
        if (data) {
            setWatchlistIds(new Set(data.map(item => item.tmdb_id).filter((id): id is number => id != null)))
        }
    }

    const loadListDetails = async (listId: string) => {
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
                setIsEditMode(false)
                await fetchListItems(listId)
            }
        } catch (err) {
            console.error('Failed to load list:', err)
        } finally {
            setLoading(false)
        }
    }

    // Load list details if ID is provided
    useEffect(() => {
        const loadList = async () => {
            if (id && id !== 'new') {
                await loadListDetails(id)
            } else if (id === 'new' || location.pathname === '/Lists/new') {
                setIsNewList(true)
                setSelectedList(null)
                setTitle('')
                setDescription('')
                setIsPublic(false)
                setListItems([])
                setListItemIds(new Set())
                setWatchedListItems(new Set())
                setLoading(false)
            } else {
                await fetchLists()
            }
        }
        
        loadList()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, location.pathname])

    // Initialize on mount
    useEffect(() => {
        const init = async () => {
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
        }
        init()
    }, [])

    // Browse data fetching
    const fetchBrowseData = useCallback(async (page: number = 1, reset: boolean = false) => {
        if (isFetchingRef.current) return
        isFetchingRef.current = true
        setBrowseLoading(true)

        try {
            let data
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
                totalPages = (data as { total_pages?: number }).total_pages || 1
            }

            const newResults: TMDBResult[] = ((data as { results: TMDBResult[] }).results || [])
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
        } finally {
            setBrowseLoading(false)
            isFetchingRef.current = false
        }
    }, [browseMediaType, sortBy, selectedGenre, committedQuery])

    // Fetch browse data when on list page
    useEffect(() => {
        const fetchData = async () => {
            if (selectedList || isNewList) {
                await fetchBrowseData(1, true)
            }
        }
        fetchData()
    }, [selectedList, isNewList, browseMediaType, sortBy, selectedGenre, committedQuery, fetchBrowseData])

    // Handle save
    const handleSave = async () => {
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
                    navigate(`/Lists/${data.id}`)
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
            }
        } catch (err) {
            console.error('Failed to save list:', err)
            alert('Failed to save list. Please try again.')
        } finally {
            setSaving(false)
        }
    }

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
    }, [selectedList, libraryStore])

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
                await supabase.from('watchlist')
                    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
                                            }).onConflict().ignore()
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
    }, [pendingDeleteItem, selectedList, libraryStore])

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

    // Build main content based on state
    let mainContent: React.ReactNode

    if (loading) {
        mainContent = (
            <section className="lists-page">
                <div className="discover-loading">
                    <div className="discover-spinner" />
                    <p>Loading...</p>
                </div>
            </section>
        )
    } else if (selectedList && !isEditMode) {
        // View Mode - Full page like Movies/TVShows
        mainContent = (
            <div className="discover-page">
                <div className="discover-container">
                    <div className="lists-page__view-header">
                        <div className="lists-page__view-header-content">
                            <h1>{selectedList.title}</h1>
                            <p className="lists-page__view-description">{selectedList.description || 'No description'}</p>
                            <div className="lists-page__view-meta">
                                <span>{selectedList.is_public ? '🌐 Public' : '🔒 Private'}</span>
                                <span>•</span>
                                <span>{listItems.length} {listItems.length === 1 ? 'item' : 'items'}</span>
                            </div>
                            <button
                                className="lists-page__action-btn lists-page__action-btn--primary"
                                onClick={() => setIsEditMode(true)}
                            >
                                <i className="fa-solid fa-pen"></i> Edit List
                            </button>
                        </div>
                    </div>

                    <div className="lists-page__view-content">
                        <div className="lists-page__items-header">
                            <div className="lists-page__tabs">
                                <button 
                                    className={`lists-page__tab ${activeTab === 'all' ? 'lists-page__tab--active' : ''}`}
                                    onClick={() => setActiveTab('all')}
                                >
                                    All ({filteredListItems.length})
                                </button>
                                <button 
                                    className={`lists-page__tab ${activeTab === 'movie' ? 'lists-page__tab--active' : ''}`}
                                    onClick={() => setActiveTab('movie')}
                                >
                                    <i className="fa-solid fa-film"></i> Movies ({listItems.filter(i => i.media_type === 'movie' && !watchedListItems.has(i.tmdb_id)).length})
                                </button>
                                <button 
                                    className={`lists-page__tab ${activeTab === 'tv' ? 'lists-page__tab--active' : ''}`}
                                    onClick={() => setActiveTab('tv')}
                                >
                                    <i className="fa-solid fa-tv"></i> TV Shows ({listItems.filter(i => (i.media_type === 'tv' || i.media_type === 'anime') && !watchedListItems.has(i.tmdb_id)).length})
                                </button>
                            </div>
                        </div>

                        {filteredListItems.length === 0 && filteredWatchedItems.length === 0 ? (
                            <div className="lists-page__empty-state">
                                <i className="fa-solid fa-film"></i>
                                <p>This list is empty. Click "Edit List" to add content!</p>
                            </div>
                        ) : filteredListItems.length === 0 ? (
                            <div className="lists-page__empty-state">
                                <i className="fa-solid fa-check"></i>
                                <p>All items in this list have been watched!</p>
                            </div>
                        ) : (
                            <>
                                {filteredListItems.length > 0 && (
                                    <VirtuosoGrid
                                        computeItemKey={(index) => filteredListItems[index]?.id ?? index}
                                        style={{ height: '100%', width: '100%' }}
                                        useWindowScroll={true}
                                        data={filteredListItems}
                                        overscan={800}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = filteredListItems[index]
                                            return (
                                                <MediaCard
                                                    item={{
                                                        id: item.tmdb_id,
                                                        title: item.title,
                                                        poster_path: item.poster_path,
                                                        media_type: item.media_type
                                                    }}
                                                    isInWatchlist={watchlistIds.has(item.tmdb_id)}
                                                    listMode={true}
                                                    onMarkWatched={handleMarkWatched}
                                                    onMarkUnwatched={undefined}
                                                />
                                            )
                                        }}
                                    />
                                )}
                                
                                {filteredWatchedItems.length > 0 && (
                                    <div className="lists-page__watched-section">
                                        <h3 className="lists-page__watched-title">
                                            <i className="fa-solid fa-eye"></i> Watched ({filteredWatchedItems.length})
                                        </h3>
                                        <VirtuosoGrid
                                            computeItemKey={(index) => filteredWatchedItems[index]?.id ?? index}
                                            style={{ height: '100%', width: '100%' }}
                                            useWindowScroll={true}
                                            data={filteredWatchedItems}
                                            overscan={800}
                                            listClassName="discover-grid"
                                            itemContent={(index) => {
                                                const item = filteredWatchedItems[index]
                                                return (
                                                    <MediaCard
                                                        item={{
                                                            id: item.tmdb_id,
                                                            title: item.title,
                                                            poster_path: item.poster_path,
                                                            media_type: item.media_type
                                                        }}
                                                        isInWatchlist={watchlistIds.has(item.tmdb_id)}
                                                        listMode={true}
                                                        onMarkUnwatched={handleMarkWatched}
                                                        onMarkWatched={undefined}
                                                    />
                                                )
                                            }}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        )
    } else if (selectedList || isNewList) {
        // Edit Mode - Split layout (keep existing logic)
        mainContent = (
            <div className="lists-page lists-page--split">
                {/* Left side: Form + List Items */}
                <div className="lists-page__form-section">
                    <div className="lists-page__form-header">
                        <h1>{isNewList ? 'Create New List' : 'Edit List'}</h1>
                    </div>

                    <div className="lists-page__form">
                        <div className="form-group">
                            <label htmlFor="listTitle">Title *</label>
                            <input
                                id="listTitle"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="My Awesome List"
                                maxLength={100}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="listDescription">Description</label>
                            <textarea
                                id="listDescription"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What's this list about?"
                                rows={4}
                                maxLength={500}
                            />
                        </div>
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                />
                                <span>Make this list public</span>
                            </label>
                        </div>
                        <div className="lists-page__form-actions">
                            <button
                                className="lists-page__action-btn"
                                onClick={() => {
                                    if (isNewList) {
                                        navigate('/Lists')
                                    } else {
                                        setIsEditMode(false)
                                    }
                                }}
                            >
                                Cancel
                            </button>
                            {!isNewList && (
                                <button
                                    className="lists-page__action-btn lists-page__action-btn--danger"
                                    onClick={async () => {
                                        if (confirm('Are you sure you want to delete this list?')) {
                                            const { error } = await deleteList(selectedList!.id)
                                            if (!error) {
                                                navigate('/Lists')
                                            }
                                        }
                                    }}
                                >
                                    Delete List
                                </button>
                            )}
                            <button
                                className="lists-page__action-btn lists-page__action-btn--primary"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : (isNewList ? 'Create List' : 'Save Changes')}
                            </button>
                        </div>
                    </div>

                    {/* List Items Section - Show ALL items including watched */}
                    <div className="lists-page__items-section">
                        <div className="lists-page__items-header">
                            <h2>List Items ({listItems.length})</h2>
                        </div>
                        <div className="lists-page__items-grid">
                            {listItems.map((item, index) => (
                                <div key={item.id} className="lists-page__item-wrapper">
                                    <div className="lists-page__reorder-controls">
                                        <button
                                            className="lists-page__reorder-btn"
                                            onClick={() => handleMoveUp(item, index)}
                                            disabled={index === 0 || reordering === item.id}
                                            title="Move up"
                                        >
                                            <i className="fa-solid fa-arrow-up"></i>
                                        </button>
                                        <button
                                            className="lists-page__reorder-btn"
                                            onClick={() => handleMoveDown(item, index)}
                                            disabled={index === listItems.length - 1 || reordering === item.id}
                                            title="Move down"
                                        >
                                            <i className="fa-solid fa-arrow-down"></i>
                                        </button>
                                    </div>
                                    <MediaCard
                                        item={{
                                            id: item.tmdb_id,
                                            title: item.title,
                                            poster_path: item.poster_path,
                                            media_type: item.media_type
                                        }}
                                        isInWatchlist={false}
                                        listMode={true}
                                        onDelete={() => handleDeleteItem(item)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right side: Browse grid for adding items */}
                <div className="lists-page__discover-section">
                    <div className="lists-page__discover-header">
                        <h2>Add Content</h2>
                        <p>Use the search bar above to find movies and TV shows to add to your list</p>
                    </div>

                    {/* Browse tabs */}
                    <div className="discover-controls">
                        <div className="discover-tabs">
                            <button
                                className={`discover-tab ${browseMediaType === 'movie' ? 'active' : ''}`}
                                onClick={() => setBrowseMediaType('movie')}
                            >
                                Movies
                            </button>
                            <button
                                className={`discover-tab ${browseMediaType === 'tv' ? 'active' : ''}`}
                                onClick={() => setBrowseMediaType('tv')}
                            >
                                TV Shows
                            </button>
                        </div>
                        <div className="discover-sorts">
                            <select
                                className="discover-filter-select"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="popularity.desc">Popularity (High to Low)</option>
                                <option value="popularity.asc">Popularity (Low to High)</option>
                                <option value="vote_average.desc">Rating (High to Low)</option>
                                <option value="vote_average.asc">Rating (Low to High)</option>
                                <option value="release_date.desc">Release Date (Newest)</option>
                                <option value="release_date.asc">Release Date (Oldest)</option>
                                <option value="original_title.asc">Title (A-Z)</option>
                                <option value="original_title.desc">Title (Z-A)</option>
                            </select>
                            <select
                                className="discover-filter-select"
                                value={selectedGenre ?? ''}
                                onChange={(e) => setSelectedGenre(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">All Genres</option>
                                {genres.map(genre => (
                                    <option key={genre.id} value={genre.id}>
                                        {genre.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {browseLoading && browsePage === 1 ? (
                        <div className="discover-loading">
                            <div className="discover-spinner" />
                            <p>Loading...</p>
                        </div>
                    ) : filteredBrowseResults.length === 0 ? (
                        <div className="discover-empty">
                            <p>No content to add</p>
                        </div>
                    ) : (
                        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                            <VirtuosoGrid
                                computeItemKey={(index) => filteredBrowseResults[index]?.id ?? index}
                                style={{ height: '100%', width: '100%' }}
                                data={filteredBrowseResults}
                                endReached={() => {
                                    if (hasMore && !isFetchingRef.current) {
                                        fetchBrowseData(browsePage + 1)
                                    }
                                }}
                                components={{ Footer }}
                                useWindowScroll={true}
                                listClassName="discover-grid"
                                itemContent={(index) => {
                                    const item = filteredBrowseResults[index]
                                    return (
                                        <MediaCard
                                            item={item}
                                            onAddToList={handleAddToList}
                                            isInWatchlist={false}
                                        />
                                    )
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        )
    } else {
        // Lists overview
        mainContent = (
            <div className="lists-page">
                <div className="lists-page__container">
                    <div className="lists-page__sidebar">
                        <div className="lists-page__header">
                            <h1>My Lists</h1>
                            <button 
                                className="lists-page__create-btn"
                                onClick={() => navigate('/Lists/new')}
                            >
                                <i className="fa-solid fa-plus"></i> New List
                            </button>
                        </div>

                        <div className="lists-page__list">
                            {filteredLists.length === 0 ? (
                                <p className="lists-page__empty">
                                    {committedQuery ? 'No lists match your search' : 'No lists yet. Create your first list!'}
                                </p>
                            ) : (
                                filteredLists.map(list => (
                                    <div
                                        key={list.id}
                                        className={`lists-page__list-item ${selectedList ? 'lists-page__list-item--active' : ''}`}
                                        onClick={() => navigate(`/Lists/${list.id}`)}
                                    >
                                        <div className="lists-page__list-item-content">
                                            <h3>{list.title}</h3>
                                            {list.description && <p>{list.description}</p>}
                                            <div className="lists-page__list-item-meta">
                                                <span>{list.is_public ? '🌐 Public' : '🔒 Private'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Add ConfirmModal at the end
    return (
        <>
            {mainContent}
            {showWatchConfirmModal && (
                <ConfirmModal
                    isOpen={showWatchConfirmModal}
                    title={isWatchOperation ? 'Mark as Watched' : 'Mark as Unwatched'}
                    message={isWatchOperation 
                        ? `Are you sure you want to mark "${pendingWatchItem?.title || pendingWatchItem?.name}" as watched?` 
                        : `Are you sure you want to mark "${pendingWatchItem?.title || pendingWatchItem?.name}" as unwatched?`}
                    onConfirm={confirmWatchAction}
                    onCancel={cancelWatchAction}
                    confirmText={isWatchOperation ? 'Mark as Watched' : 'Mark as Unwatched'}
                    confirmColor={isWatchOperation ? 'success' : 'primary'}
                />
            )}
            {showDeleteModal && (
                <ConfirmModal
                    isOpen={showDeleteModal}
                    title="Remove from List"
                    message={`Are you sure you want to remove "${pendingDeleteItem?.title}" from this list?`}
                    onConfirm={confirmDeleteItem}
                    onCancel={cancelDeleteItem}
                    confirmText="Remove"
                    confirmColor="danger"
                />
            )}
        </>
    )

    // Add ConfirmModal at the end of the component
    const modalContent = showWatchConfirmModal ? (
        <ConfirmModal
            isOpen={showWatchConfirmModal}
            title={isWatchOperation ? 'Mark as Watched' : 'Mark as Unwatched'}
            message={isWatchOperation 
                ? `Are you sure you want to mark "${pendingWatchItem?.title || pendingWatchItem?.name}" as watched?` 
                : `Are you sure you want to mark "${pendingWatchItem?.title || pendingWatchItem?.name}" as unwatched?`}
            onConfirm={confirmWatchAction}
            onCancel={cancelWatchAction}
            confirmText={isWatchOperation ? 'Mark as Watched' : 'Mark as Unwatched'}
            confirmColor={isWatchOperation ? 'success' : 'primary'}
        />
    ) : null

    // Lists overview
    return (
        <div className="lists-page">
            <div className="lists-page__container">
                <div className="lists-page__sidebar">
                    <div className="lists-page__header">
                        <h1>My Lists</h1>
                        <button 
                            className="lists-page__create-btn"
                            onClick={() => navigate('/Lists/new')}
                        >
                            <i className="fa-solid fa-plus"></i> New List
                        </button>
                    </div>

                    <div className="lists-page__list">
                        {filteredLists.length === 0 ? (
                            <p className="lists-page__empty">
                                {committedQuery ? 'No lists match your search' : 'No lists yet. Create your first list!'}
                            </p>
                        ) : (
                            filteredLists.map(list => (
                                <div
                                    key={list.id}
                                    className={`lists-page__list-item ${selectedList ? 'lists-page__list-item--active' : ''}`}
                                    onClick={() => navigate(`/Lists/${list.id}`)}
                                >
                                    <div className="lists-page__list-item-content">
                                        <h3>{list.title}</h3>
                                        {list.description && <p>{list.description}</p>}
                                        <div className="lists-page__list-item-meta">
                                            <span>{list.is_public ? '🌐 Public' : '🔒 Private'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lists-page__main">
                    <div className="lists-page__placeholder">
                        <i className="fa-solid fa-list-ul"></i>
                        <h2>Select a list to view</h2>
                        <p>Or create a new list to get started</p>
                    </div>
                </div>
            </div>
            {modalContent}
        </div>
    )

    // Edit Mode - Split layout
    if (selectedList || isNewList) {
        return (
            <div className="lists-page lists-page--split">
                {/* Left side: Form + List Items */}
                <div className="lists-page__form-section">
                    <div className="lists-page__form-header">
                        <h1>{isNewList ? 'Create New List' : 'Edit List'}</h1>
                    </div>

                    <div className="lists-page__form">
                        <div className="form-group">
                            <label htmlFor="listTitle">Title *</label>
                            <input
                                id="listTitle"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="My Awesome List"
                                maxLength={100}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="listDescription">Description</label>
                            <textarea
                                id="listDescription"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What's this list about?"
                                rows={4}
                                maxLength={500}
                            />
                        </div>
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                />
                                <span>Make this list public</span>
                            </label>
                        </div>
                        <div className="lists-page__form-actions">
                            <button
                                className="lists-page__action-btn"
                                onClick={() => {
                                    setIsEditMode(false)
                                    if (selectedList) {
                                        setTitle(selectedList.title)
                                        setDescription(selectedList.description || '')
                                        setIsPublic(selectedList.is_public)
                                    }
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="lists-page__action-btn lists-page__action-btn--primary"
                                onClick={handleSave}
                                disabled={!title.trim() || saving}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                    {/* List items section */}
                    <div className="lists-page__items-section">
                        <div className="lists-page__items-header">
                            <h2>Items in List</h2>
                            <div className="lists-page__tabs">
                                <button 
                                    className={`lists-page__tab ${activeTab === 'all' ? 'lists-page__tab--active' : ''}`}
                                    onClick={() => setActiveTab('all')}
                                >
                                    All ({listItems.length})
                                </button>
                                <button 
                                    className={`lists-page__tab ${activeTab === 'movie' ? 'lists-page__tab--active' : ''}`}
                                    onClick={() => setActiveTab('movie')}
                                >
                                    <i className="fa-solid fa-film"></i> Movies ({listItems.filter(i => i.media_type === 'movie').length})
                                </button>
                                <button 
                                    className={`lists-page__tab ${activeTab === 'tv' ? 'lists-page__tab--active' : ''}`}
                                    onClick={() => setActiveTab('tv')}
                                >
                                    <i className="fa-solid fa-tv"></i> TV Shows ({listItems.filter(i => i.media_type === 'tv' || i.media_type === 'anime').length})
                                </button>
                            </div>
                        </div>

                        {filteredListItems.length === 0 ? (
                            <div className="lists-page__empty-state">
                                <i className="fa-solid fa-film"></i>
                                <p>This list is empty. Use the search bar to find content to add!</p>
                            </div>
                        ) : (
                            <div className="lists-page__items-grid">
                                {filteredListItems.map((item) => (
                                    <div key={item.id} className="lists-page__item-wrapper">
                                        <MediaCard
                                            item={{
                                                id: item.tmdb_id,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: item.media_type
                                            }}
                                            isInWatchlist={watchlistIds.has(item.tmdb_id)}
                                            listMode={true}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Browse grid for adding items */}
                <div className="lists-page__discover-section">
                    <div className="lists-page__discover-header">
                        <h2>Add Content</h2>
                        <p>Use the search bar above to find movies and TV shows to add to your list</p>
                    </div>

                    {/* Browse tabs */}
                    <div className="discover-controls">
                        <div className="discover-tabs">
                            <button
                                className={`discover-tab ${browseMediaType === 'movie' ? 'active' : ''}`}
                                onClick={() => setBrowseMediaType('movie')}
                            >
                                Movies
                            </button>
                            <button
                                className={`discover-tab ${browseMediaType === 'tv' ? 'active' : ''}`}
                                onClick={() => setBrowseMediaType('tv')}
                            >
                                TV Shows
                            </button>
                        </div>
                        <div className="discover-sorts">
                            <select
                                className="discover-filter-select"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="popularity.desc">Popularity (High to Low)</option>
                                <option value="popularity.asc">Popularity (Low to High)</option>
                                <option value="vote_average.desc">Rating (High to Low)</option>
                                <option value="vote_average.asc">Rating (Low to High)</option>
                                <option value="release_date.desc">Release Date (Newest)</option>
                                <option value="release_date.asc">Release Date (Oldest)</option>
                                <option value="original_title.asc">Title (A-Z)</option>
                                <option value="original_title.desc">Title (Z-A)</option>
                            </select>
                            <select
                                className="discover-filter-select"
                                value={selectedGenre ?? ''}
                                onChange={(e) => setSelectedGenre(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">All Genres</option>
                                {genres.map(genre => (
                                    <option key={genre.id} value={genre.id}>
                                        {genre.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {browseLoading && browsePage === 1 ? (
                        <div className="discover-loading">
                            <div className="discover-spinner" />
                            <p>Loading...</p>
                        </div>
                    ) : filteredBrowseResults.length === 0 ? (
                        <div className="discover-empty">
                            <p>No content to add</p>
                        </div>
                    ) : (
                        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                            <VirtuosoGrid
                                computeItemKey={(index) => filteredBrowseResults[index]?.id ?? index}
                                style={{ height: '100%', width: '100%' }}
                                data={filteredBrowseResults}
                                endReached={() => {
                                    if (hasMore && !isFetchingRef.current) {
                                        fetchBrowseData(browsePage + 1)
                                    }
                                }}
                                components={{ Footer }}
                                useWindowScroll={true}
                                listClassName="discover-grid"
                                itemContent={(index) => {
                                    const item = filteredBrowseResults[index]
                                    return (
                                        <MediaCard
                                            item={item}
                                            onAddToList={handleAddToList}
                                            isInWatchlist={false}
                                        />
                                    )
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Lists overview
    return (
        <div className="lists-page">
            <div className="lists-page__container">
                <div className="lists-page__sidebar">
                    <div className="lists-page__header">
                        <h1>My Lists</h1>
                        <button 
                            className="lists-page__create-btn"
                            onClick={() => navigate('/Lists/new')}
                        >
                            <i className="fa-solid fa-plus"></i> New List
                        </button>
                    </div>

                    <div className="lists-page__list">
                        {filteredLists.length === 0 ? (
                            <p className="lists-page__empty">
                                {committedQuery ? 'No lists match your search' : 'No lists yet. Create your first list!'}
                            </p>
                        ) : (
                            filteredLists.map(list => (
                                <div
                                    key={list.id}
                                    className={`lists-page__list-item ${selectedList ? 'lists-page__list-item--active' : ''}`}
                                    onClick={() => navigate(`/Lists/${list.id}`)}
                                >
                                    <div className="lists-page__list-item-content">
                                        <h3>{list.title}</h3>
                                        {list.description && <p>{list.description}</p>}
                                        <div className="lists-page__list-item-meta">
                                            <span>{list.is_public ? '🌐 Public' : '🔒 Private'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lists-page__main">
                    <div className="lists-page__placeholder">
                        <i className="fa-solid fa-list-ul"></i>
                        <h2>Select a list to view</h2>
                        <p>Or create a new list to get started</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Lists
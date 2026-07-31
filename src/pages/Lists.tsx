import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { UserList, ListItem, TMDBResult } from '../types'
import MediaCard from '../components/media/MediaCard'
import { discoverMovies, discoverTV, getGenres } from '../services/tmdbService'
import { addToList, removeFromList, updateList, createList } from '../services/profileService'

type TabType = 'all' | 'movie' | 'tv'
type BrowseMediaType = 'movie' | 'tv'

const Lists: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    
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
            .order('added_at', { ascending: false })

        if (!error && data) {
            setListItems(data)
            setListItemIds(new Set(data.map(item => item.tmdb_id)))
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
        if (id && id !== 'new') {
            loadListDetails(id)
        } else if (id === 'new' || location.pathname === '/Lists/new') {
            // Show create new list form
            setIsNewList(true)
            setSelectedList(null)
            setTitle('')
            setDescription('')
            setIsPublic(false)
            setListItems([])
            setListItemIds(new Set())
            setLoading(false)
        } else {
            fetchLists()
        }
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
            const uniqueGenres = Array.from(
                new Map(allGenres.map(g => [g.id, g])).values()
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
            const params = {
                page,
                sort_by: sortBy,
                with_genres: selectedGenre ? String(selectedGenre) : undefined,
            }

            let data
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

            const newResults: TMDBResult[] = ((data as { results: TMDBResult[] }).results || []).map(r => ({
                ...r,
                media_type: browseMediaType
            }))

            const totalPages = (data as { total_pages?: number }).total_pages || 1

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
    }, [browseMediaType, sortBy, selectedGenre])

    // Fetch browse data when on list page
    useEffect(() => {
        if (selectedList || isNewList) {
            fetchBrowseData(1, true)
        }
    }, [selectedList, isNewList, browseMediaType, sortBy, selectedGenre, fetchBrowseData])

    // Handle save
    const handleSave = async () => {
        if (!title.trim() || saving) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setSaving(true)
        try {
            if (isNewList) {
                const { data, error } = await createList(user.id, title.trim(), description.trim() || undefined)
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
                    description: description.trim() || undefined
                })
                if (error) {
                    alert('Error updating list: ' + error.message)
                    return
                }
                setSelectedList(prev => prev ? { ...prev, title: title.trim(), description: description.trim() } : null)
            }
        } catch (err) {
            console.error('Failed to save list:', err)
            alert('Failed to save list. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteList = async (listId: string) => {
        if (!confirm('Are you sure you want to delete this list?')) return
        const { error } = await supabase.from('lists').delete().eq('id', listId)
        if (!error) {
            navigate('/Lists')
            fetchLists()
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
            fetchListItems(selectedList.id)
        }
    }, [selectedList])

    const handleRemoveFromList = useCallback(async (item: ListItem) => {
        if (!selectedList) return
        const { error } = await removeFromList(selectedList.id, item.tmdb_id)
        if (!error) {
            fetchListItems(selectedList.id)
        }
    }, [selectedList])

    const handleAddToWatchlist = useCallback(async (item: TMDBResult) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        if (watchlistIds.has(item.id)) {
            await supabase.from('watchlist').delete().eq('user_id', user.id).eq('tmdb_id', item.id)
            setWatchlistIds(prev => {
                const newSet = new Set(prev)
                newSet.delete(item.id)
                return newSet
            })
        } else {
            await supabase.from('watchlist').insert({
                user_id: user.id,
                media_type: item.media_type || 'movie',
                tmdb_id: item.id,
                title: item.title || item.name || '',
                poster_path: item.poster_path,
                overview: item.overview,
                release_date: item.release_date || item.first_air_date,
                vote_average: item.vote_average,
                status: 'planning'
            })
            setWatchlistIds(prev => new Set([...prev, item.id]))
        }
    }, [watchlistIds])

    const handleMarkWatched = useCallback(async (item: TMDBResult) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        if (watchlistIds.has(item.id)) {
            await supabase.from('watchlist')
                .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('user_id', user.id).eq('tmdb_id', item.id)
        } else {
            await supabase.from('watchlist').insert({
                user_id: user.id,
                media_type: item.media_type || 'movie',
                tmdb_id: item.id,
                title: item.title || item.name || '',
                poster_path: item.poster_path,
                overview: item.overview,
                release_date: item.release_date || item.first_air_date,
                vote_average: item.vote_average,
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            setWatchlistIds(prev => new Set([...prev, item.id]))
        }
    }, [watchlistIds])

    // Filter list items based on active tab
    const filteredListItems = useMemo(() => {
        if (activeTab === 'all') return listItems
        return listItems.filter(item => {
            if (activeTab === 'movie') return item.media_type === 'movie'
            if (activeTab === 'tv') return item.media_type === 'tv' || item.media_type === 'anime'
            return true
        })
    }, [listItems, activeTab])

    // Filter browse results to exclude items already in the list
    const filteredBrowseResults = useMemo<TMDBResult[]>(() => {
        if (!browseResults.length) return []
        return browseResults.filter((item: TMDBResult) => !listItemIds.has(item.id))
    }, [browseResults, listItemIds])

    if (loading) {
        return (
            <section className="lists-page">
                <div className="discover-loading">
                    <div className="discover-spinner" />
                    <p>Loading...</p>
                </div>
            </section>
        )
    }

    // List detail/edit view with split layout
    if (selectedList || isNewList) {
        return (
            <div className="lists-page lists-page--split">
                {/* Left side: Form */}
                <div className="lists-page__form-section">
                    <div className="lists-page__form-header">
                        <h1>{isNewList ? 'Create New List' : 'Edit List'}</h1>
                        {!isNewList && selectedList && (
                            <button
                                className="lists-page__action-btn lists-page__action-btn--danger"
                                onClick={() => handleDeleteList(selectedList.id)}
                                title="Delete list"
                            >
                                <i className="fa-solid fa-trash"></i>
                            </button>
                        )}
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
                                onClick={() => navigate('/Lists')}
                            >
                                Cancel
                            </button>
                            <button
                                className="lists-page__action-btn lists-page__action-btn--primary"
                                onClick={handleSave}
                                disabled={!title.trim() || saving}
                            >
                                {saving ? 'Saving...' : isNewList ? 'Create List' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                    {/* List items section */}
                    {!isNewList && selectedList && (
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
                                    {filteredListItems.map(item => (
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
                                                onMarkWatched={item.media_type === 'movie' ? handleMarkWatched : undefined}
                                                onAdd={item.media_type === 'tv' || item.media_type === 'anime' ? handleAddToWatchlist : undefined}
                                            />
                                            <button
                                                className="lists-page__remove-item-btn"
                                                onClick={() => handleRemoveFromList(item)}
                                            >
                                                <i className="fa-solid fa-trash"></i> Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
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
                        <>
                            <div className="discover-grid">
                                {filteredBrowseResults.map(item => (
                                    <div key={`${item.media_type}-${item.id}`} className="lists-page__item-wrapper">
                                        <MediaCard
                                            item={item}
                                            onAddToList={handleAddToList}
                                            isInWatchlist={watchlistIds.has(item.id)}
                                        />
                                    </div>
                                ))}
                            </div>
                            {hasMore && (
                                <div className="lists-page__load-more">
                                    <button
                                        className="lists-page__load-more-btn"
                                        onClick={() => fetchBrowseData(browsePage + 1)}
                                        disabled={browseLoading}
                                    >
                                        {browseLoading ? 'Loading...' : 'Load More'}
                                    </button>
                                </div>
                            )}
                        </>
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
                        {lists.length === 0 ? (
                            <p className="lists-page__empty">No lists yet. Create your first list!</p>
                        ) : (
                            lists.map(list => (
                                <div
                                    key={list.id}
                                    className={`lists-page__list-item ${selectedList?.id === list.id ? 'lists-page__list-item--active' : ''}`}
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
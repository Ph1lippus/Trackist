import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useDiscoverStore, { useDiscoverResults, useDiscoverFilters, useDiscoverLoading, useDiscoverActions, useDiscoverWatchlistIds } from '../stores/discoverStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { Virtuoso } from 'react-virtuoso'


const Discover: React.FC = () => {
    const location = useLocation()
    const isVisible = location.pathname === '/' || location.pathname === '/Discover'
    
    // Store selectors
    const results = useDiscoverResults()
    const filters = useDiscoverFilters()
    const loading = useDiscoverLoading()
    const actions = useDiscoverActions()
    const watchlistIds = useDiscoverWatchlistIds()
    const store = useDiscoverStore()
    
    // State for confirmation modal when removing from watchlist
    const [removeConfirmItem, setRemoveConfirmItem] = useState<TMDBResult | null>(null)
    const [searchInput, setSearchInput] = useState(filters.query)


    // Refs
    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)
    const loadingRef = useRef(loading)
    const actionsRef = useRef(actions)
    const pageRef = useRef(store.page)

    // Keep refs in sync with latest values
    useEffect(() => {
        loadingRef.current = loading
    }, [loading])

    useEffect(() => {
        actionsRef.current = actions
    }, [actions])

    useEffect(() => {
        pageRef.current = store.page
    }, [store.page])
    
    // Memoized filtered results (currently no filtering, but ready for future use)
    const filteredResults = useMemo(() => results, [results])
    
    // Fetch genres and watchlist IDs on mount
    useEffect(() => {
        store.fetchGenres()
        store.fetchWatchlistIds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    
    // Fetch data on mount and when filters change
    useEffect(() => {
        actions.fetchData(1)
    }, [filters.mediaType, filters.sortBy, filters.selectedGenre, filters.selectedYear, actions])
    
    // Handle visibility changes for scroll restoration
    useEffect(() => {
        if (isVisible) {
            store.setIsVisible(true)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible])
    
    // Callback ref for loadMore element
    // Create the observer ONCE – never re‑created
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    const { hasMore, isLoadingMore } = loadingRef.current
                    if (hasMore && !isLoadingMore) {
                        actionsRef.current.fetchData(pageRef.current + 1)
                    }
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        )

        observerRef.current = observer

        // If a sentinel is already attached, observe it
        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current)
        }

        return () => {
            observer.disconnect()
            observerRef.current = null
        }
    }, []) // 👈 EMPTY – never re‑runs

    // Simple callback ref – only updates the node
    const setLoadMoreRef = useCallback((node: HTMLDivElement | null) => {
        loadMoreRef.current = node

        if (observerRef.current) {
            if (node) {
                observerRef.current.observe(node)
            }
            // When node becomes null, we don't disconnect – we just wait
            // for the next node. Disconnecting would require re‑creating.
        }
    }, []) // 👈 EMPTY – never re‑created

    useEffect(() => {
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [])

    useEffect(() => {
        const handleScroll = () => {
            store.saveScroll()
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [store])
    
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = searchInput.trim()
        if (!trimmed) return
        
        // Only update store and fetch if query changed
        if (trimmed !== filters.query) {
            actions.setQuery(trimmed)
            await actions.fetchData(1)
        } else {
            // If same query, just refetch (optional)
            await actions.fetchData(1)
        }
    }
    
    const handleClearFilters = () => {
        actions.resetFilters()
        setSearchInput('')
        window.scrollTo(0, 0)
    }
    
    const handleAddToWatchlist = (item: TMDBResult) => {
        if (watchlistIds.has(item.id)) {
            // Show confirmation before removing
            setRemoveConfirmItem(item)
        } else {
            actions.addToWatchlist(item.id, item)
        }
    }

    const handleConfirmRemove = () => {
        if (removeConfirmItem) {
            actions.removeFromWatchlist(removeConfirmItem.id)
            setRemoveConfirmItem(null)
        }
    }
    
    // Determine if we should show the page
    if (!isVisible) {
        return <div className="discover-page" style={{ display: 'none' }} />
    }
    
    return (
        <div className="discover-page">
            <div className="discover-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="discover-search-wrap">
                    <form onSubmit={handleSearch}>
                        <div className="discover-search-box">
                            <svg
                                className="discover-search-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                className="discover-search"
                                placeholder="Search movies, TV shows, actors, directors..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                <div className="discover-controls">
                    <div className="discover-tabs">
                        <button
                            className={`discover-tab ${filters.mediaType === 'all' ? 'active' : ''}`}
                            onClick={() => actions.setMediaType('all')}
                        >
                            All
                        </button>
                        <button
                            className={`discover-tab ${filters.mediaType === 'movie' ? 'active' : ''}`}
                            onClick={() => actions.setMediaType('movie')}
                        >
                            Movies
                        </button>
                        <button
                            className={`discover-tab ${filters.mediaType === 'tv' ? 'active' : ''}`}
                            onClick={() => actions.setMediaType('tv')}
                        >
                            TV Shows
                        </button>
                        <button
                            className={`discover-tab ${filters.mediaType === 'person' ? 'active' : ''}`}
                            onClick={() => actions.setMediaType('person')}
                        >
                            People
                        </button>
                    </div>
                    {filters.mediaType !== 'person' && (
                        <div className="discover-sorts">
                            <select
                                className="discover-filter-select"
                                value={filters.sortBy}
                                onChange={(e) => actions.setSortBy(e.target.value as typeof filters.sortBy)}
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
                                value={filters.selectedGenre ?? ''}
                                onChange={(e) => actions.setSelectedGenre(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">All Genres</option>
                                {store.genres.map((genre: { id: number; name: string }) => (
                                    <option key={genre.id} value={genre.id}>
                                        {genre.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="discover-filter-select"
                                value={filters.selectedYear ?? ''}
                                onChange={(e) => actions.setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">All Years</option>
                                {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                            <button
                                className="discover-filter-select"
                                style={{ cursor: 'pointer' }}
                                onClick={handleClearFilters}
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                </div>

                {loading.isLoading || !store.isDataLoaded ? (
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading...</p>
                    </div>
                ) : filteredResults.length === 0 ? (
                    <div className="discover-empty">
                        <p>{filters.query ? 'No results found' : 'Nothing to show'}</p>
                    </div>
                ) : (
                    <div>
                        <div className="discover-grid">
                            {filteredResults.map((item) => (
                                <div key={`${item.media_type}-${item.id}`}>
                                    <MediaCard
                                        item={item}
                                        compact={item.media_type === 'person'}
                                        onAdd={handleAddToWatchlist}
                                        isInWatchlist={watchlistIds.has(item.id)}
                                    />
                                </div>
                            ))}
                        </div>
                        {loading.isLoadingMore && (
                            <div className="discover-loading" style={{ padding: '2rem' }}>
                                <div className="discover-spinner" />
                                <p>Loading more...</p>
                            </div>
                        )}
                        {!loading.hasMore && filteredResults.length > 0 && (
                            <p
                                style={{
                                    textAlign: 'center',
                                    color: 'rgba(255,255,255,0.3)',
                                    fontSize: '0.85rem',
                                    padding: '1rem',
                                }}
                            >
                                You've reached the end
                            </p>
                        )}
                {loading.hasMore && !loading.isLoadingMore && (
                            <div ref={setLoadMoreRef} style={{ height: '50px' }} />
                        )}
                    </div>
                )}
            </div>

            {removeConfirmItem && (
                <ConfirmModal
                    isOpen={true}
                    title="Remove from Watchlist"
                    message={`Are you sure you want to remove "${removeConfirmItem.title || removeConfirmItem.name}" from your watchlist?`}
                    onConfirm={handleConfirmRemove}
                    onCancel={() => setRemoveConfirmItem(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                />
            )}
        </div>
    )
}

export default Discover
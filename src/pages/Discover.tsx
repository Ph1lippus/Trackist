import React, { useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import useDiscoverStore, { useDiscoverResults, useDiscoverFilters, useDiscoverLoading, useDiscoverActions, useDiscoverWatchlistIds } from '../stores/discoverStore'
import MediaCard from '../components/media/MediaCard'
import type { TMDBResult } from '../types'

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
    
    // Refs
    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)
    
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
    }, [filters.mediaType, filters.sortBy, filters.selectedGenre, filters.selectedYear, filters.query, actions])
    
    // Handle visibility changes for scroll restoration
    useEffect(() => {
        if (isVisible) {
            store.setIsVisible(true)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible])
    
    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && loading.hasMore && !loading.isLoadingMore) {
                    actions.fetchData(store.page + 1)
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        )
        
        observerRef.current = observer
        
        return () => {
            observer.disconnect()
        }
    }, [loading.hasMore, loading.isLoadingMore, store.page, actions])
    
    // Callback ref for loadMore element
    const setLoadMoreRef = useCallback((node: HTMLDivElement | null) => {
        if (loadMoreRef.current && observerRef.current) {
            observerRef.current.unobserve(loadMoreRef.current)
        }
        loadMoreRef.current = node
        
        if (node && observerRef.current) {
            observerRef.current.observe(node)
        }
    }, [])
    
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!filters.query.trim()) return
        await actions.fetchData(1)
    }
    
    const handleClearFilters = () => {
        actions.resetFilters()
        window.scrollTo(0, 0)
    }
    
    const handleAddToWatchlist = (item: TMDBResult) => {
        if (watchlistIds.has(item.id)) {
            actions.removeFromWatchlist(item.id)
        } else {
            actions.addToWatchlist(item.id)
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
                                value={filters.query}
                                onChange={(e) => actions.setQuery(e.target.value)}
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
                    <div style={{ flex: 1, minHeight: '400px', width: '100%' }}>
                        <div className="discover-grid">
                            {filteredResults.map((item) => (
                                <div key={`${item.media_type}-${item.id}`} style={{ padding: '0.5rem' }}>
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
        </div>
    )
}

export default Discover
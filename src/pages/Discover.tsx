import React, {
    useEffect,
    useMemo,
    useCallback,
    useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import useDiscoverStore, { useDiscoverResults, useDiscoverFilters, useDiscoverLoading, useDiscoverActions, useDiscoverWatchlistIds } from '../stores/discoverStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { VirtuosoGrid } from 'react-virtuoso'


const Discover: React.FC = () => {
    const location = useLocation()
    usePageTitle('Trackist - Discover')
    const isVisible = location.pathname === '/' || location.pathname === '/Discover'
    
    // Store selectors
    const results = useDiscoverResults()
    const filters = useDiscoverFilters()
    const loading = useDiscoverLoading()
    const actions = useDiscoverActions()
    const watchlistIds = useDiscoverWatchlistIds()
    const store = useDiscoverStore()
    const { searchQuery } = useSearch()
    
    // State for confirmation modal when removing from watchlist
    const [removeConfirmItem, setRemoveConfirmItem] = useState<TMDBResult | null>(null)

    // Search is now handled globally via navbar
    // const [searchInput, setSearchInput] = useState(filters.query)

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
    
    // Sync global search with discover store
    useEffect(() => {
        if (searchQuery !== filters.query) {
            actions.setQuery(searchQuery)
            actions.fetchData(1)
        }
    }, [searchQuery, filters.query, actions])
    
    // Handle visibility changes for scroll restoration
    useEffect(() => {
        if (isVisible) {
            store.setIsVisible(true)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible])
    

    useEffect(() => {
        const handleScroll = () => {
            store.saveScroll()
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [store])

    useEffect(() => {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual'
        }
        return () => {
            if ('scrollRestoration' in history) {
                history.scrollRestoration = 'auto'
            }
        }
    }, [])
    
    const handleClearFilters = useCallback(() => {
    actions.resetFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
}, [actions]);  
    
    const handleAddToWatchlist = useCallback(
    (item: TMDBResult) => {
        if (watchlistIds.has(item.id)) {
            setRemoveConfirmItem(item);
        } else {
            actions.addToWatchlist(item.id, item);
        }
    },
    [actions, watchlistIds]
);

    const handleConfirmRemove = useCallback(() => {
    if (!removeConfirmItem) return;

    actions.removeFromWatchlist(removeConfirmItem.id);
    setRemoveConfirmItem(null);
}, [actions, removeConfirmItem]);

// const isInWatchlist = useCallback(
//     (id: number) => watchlistIds.has(id),
//     [watchlistIds]
// );
    const Footer = useCallback(() => {
    if (loading.isLoadingMore) {
        return (
            <div className="discover-loading" style={{ padding: "2rem" }}>
                <div className="discover-spinner" />
                <p>Loading more...</p>
            </div>
        );
    }

    if (!loading.hasMore && filteredResults.length > 0) {
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
}, [
    loading.isLoadingMore,
    loading.hasMore,
    filteredResults.length,
]);
    // Determine if we should show the page
    if (!isVisible) {
        return <div className="discover-page" style={{ display: 'none' }} />
    }
    // style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
    return (
        <div className="discover-page">
            <div className="discover-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="discover-controls">
                    <div className="discover-tabs">
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
                        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                            <VirtuosoGrid
                                computeItemKey={(index) => filteredResults[index]?.id ?? index}
                                style={{ height: '100%', width: '100%' }}
                                useWindowScroll={true}
                                data={filteredResults}
                                endReached={() => {
                                    if (loading.hasMore && !loading.isLoadingMore) {
                                        actions.fetchData(store.page + 1)
                                    }
                                }}
                                overscan={800}
                                listClassName="discover-grid"
                                itemContent={(index) => {
                                    const item = filteredResults[index];

                                    return (
                                        <MediaCard
                                            item={item}
                                            compact={item.media_type === "person"}
                                            onAdd={handleAddToWatchlist}
                                            // isInWatchlist={isInWatchlist(item.id)}
                                            isInWatchlist={watchlistIds.has(item.id)}
                                        />
                                    );
                                }}
                                components={{ Footer }}
                            />
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
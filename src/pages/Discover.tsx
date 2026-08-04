import React, {
    useEffect,
    useCallback,
    useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import useDiscoverStore, { useDiscoverVisibleResults, useDiscoverFilters, useDiscoverLoading, useDiscoverActions, useDiscoverWatchlistIds, useDiscoverShowAdded } from '../stores/discoverStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { VirtuosoGrid } from 'react-virtuoso'


const Discover: React.FC = () => {
    const location = useLocation()
    usePageTitle('Trackist - Discover')
    const isVisible = location.pathname === '/' || location.pathname === '/Discover'
    
    // Store selectors
    const visibleResults = useDiscoverVisibleResults()
    const filters = useDiscoverFilters()
    const loading = useDiscoverLoading()
    const actions = useDiscoverActions()
    const watchlistIds = useDiscoverWatchlistIds()
    const showAdded = useDiscoverShowAdded()
    const store = useDiscoverStore()
    const { committedQuery } = useSearch()
    
    // State for confirmation modal when removing from watchlist
    const [removeConfirmItem, setRemoveConfirmItem] = useState<TMDBResult | null>(null)

    

    // Search is now handled globally via navbar
    // const [searchInput, setSearchInput] = useState(filters.query)
    
    // Fetch genres and watchlist IDs on mount
    useEffect(() => {
        store.fetchGenres()
        store.fetchWatchlistIds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        // Clear session added IDs when media type changes
        actions.setSessionAddedIds(new Set())
        // Load initial pages (10 pages = 200 items) to ensure sufficient content after watchlist filtering
        // This ensures both Movies and TV shows have enough content since filtering removes many items
        actions.loadInitialPages(10)
    }, [filters.mediaType, filters.sortBy, filters.selectedGenre, filters.selectedYear, actions])
    
    // Sync global search with discover store
    useEffect(() => {
        if (committedQuery !== filters.query) {
            actions.setQuery(committedQuery)
            actions.fetchData(1)
        }
    }, [committedQuery, filters.query, actions])
    
    const handleClearFilters = useCallback(() => {
    actions.resetFilters();
    actions.setSessionAddedIds(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
}, [actions]);  
    
    const handleAddToWatchlist = useCallback(
    (item: TMDBResult) => {
        if (watchlistIds.has(item.id)) {
            setRemoveConfirmItem(item);
        } else {
            actions.addToWatchlist(item.id, item);
            // Add to session added IDs to keep it visible
            const currentSessionIds = useDiscoverStore.getState().sessionAddedIds
            actions.setSessionAddedIds(new Set(currentSessionIds).add(item.id));
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

    if (!loading.hasMore && visibleResults.length > 0) {
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
    visibleResults.length,
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
                                className={`discover-filter-select ${showAdded ? 'active' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => actions.setShowAdded(!showAdded)}
                            >
                                {showAdded ? 'Hide Added' : 'Show Added'}
                            </button>
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
                ) : visibleResults.length === 0 ? (
                    <div className="discover-empty">
                        <p>{filters.query ? 'No results found' : 'Nothing to show'}</p>
                    </div>
                ) : (
                        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                            <VirtuosoGrid
                                increaseViewportBy={{
                                        top: 1000,
                                        bottom: 2500,
                                    }}
                                computeItemKey={(index) => visibleResults[index]?.id ?? index}
                                style={{ height: '100%', width: '100%' }}
                                useWindowScroll={true}
                                data={visibleResults}
                                endReached={() => {
                                    if (loading.hasMore && !loading.isLoadingMore) {
                                        actions.fetchData(store.page + 1)
                                    }
                                }}
                                overscan={1200}
                                listClassName="discover-grid"
                                itemContent={(index) => {
                                    const item = visibleResults[index];
                                    if (!item) return null;

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
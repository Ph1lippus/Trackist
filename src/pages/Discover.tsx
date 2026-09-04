import React, {
    useEffect,
    useCallback,
    useState,
    memo,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'
import useDiscoverStore, { useDiscoverFilters, useDiscoverLoading, useDiscoverActions, useDiscoverWatchlistIds, useDiscoverShowAdded, useDiscoverResults } from '../stores/discoverStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { VirtuosoGrid } from 'react-virtuoso'
import { useMobile } from '../contexts/useMobile'

// Memoized item renderer to prevent re-mounts during scroll
const DiscoverCard = memo(({ item, onAdd, isInWatchlist, showIcons }: { 
    item: TMDBResult
    onAdd: (item: TMDBResult) => void
    isInWatchlist: boolean
    showIcons: boolean
}) => (
    <MediaCard
        item={item}
        compact={item.media_type === "person"}
        onAdd={onAdd}
        isInWatchlist={isInWatchlist}
        showIcons={showIcons}
    />
))


const Discover: React.FC = () => {
    const location = useLocation()
    usePageTitle('Track1st - Discover')
    const isVisible = location.pathname === '/' || location.pathname === '/Discover'

    // Store selectors
    const results = useDiscoverResults()
    const filters = useDiscoverFilters()
    const loading = useDiscoverLoading()
    const actions = useDiscoverActions()
    const watchlistIds = useDiscoverWatchlistIds()
    const showAdded = useDiscoverShowAdded()
    const store = useDiscoverStore()

    // Compute visible results locally to ensure it is always in sync with results and filters
    const visibleResults = React.useMemo(() => {
        if (showAdded || filters.mediaType === 'person') {
            return [...results]
        }
        return results.filter(item => !watchlistIds.has(item.id))
    }, [results, watchlistIds, showAdded, filters.mediaType])
    const { committedQuery } = useSearch()
    const { isMobile } = useMobile()
    const { showIcons } = useMediaCardIcons()

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
        // Load initial pages (3 pages = 60 items) to ensure sufficient content after watchlist filtering
        // This ensures both Movies and TV shows have enough content since filtering removes many items
        actions.loadInitialPages(3)
    }, [filters.mediaType, filters.sortBy, filters.selectedGenres, filters.yearFrom, filters.yearTo, actions])
    
    // Sync global search with discover store
    useEffect(() => {
        if (committedQuery !== filters.query) {
            actions.setQuery(committedQuery)
            actions.fetchData(1)
        }
    }, [committedQuery, filters.query, actions])
    
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
                {loading.isLoading ? (
                    <div className="discover-loading" aria-live="polite">
                        <div className="discover-spinner" />
                        <p>Loading results...</p>
                    </div>
                ) : visibleResults.length === 0 ? (
                    <div className="discover-empty">
                        <p>{filters.query ? 'No results found' : 'Nothing to show'}</p>
                    </div>
                ) : (
                        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                                <VirtuosoGrid
                                    increaseViewportBy={{
                                            top: isMobile ? 200 : 400,
                                            bottom: isMobile ? 400 : 800,
                                        }}
                                    computeItemKey={(index) => visibleResults[index]?.id ?? index}
                                    style={{ width: '100%' }}
                                    useWindowScroll={true}
                                    data={visibleResults}
                                rangeChanged={(range) => {
                                    const { endIndex } = range
                                    const totalItems = visibleResults.length
                                    const threshold = isMobile ? 15 : 20
                                    
                                    if (endIndex >= totalItems - threshold && loading.hasMore && !loading.isLoadingMore) {
                                        actions.fetchData(store.page + 1)
                                    }
                                }}
                                overscan={50}
                                listClassName="discover-grid"
                                itemContent={(index) => {
                                    const item = visibleResults[index];
                                    if (!item) return null;

                                    return (
                                        <DiscoverCard
                                            item={item}
                                            onAdd={handleAddToWatchlist}
                                            isInWatchlist={watchlistIds.has(item.id)}
                                            showIcons={showIcons}
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

            <button className="upcoming-new-scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>
        </div>
    )
}

export default Discover
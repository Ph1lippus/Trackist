import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
    useDiscoverResults,
    useDiscoverFilters,
    useDiscoverLoading,
    useDiscoverActions,
    useDiscoverWatchlistIds,
    useDiscoverGenres,
    useDiscoverVirtuosoState,
    useDiscoverPage,
} from '../stores/discoverStore'
import type { MediaType, SortBy } from '../stores/discoverStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { VirtuosoGrid } from 'react-virtuoso'
import type { GridStateSnapshot, VirtuosoGridHandle } from 'react-virtuoso'

// ─── Stable components for VirtuosoGrid ───────────────────────────────────────
// These are defined outside the component so they never get recreated, which
// prevents VirtuosoGrid from remounting its internal tree on every render.

const GridList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    (props, ref) => <div ref={ref} className="discover-grid" {...props} />,
)
GridList.displayName = 'GridList'

const GridItem: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => (
    <div className="discover-grid-item" {...props} />
)
GridItem.displayName = 'GridItem'

const GridScroller: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => (
    <div className="discover-grid-scroller" {...props} />
)
GridScroller.displayName = 'GridScroller'

const GridFooter: React.FC<{ isLoadingMore: boolean; hasMore: boolean; count: number }> = React.memo(
    ({ isLoadingMore, hasMore, count }) => {
        if (isLoadingMore) {
            return (
                <div className="discover-loading discover-grid-footer">
                    <div className="discover-spinner" />
                    <p>Loading more...</p>
                </div>
            )
        }
        if (!hasMore && count > 0) {
            return (
                <p className="discover-grid-end">
                    You've reached the end
                </p>
            )
        }
        return null
    },
)
GridFooter.displayName = 'GridFooter'

// ─── Discover page ────────────────────────────────────────────────────────────

const Discover: React.FC = () => {
    const location = useLocation()
    const isVisible = location.pathname === '/' || location.pathname === '/Discover'

    // Store selectors (each returns a stable slice)
    const results = useDiscoverResults()
    const filters = useDiscoverFilters()
    const loading = useDiscoverLoading()
    const actions = useDiscoverActions()
    const watchlistIds = useDiscoverWatchlistIds()
    const genres = useDiscoverGenres()
    const virtuosoState = useDiscoverVirtuosoState()
    const pageState = useDiscoverPage()

    // Local UI state
    const [removeConfirmItem, setRemoveConfirmItem] = useState<TMDBResult | null>(null)
    const [searchInput, setSearchInput] = useState(filters.query)

    // Refs
    const virtuosoRef = useRef<VirtuosoGridHandle>(null)
    const hasRestoredRef = useRef(false)
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ─── Data fetching ────────────────────────────────────────────────────────
    // Fetch genres + watchlist ids once on mount.
    useEffect(() => {
        void actions.fetchGenres()
        void actions.fetchWatchlistIds()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Fetch page 1 whenever the filter signature changes.
    // We intentionally do NOT include `actions` (stable) or `results` here.
    useEffect(() => {
        if (!isVisible) return
        void actions.fetchData(1)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.mediaType, filters.sortBy, filters.selectedGenre, filters.selectedYear, filters.query, isVisible])

    // ─── Virtuoso state capture / restore ─────────────────────────────────────
    // Capture grid state continuously so we can restore it exactly on return.
    const handleStateChanged = useCallback(
        (state: GridStateSnapshot) => {
            actions.setVirtuosoState(state)
        },
        [actions],
    )

    // Restore saved state once after the data is loaded and the grid is mounted.
    // We only do this the first time the page becomes visible with data.
    useEffect(() => {
        if (!isVisible || !loading.isDataLoaded || hasRestoredRef.current) return
        hasRestoredRef.current = true
        // restoreStateFrom is passed as a prop; nothing imperative needed here.
    }, [isVisible, loading.isDataLoaded])

    // Reset the "has restored" flag when the filter signature changes so that
    // a fresh grid starts from the top.
    useEffect(() => {
        hasRestoredRef.current = false
    }, [filters.mediaType, filters.sortBy, filters.selectedGenre, filters.selectedYear, filters.query])

    // ─── Infinite scroll ──────────────────────────────────────────────────────
    const handleEndReached = useCallback(
        () => {
            if (pageState.hasMore && !pageState.isLoadingMore && !pageState.isLoading) {
                void actions.fetchData(pageState.page + 1)
            }
        },
        [actions, pageState.hasMore, pageState.isLoadingMore, pageState.isLoading, pageState.page],
    )

    // ─── Search ───────────────────────────────────────────────────────────────
    // Debounced: update the store query 350ms after the user stops typing.
    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value
            setSearchInput(value)
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
            searchTimerRef.current = setTimeout(() => {
                actions.setQuery(value.trim())
            }, 350)
        },
        [actions],
    )

    // Cleanup search timer on unmount
    useEffect(() => {
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
        }
    }, [])

    const handleSearchSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault()
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
            actions.setQuery(searchInput.trim())
        },
        [actions, searchInput],
    )

    // ─── Filters ──────────────────────────────────────────────────────────────
    const handleClearFilters = useCallback(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
        actions.resetFilters()
        setSearchInput('')
    }, [actions])

    const handleMediaType = useCallback(
        (mediaType: MediaType) => {
            actions.setMediaType(mediaType)
        },
        [actions],
    )

    const handleSortBy = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            actions.setSortBy(e.target.value as SortBy)
        },
        [actions],
    )

    const handleGenre = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            actions.setSelectedGenre(e.target.value ? Number(e.target.value) : null)
        },
        [actions],
    )

    const handleYear = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            actions.setSelectedYear(e.target.value ? Number(e.target.value) : null)
        },
        [actions],
    )

    // ─── Watchlist interactions ───────────────────────────────────────────────
    const handleAddToWatchlist = useCallback(
        (item: TMDBResult) => {
            if (watchlistIds.has(item.id)) {
                setRemoveConfirmItem(item)
            } else {
                void actions.addToWatchlist(item.id, item)
            }
        },
        [actions, watchlistIds],
    )

    const handleConfirmRemove = useCallback(() => {
        if (removeConfirmItem) {
            void actions.removeFromWatchlist(removeConfirmItem.id)
            setRemoveConfirmItem(null)
        }
    }, [actions, removeConfirmItem])

    const handleCancelRemove = useCallback(() => setRemoveConfirmItem(null), [])

    // ─── Memoized year options ────────────────────────────────────────────────
    const yearOptions = useMemo(
        () => Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i),
        [],
    )

    // ─── Render ───────────────────────────────────────────────────────────────
    if (!isVisible) {
        return <div className="discover-page" style={{ display: 'none' }} />
    }

    const showInitialLoading = loading.isLoading && !loading.isDataLoaded
    const showEmpty = loading.isDataLoaded && results.length === 0 && !loading.isLoading

    return (
        <div className="discover-page">
            <div className="discover-container">
                <div className="discover-search-wrap">
                    <form onSubmit={handleSearchSubmit}>
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
                                onChange={handleSearchChange}
                            />
                        </div>
                    </form>
                </div>

                <div className="discover-controls">
                    <div className="discover-tabs">
                        <button
                            className={`discover-tab ${filters.mediaType === 'all' ? 'active' : ''}`}
                            onClick={() => handleMediaType('all')}
                        >
                            All
                        </button>
                        <button
                            className={`discover-tab ${filters.mediaType === 'movie' ? 'active' : ''}`}
                            onClick={() => handleMediaType('movie')}
                        >
                            Movies
                        </button>
                        <button
                            className={`discover-tab ${filters.mediaType === 'tv' ? 'active' : ''}`}
                            onClick={() => handleMediaType('tv')}
                        >
                            TV Shows
                        </button>
                        <button
                            className={`discover-tab ${filters.mediaType === 'person' ? 'active' : ''}`}
                            onClick={() => handleMediaType('person')}
                        >
                            People
                        </button>
                    </div>
                    {filters.mediaType !== 'person' && (
                        <div className="discover-sorts">
                            <select
                                className="discover-filter-select"
                                value={filters.sortBy}
                                onChange={handleSortBy}
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
                                onChange={handleGenre}
                            >
                                <option value="">All Genres</option>
                                {genres.map((genre) => (
                                    <option key={genre.id} value={genre.id}>
                                        {genre.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="discover-filter-select"
                                value={filters.selectedYear ?? ''}
                                onChange={handleYear}
                            >
                                <option value="">All Years</option>
                                {yearOptions.map((year) => (
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

                {showInitialLoading ? (
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading...</p>
                    </div>
                ) : showEmpty ? (
                    <div className="discover-empty">
                        <p>{filters.query ? 'No results found' : 'Nothing to show'}</p>
                    </div>
                ) : (
                    <div className="discover-grid-wrap">
                        <VirtuosoGrid
                            ref={virtuosoRef}
                            className="discover-virtuoso"
                            data={results}
                            computeItemKey={(index, item) => `${item.media_type}-${item.id}-${index}`}
                            itemContent={(index, item) => (
                                <MediaCard
                                    item={item}
                                    compact={item.media_type === 'person'}
                                    onAdd={handleAddToWatchlist}
                                    isInWatchlist={watchlistIds.has(item.id)}
                                />
                            )}
                            endReached={handleEndReached}
                            overscan={800}
                            increaseViewportBy={{ top: 800, bottom: 800 }}
                            components={{
                                List: GridList,
                                Item: GridItem,
                                Scroller: GridScroller,
                                Footer: () => (
                                    <GridFooter
                                        isLoadingMore={loading.isLoadingMore}
                                        hasMore={loading.hasMore}
                                        count={results.length}
                                    />
                                ),
                            }}
                            stateChanged={handleStateChanged}
                            restoreStateFrom={virtuosoState ?? undefined}
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
                    onCancel={handleCancelRemove}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                />
            )}
        </div>
    )
}

export default Discover
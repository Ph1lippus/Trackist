import React, { useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useSelectionStore } from '../stores/useSelectionStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { VirtuosoGrid } from 'react-virtuoso'
import { removeAllWatchedEpisodes } from '../services/watchlistService'
import { useMobile } from '../contexts/useMobile'

const Finished: React.FC = () => {
    usePageTitle('Trackist - Finished')
    const { committedQuery } = useSearch()

    // Use global store with proper selector
    const finished = useLibraryStore((state) => state.finished)

    const [unwatchModal, setUnwatchModal] = useState<{
        isOpen: boolean
        item: WatchlistItem
        isTV: boolean
    } | null>(null)
    const [unwatchLoading, setUnwatchLoading    ] = useState(false)

    const { 
        finishedSelectionMode: selectionMode, 
        finishedSelectedIds: selectedIds, 
        toggleFinishedSelection: toggleSelection 
    } = useSelectionStore()

    const { isMobile } = useMobile()

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Filter items based on global search (both movie + tv types)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return finished
        return finished.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [finished, committedQuery])

    const finishedMovies = useMemo(() => filteredItems.filter(item => item.media_type === 'movie' && item.status !== 'dropped').sort((a, b) => {
        // Sort by completed_at, falling back to updated_at (most recent first)
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const finishedTVShows = useMemo(() => filteredItems.filter(item => (item.media_type === 'tv' || item.media_type === 'anime') && item.status !== 'dropped').sort((a, b) => {
        // Sort by completed_at, falling back to updated_at (most recent first)
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

    const pausedItems = useMemo(() => filteredItems.filter(item => item.status === 'paused').sort((a, b) => {
        // Sort by updated_at (most recent first)
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

    const droppedItems = useMemo(() => filteredItems.filter(item => item.status === 'dropped').sort((a, b) => {
        // Sort by updated_at (most recent first)
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type === 'anime' ? 'tv' : item.media_type
    })

    const handleUnwatchMovie = async (item: WatchlistItem) => {
        await useLibraryStore.getState().updateStatus(item.id, 'planning')
        // Refresh the store to update the UI
        await useLibraryStore.getState().refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchTVShow = async (item: WatchlistItem) => {
        // Remove all watched episodes AND update status
        await removeAllWatchedEpisodes(item.id)
        // Refresh the store to update the UI
        await useLibraryStore.getState().refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchConfirm = async () => {
        if (!unwatchModal) return
        
        setUnwatchLoading(true)
        try {
            if (unwatchModal.isTV) {
                await handleUnwatchTVShow(unwatchModal.item)
            } else {
                await handleUnwatchMovie(unwatchModal.item)
            }
        } finally {
            setUnwatchLoading(false)
        }
    }

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                {/* Finished TV Shows */}
                {finishedTVShows.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Finished TV Shows</h3>
                        </div>
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 600 : 1200,
                                bottom: isMobile ? 2000 : 3000,
                            }}
                            computeItemKey={(index) => finishedTVShows[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={finishedTVShows}
                            overscan={isMobile ? 800 : 1500}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = finishedTVShows[index]
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: true })}
                                        />
                                    </div>
                                )
                            }}
                        />
                    </div>
                )}

                {/* Finished Movies */}
                {finishedMovies.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Finished Movies</h3>
                        </div>
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 600 : 1200,
                                bottom: isMobile ? 2000 : 3000,
                            }}
                            computeItemKey={(index) => finishedMovies[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={finishedMovies}
                            overscan={isMobile ? 800 : 1500}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = finishedMovies[index]
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: false })}
                                        />
                                    </div>
                                )
                            }}
                        />
                    </div>
                )}

                {/* Paused Shows */}
                {pausedItems.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Paused</h3>
                        </div>
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 600 : 1200,
                                bottom: isMobile ? 2000 : 3000,
                            }}
                            computeItemKey={(index) => pausedItems[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={pausedItems}
                            overscan={isMobile ? 800 : 1500}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = pausedItems[index]
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: item.media_type === 'tv' || item.media_type === 'anime' })}
                                        />
                                    </div>
                                )
                            }}
                        />
                    </div>
                )}

                {/* Dropped */}
                {droppedItems.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Dropped</h3>
                        </div>
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 600 : 1200,
                                bottom: isMobile ? 2000 : 3000,
                            }}
                            computeItemKey={(index) => droppedItems[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={droppedItems}
                            overscan={isMobile ? 800 : 1500}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = droppedItems[index]
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: item.media_type === 'tv' || item.media_type === 'anime' })}
                                        />
                                    </div>
                                )
                            }}
                        />
                    </div>
                )}

                {finished.length === 0 && pausedItems.length === 0 && droppedItems.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No finished movies, TV shows, or paused items yet. Complete some from your watchlist!
                    </p>
                )}
            </div>

            <button className="upcoming-new-scroll-top" onClick={scrollToTop} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>

            {unwatchModal && (
                <ConfirmModal
                    isOpen={unwatchModal.isOpen}
                    title={unwatchModal.isTV ? 'Remove All Episodes' : 'Move Back to Watchlist'}
                    message={
                        unwatchModal.isTV
                            ? `Are you sure you want to remove all watched episodes from "${unwatchModal.item.title}" and move it back to your watchlist?`
                            : `Are you sure you want to move "${unwatchModal.item.title}" back to your watchlist?`
                    }
                    onConfirm={handleUnwatchConfirm}
                    onCancel={() => setUnwatchModal(null)}
                    confirmText="Yes, Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                    confirmLoading={unwatchLoading}
                />
            )}
        </div>
    )
}

export default Finished
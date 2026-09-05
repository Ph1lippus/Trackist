import React, { useMemo, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useSelectionStore } from '../stores/useSelectionStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { removeAllWatchedEpisodes } from '../services/watchlistService'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'

const Finished: React.FC = () => {
    usePageTitle('Track1st - Finished')
    const { committedQuery } = useSearch()
    const { showIcons } = useMediaCardIcons()

    const finished = useLibraryStore((state) => state.finished)
    const isLibraryInitialized = useLibraryStore((state) => state.isInitialized)

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


    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    

    const filteredItems = useMemo(() => {
        if (!committedQuery) return finished
        return finished.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [finished, committedQuery])

    const finishedMovies = useMemo(() => filteredItems.filter(item => item.media_type === 'movie' && item.status !== 'dropped').sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const finishedTVShows = useMemo(() => filteredItems.filter(item => item.media_type === 'tv' && item.status !== 'dropped').sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const pausedItems = useMemo(() => filteredItems.filter(item => item.status === 'paused').sort((a, b) => {
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const droppedItems = useMemo(() => filteredItems.filter(item => item.status === 'dropped').sort((a, b) => {
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type
    })

    const handleUnwatchMovie = async (item: WatchlistItem) => {
        await useLibraryStore.getState().updateStatus(item.id, 'planning')
        await useLibraryStore.getState().refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchTVShow = async (item: WatchlistItem) => {
        await removeAllWatchedEpisodes(item.id)
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
                        <div className="discover-grid">
                            {finishedTVShows.map((item) => {
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                    <MediaCard
                                        item={buildTmdbItem(item)}
                                        selected={selectionMode && isSelected}
                                        selectable={selectionMode}
                                        onSelect={() => toggleSelection(item.id)}
                                        isInWatchlist={true}
                                        onAdd={selectionMode ? undefined : () => {}}
                                        onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: true })}
                                        showIcons={showIcons}
                                    />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Finished Movies */}
                {finishedMovies.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Finished Movies</h3>
                        </div>
                        <div className="discover-grid">
                            {finishedMovies.map((item) => {
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: false })}
                                            showIcons={showIcons}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Paused Shows */}
                {pausedItems.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Paused</h3>
                        </div>
                        <div className="discover-grid">
                            {pausedItems.map((item) => {
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: item.media_type === 'tv' })}
                                            showIcons={showIcons}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Dropped */}
                {droppedItems.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Dropped</h3>
                        </div>
                        <div className="discover-grid">
                            {droppedItems.map((item) => {
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item, isTV: item.media_type === 'tv' })}
                                            showIcons={showIcons}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {isLibraryInitialized && finished.length === 0 && pausedItems.length === 0 && droppedItems.length === 0 && (
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


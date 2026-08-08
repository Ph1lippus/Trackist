import React, { useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { VirtuosoGrid } from 'react-virtuoso'
import { useMobile } from '../contexts/useMobile'

const Movies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const { committedQuery } = useSearch()

    const movies = useLibraryStore((state) => state.movies)

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch'
        item: TMDBResult
    } | null>(null)

    const [actionLoading, setActionLoading] = useState(false)

    const [selectionMode, setSelectionMode] = useState(() => {
        try {
            const cached = localStorage.getItem('trackist-selection:movies')
            if (cached) {
                const parsed = JSON.parse(cached)
                return parsed.selectionMode || false
            }
        } catch {
            // ignore localStorage errors
        }
        return false
    })
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        try {
            const cached = localStorage.getItem('trackist-selection:movies')
            if (cached) {
                const parsed = JSON.parse(cached)
                return new Set(parsed.selectedIds || [])
            }
        } catch {
            // ignore localStorage errors
        }
        return new Set()
    })
    const [batchLoading, setBatchLoading] = useState(false)

    const { isMobile } = useMobile()

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    useEffect(() => {
        const cacheKey = 'trackist-selection:movies'
        try {
            localStorage.setItem(cacheKey, JSON.stringify({
                selectionMode,
                selectedIds: Array.from(selectedIds)
            }))
        } catch {
            // ignore storage errors
        }
    }, [selectionMode, selectedIds])

    const updateStatus = async (id: string, status: string) => {
        await useLibraryStore.getState().updateStatus(id, status as WatchlistItem['status'])
    }

    const markAsWatched = async (tmdbItem: TMDBResult) => {
        const watchlistItem = movies.find(item => item.tmdb_id === tmdbItem.id)
        if (watchlistItem) {
            if (!isMovieReleased(watchlistItem)) {
                alert('This movie has not been released yet. You cannot mark it as watched.')
                return
            }
            
            const previousStatus = watchlistItem.status
            await updateStatus(watchlistItem.id, 'completed')
            if (previousStatus === 'planning') {
                launchCosmicConfetti()
            }
        }
    }

    const markAsUnwatched = async (tmdbItem: TMDBResult) => {
        const watchlistItem = movies.find(item => item.tmdb_id === tmdbItem.id)
        if (watchlistItem) {
            await updateStatus(watchlistItem.id, 'planning')
        }
    }

    const handleConfirmAction = async () => {
        if (!confirmModal || actionLoading) return
        
        setActionLoading(true)
        try {
            if (confirmModal.action === 'watch') {
                await markAsWatched(confirmModal.item)
            } else {
                await markAsUnwatched(confirmModal.item)
            }
            
            setConfirmModal(null)
        } finally {
            setActionLoading(false)
        }
    }

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(id)) {
                newSet.delete(id)
            } else {
                newSet.add(id)
            }
            return newSet
        })
    }

    const handleBatchMarkWatched = async () => {
        if (selectedIds.size === 0) return

        setBatchLoading(true)
        try {
            const selectedItems = movies.filter(item => selectedIds.has(item.id))
            
            for (const item of selectedItems) {
                if (isMovieReleased(item)) {
                    await updateStatus(item.id, 'completed')
                    if (item.status === 'planning') {
                        launchCosmicConfetti()
                    }
                }
            }
            
            setSelectedIds(new Set())
            setSelectionMode(false)
        } catch (err) {
            console.error('Failed to batch mark as watched:', err)
        } finally {
            setBatchLoading(false)
        }
    }

    const clearSelection = () => {
        setSelectedIds(new Set())
        setSelectionMode(false)
    }

    // Filter items based on global search (strict movie-type lock)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return movies
        return movies.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [movies, committedQuery])

    const isMovieReleased = (item: WatchlistItem): boolean => {
        if (!item.release_date) return true
        const releaseDate = new Date(item.release_date)
        const today = new Date()
        return releaseDate <= today
    }

    const watchlistItems = useMemo(() => filteredItems.filter(item => 
        item.status === 'planning' && isMovieReleased(item)
    ).sort((a, b) => {
        const dateA = new Date(a.added_at || 0)
        const dateB = new Date(b.added_at || 0)
        return dateA.getTime() - dateB.getTime()
    }), [filteredItems])

    const notReleasedItems = useMemo(() => filteredItems.filter(item => 
        item.status === 'planning' && !isMovieReleased(item)
    ).sort((a, b) => {
        const dateA = new Date(a.release_date || '9999-12-31')
        const dateB = new Date(b.release_date || '9999-12-31')
        return dateA.getTime() - dateB.getTime()
    }), [filteredItems])

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                <div className="watchlist-section">
                    <div className="watchlist-section__header" style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '1rem'
                    }}>
                        <h3 className="watchlist-section__title">To Watch</h3>
                        
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {!selectionMode ? (
                                <button
                                    className="discover-filter-select discover-filter-select--btn"
                                    onClick={() => setSelectionMode(true)}
                                    disabled={watchlistItems.length === 0}
                                >
                                    Select
                                </button>
                            ) : (
                                <>
                                    <span style={{ 
                                        color: 'rgba(255,255,255,0.6)', 
                                        fontSize: '0.85rem',
                                        marginRight: '0.5rem'
                                    }}>
                                        {selectedIds.size} selected
                                    </span>
                                    <button
                                        className="discover-filter-select discover-filter-select--btn"
                                        onClick={clearSelection}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="discover-filter-select discover-filter-select--btn"
                                        onClick={handleBatchMarkWatched}
                                        disabled={selectedIds.size === 0 || batchLoading}
                                    >
                                        {batchLoading ? (
                                            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>
                                        ) : null}
                                        {batchLoading ? '' : 'Mark as Watched'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    {watchlistItems.length > 0 ? (
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 600 : 1200,
                                bottom: isMobile ? 2000 : 3000,
                            }}
                            computeItemKey={(index) => watchlistItems[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={watchlistItems}
                            overscan={isMobile ? 800 : 1500}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = watchlistItems[index]
                                const tmdbItem: TMDBResult = {
                                    id: item.tmdb_id as number,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    media_type: 'movie'
                                }
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={tmdbItem}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkWatched={selectionMode ? undefined : (tmdbItem) => {
                                                if (!isMovieReleased(item)) {
                                                    alert('This movie has not been released yet. You cannot mark it as watched.')
                                                    return
                                                }
                                                setConfirmModal({ isOpen: true, action: 'watch', item: tmdbItem })
                                            }}
                                        />
                                    </div>
                                )
                            }}
                        />
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No movies to watch. Add some!
                        </p>
                    )}
                </div>

                {/* Not Released Movies */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Not Released</h3>
                    </div>
                    {notReleasedItems.length > 0 ? (
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 600 : 1200,
                                bottom: isMobile ? 2000 : 3000,
                            }}
                            computeItemKey={(index) => notReleasedItems[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={notReleasedItems}
                            overscan={isMobile ? 800 : 1500}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = notReleasedItems[index]
                                const tmdbItem: TMDBResult = {
                                    id: item.tmdb_id as number,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    media_type: 'movie'
                                }
                                return (
                                    <MediaCard
                                        item={tmdbItem}
                                        isInWatchlist={true}
                                        onAdd={() => {}}
                                    />
                                )
                            }}
                        />
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No upcoming movies
                        </p>
                    )}
                </div>
            </div>

            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title={confirmModal.action === 'watch' ? 'Mark as Watched' : 'Mark as Unwatched'}
                    message={
                        confirmModal.action === 'watch'
                            ? `Are you sure you want to mark "${confirmModal.item.title || confirmModal.item.name}" as watched?`
                            : `Are you sure you want to mark "${confirmModal.item.title || confirmModal.item.name}" as unwatched?`
                    }
                    onConfirm={handleConfirmAction}
                    onCancel={() => setConfirmModal(null)}
                    confirmText={confirmModal.action === 'watch' ? 'Mark as Watched' : 'Mark as Unwatched'}
                    cancelText="Cancel"
                    confirmColor={confirmModal.action === 'watch' ? 'success' : 'danger'}
                    confirmLoading={actionLoading}
                />
            )}
        </div>
    )
}

export default Movies

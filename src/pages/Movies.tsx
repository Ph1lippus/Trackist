import React, { useEffect, useMemo, useState } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useSelectionStore } from '../stores/useSelectionStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { useMobile } from '../contexts/useMobile'

const Movies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const navigate = useNavigate()
    const { committedQuery } = useSearch()

    const movies = useLibraryStore((state) => state.movies)

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch'
        item: TMDBResult
    } | null>(null)

    const [actionLoading, setActionLoading] = useState(false)

    const { 
        moviesSelectionMode: selectionMode, 
        moviesSelectedIds: selectedIds, 
        toggleMovieSelection: toggleSelection 
    } = useSelectionStore()

    const { isMobile } = useMobile()

    const handleSwitchToMobile = () => {
        navigate('/MobileMovies')
    }

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

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
            {isMobile && (
                <button
                    className="mobile-view-toggle-fixed"
                    onClick={handleSwitchToMobile}
                    title="Switch to Mobile View"
                >
                    <i className="fa-solid fa-mobile-screen"></i>
                </button>
            )}
            <div className="discover-container" style={{ width: '85%' }}>
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">To Watch</h3>
                    </div>
                    {watchlistItems.length > 0 ? (
                        <div className="discover-grid">
                            {watchlistItems.map((item) => {
                                const tmdbItem: TMDBResult = {
                                    id: item.tmdb_id as number,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    media_type: 'movie'
                                }
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
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
                            })}
                        </div>
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
                        <div className="discover-grid">
                            {notReleasedItems.map((item) => {
                                const tmdbItem: TMDBResult = {
                                    id: item.tmdb_id as number,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    media_type: 'movie'
                                }
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={tmdbItem}
                                            isInWatchlist={true}
                                            onAdd={() => {}}
                                        />
                                    </div>
                                )
                            })}
                        </div>
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

            <button className="upcoming-new-scroll-top" onClick={scrollToTop} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>
        </div>
    )
}

export default Movies

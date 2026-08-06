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

    // Use global store with proper selector
    const movies = useLibraryStore((state) => state.movies)

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch'
        item: TMDBResult
    } | null>(null)

    const { isMobile } = useMobile()

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const updateStatus = async (id: string, status: string) => {
        await useLibraryStore.getState().updateStatus(id, status as WatchlistItem['status'])
    }

    const markAsWatched = async (tmdbItem: TMDBResult) => {
        const watchlistItem = movies.find(item => item.tmdb_id === tmdbItem.id)
        if (watchlistItem) {
            // Check if movie is released
            if (!isMovieReleased(watchlistItem)) {
                alert('This movie has not been released yet. You cannot mark it as watched.')
                return
            }
            
            const previousStatus = watchlistItem.status
            await updateStatus(watchlistItem.id, 'completed')
            // Trigger Cosmic Confetti when transitioning from 'planning' to 'completed'
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
        if (!confirmModal) return
        
        if (confirmModal.action === 'watch') {
            await markAsWatched(confirmModal.item)
        } else {
            await markAsUnwatched(confirmModal.item)
        }
        
        setConfirmModal(null)
    }

    // Filter items based on global search (strict movie-type lock)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return movies
        return movies.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [movies, committedQuery])

    // Helper function to check if a movie is released
    const isMovieReleased = (item: WatchlistItem): boolean => {
        if (!item.release_date) return true // Assume released if no date
        const releaseDate = new Date(item.release_date)
        const today = new Date()
        return releaseDate <= today
    }

    // Container A: To Watch (Released movies in planning status)
    const watchlistItems = useMemo(() => filteredItems.filter(item => 
        item.status === 'planning' && isMovieReleased(item)
    ).sort((a, b) => {
        // Sort by added_at (oldest first to newest at the end)
        const dateA = new Date(a.added_at || 0)
        const dateB = new Date(b.added_at || 0)
        return dateA.getTime() - dateB.getTime()
    }), [filteredItems])

    // Container B: Not Released (Movies that haven't been released yet)
    const notReleasedItems = useMemo(() => filteredItems.filter(item => 
        item.status === 'planning' && !isMovieReleased(item)
    ).sort((a, b) => {
        // Sort by release date (soonest first)
        const dateA = new Date(a.release_date || '9999-12-31')
        const dateB = new Date(b.release_date || '9999-12-31')
        return dateA.getTime() - dateB.getTime()
    }), [filteredItems])

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">To Watch</h3>
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
                                return (
                                    <MediaCard
                                        item={tmdbItem}
                                        isInWatchlist={true}
                                        onAdd={() => {}}
                                        onMarkWatched={(tmdbItem) => {
                                            if (!isMovieReleased(item)) {
                                                alert('This movie has not been released yet. You cannot mark it as watched.')
                                                return
                                            }
                                            setConfirmModal({ isOpen: true, action: 'watch', item: tmdbItem })
                                        }}
                                    />
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
                                        // Don't show watch icon for unreleased movies
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
                />
            )}
        </div>
    )
}

export default Movies
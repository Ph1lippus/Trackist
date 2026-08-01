import React, { useEffect, useState, useMemo } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'

const Movies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const { clearScrollPosition } = useScrollRestoration()
    const { committedQuery } = useSearch()
    
    // Use global store
    const store = useLibraryStore()
    const movies = store.movies
    
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch' 
        item: TMDBResult
    } | null>(null)

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Clear scroll position when navigating to detail page
    useEffect(() => {
        const handleNavigation = () => {
            clearScrollPosition()
        }
        
        window.addEventListener('beforeunload', handleNavigation)
        return () => window.removeEventListener('beforeunload', handleNavigation)
    }, [clearScrollPosition])

    const updateStatus = async (id: string, status: string) => {
        await store.updateStatus(id, status as WatchlistItem['status'])
    }

    const markAsWatched = async (tmdbItem: TMDBResult) => {
        const watchlistItem = movies.find(item => item.tmdb_id === tmdbItem.id)
        if (watchlistItem) {
            await updateStatus(watchlistItem.id, 'completed')
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

    const watchlistItems = filteredItems.filter(item => item.status === 'planning')

    const visibleWatchlistItems = watchlistItems

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">To Watch</h3>
                    </div>
                    {watchlistItems.length > 0 ? (
                        <div className={`discover-grid`}>
                            {visibleWatchlistItems.map((item) => {
                                const tmdbItem: TMDBResult = {
                                    id: item.tmdb_id as number,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    media_type: 'movie'
                                }
                                return (
                                    <MediaCard
                                        key={item.id}
                                        item={tmdbItem}
                                        isInWatchlist={true}
                                        onAdd={() => {}}
                                        onMarkWatched={(item) => setConfirmModal({ isOpen: true, action: 'watch', item })}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No movies to watch. Add some!
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
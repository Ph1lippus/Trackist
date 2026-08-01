import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../services/supabaseClient'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'

const Movies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const { clearScrollPosition } = useScrollRestoration()
    const { searchQuery } = useSearch()
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch' 
        item: TMDBResult
    } | null>(null)
    

    useEffect(() => {
        const fetchWatchlist = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', user.id)
                .eq('media_type', 'movie')
                .order('updated_at', { ascending: false })

            if (!error) {
                setItems(data || [])
            }
            setLoading(false)
        }
        fetchWatchlist()
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
        const updateData: Record<string, string> = { status, updated_at: new Date().toISOString() }
        if (status === 'completed') {
            updateData.completed_at = new Date().toISOString()
        }
        const { error } = await supabase.from('watchlist').update(updateData).eq('id', id)
        if (!error) {
            setItems(items.map(item => item.id === id ? { ...item, status: status as WatchlistItem['status'] } : item))
        }
    }

    const markAsWatched = async (tmdbItem: TMDBResult) => {
        const watchlistItem = items.find(item => item.tmdb_id === tmdbItem.id)
        if (watchlistItem) {
            await updateStatus(watchlistItem.id, 'completed')
        }
    }

    const markAsUnwatched = async (tmdbItem: TMDBResult) => {
        const watchlistItem = items.find(item => item.tmdb_id === tmdbItem.id)
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

    // Filter items based on global search
    const filteredItems = useMemo(() => {
        if (!searchQuery) return items
        return items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
    }, [items, searchQuery])

    const watchlistItems = filteredItems.filter(item => item.status === 'planning')

    const visibleWatchlistItems = watchlistItems

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

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
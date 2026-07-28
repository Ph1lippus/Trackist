import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../services/supabaseClient'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'

const INITIAL_WATCHED_LIMIT = 8

const Movies: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch' 
        item: TMDBResult
    } | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [watchedDisplayCount, setWatchedDisplayCount] = useState(INITIAL_WATCHED_LIMIT)

    const watchedSentinelRef = useRef<HTMLDivElement>(null)

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
        
        // Restore scroll position
        const savedPosition = sessionStorage.getItem('scrollPosition')
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition))
            sessionStorage.removeItem('scrollPosition')
        }
    }, [])

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
            await updateStatus(watchlistItem.id, 'watching')
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

    const filteredItems = items.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const watchlistItems = filteredItems.filter(item => item.status === 'watching')
    const watchedItems = filteredItems.filter(item => item.status !== 'watching')

    const visibleWatchedItems = watchedItems.slice(0, watchedDisplayCount)
    const hasMoreWatched = watchedDisplayCount < watchedItems.length

    // Infinite scroll observer for watched section
    useEffect(() => {
        const sentinel = watchedSentinelRef.current
        if (!sentinel || !hasMoreWatched) return

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setWatchedDisplayCount(prev => prev + INITIAL_WATCHED_LIMIT)
            }
        }, { rootMargin: '400px' })

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMoreWatched, watchedItems.length])

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

    return (
        <div className="discover-page">
            <div className="discover-container">
                <div className="discover-search-wrap">
                    <form onSubmit={(e) => e.preventDefault()}>
                        <div className="discover-search-box">
                            <svg className="discover-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                className="discover-search"
                                placeholder="Search your movies..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                {/* Container 1 (Top): Watchlist (to watch) */}
                <div className="watchlist-section">
                    <h3 className="watchlist-section__title">To Watch</h3>
                    {watchlistItems.length > 0 ? (
                        <div className="discover-grid">
                            {watchlistItems.map((item) => {
                                const tmdbItem: TMDBResult = {
                                    id: item.tmdb_id as number,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    vote_average: item.vote_average,
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
                            {searchQuery ? 'No movies match your search' : 'No movies to watch. Add some!'}
                        </p>
                    )}
                </div>

                {/* Container 2 (Bottom): Already Watched with infinite scroll */}
                <div className="watchlist-section">
                    <h3 className="watchlist-section__title">Already Watched</h3>
                    {visibleWatchedItems.length > 0 ? (
                        <>
                            <div className="discover-grid watchlist-grid--watched">
                                {visibleWatchedItems.map((item) => {
                                    const tmdbItem: TMDBResult = {
                                        id: item.tmdb_id as number,
                                        title: item.title,
                                        poster_path: item.poster_path,
                                        vote_average: item.vote_average,
                                        media_type: 'movie'
                                    }
                                    return (
                                        <MediaCard
                                            key={item.id}
                                            item={tmdbItem}
                                            isInWatchlist={true}
                                            onAdd={() => {}}
                                            onMarkUnwatched={(item) => setConfirmModal({ isOpen: true, action: 'unwatch', item })}
                                        />
                                    )
                                })}
                            </div>
                            {hasMoreWatched && (
                                <div ref={watchedSentinelRef} style={{ height: '1px' }} />
                            )}
                        </>
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No watched movies yet
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
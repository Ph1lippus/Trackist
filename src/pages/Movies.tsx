import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import MediaCard from '../components/MediaCard'
import DetailModal from '../components/DetailModal'
import ConfirmModal from '../components/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'

const Movies: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedMovie, setSelectedMovie] = useState<TMDBResult | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch'
        item: TMDBResult
    } | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

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

    const handleCardClick = (item: TMDBResult) => {
        setSelectedMovie(item)
    }

    const handleCloseModal = () => {
        setSelectedMovie(null)
    }

    const handleAddFromModal = async (item: TMDBResult, status: string) => {
        await updateStatus(item.id.toString(), status)
        setSelectedMovie(null)
    }

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

                {watchlistItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">To Watch</h3>
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
                                        onDetail={handleCardClick}
                                        onAdd={() => {}}
                                        onMarkWatched={(item) => setConfirmModal({ isOpen: true, action: 'watch', item })}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )}

                {watchedItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Watched</h3>
                        <div className="discover-grid watchlist-grid--watched">
                            {watchedItems.map((item) => {
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
                                        onDetail={handleCardClick}
                                        onAdd={() => {}}
                                        onMarkUnwatched={(item) => setConfirmModal({ isOpen: true, action: 'unwatch', item })}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )}

                {filteredItems.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        {searchQuery ? 'No movies match your search' : 'No movies in your watchlist. Discover some!'}
                    </p>
                )}
            </div>

            {selectedMovie && (
                <DetailModal
                    item={selectedMovie}
                    onClose={handleCloseModal}
                    onAdd={handleAddFromModal}
                    isInWatchlist={true}
                />
            )}

            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title={confirmModal.action === 'watch' ? 'Mark as Watched' : 'Move to Watchlist'}
                    message={
                        confirmModal.action === 'watch'
                            ? `Are you sure you want to mark "${confirmModal.item.title || confirmModal.item.name}" as watched?`
                            : `Are you sure you want to move "${confirmModal.item.title || confirmModal.item.name}" back to your watchlist?`
                    }
                    onConfirm={handleConfirmAction}
                    onCancel={() => setConfirmModal(null)}
                    confirmText="Confirm"
                    cancelText="Cancel"
                    confirmColor={confirmModal.action === 'watch' ? 'success' : 'danger'}
                />
            )}
        </div>
    )
}

export default Movies
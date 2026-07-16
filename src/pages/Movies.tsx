import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import type { WatchlistItem } from '../types'

const Movies: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState<string | null>(null)

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
        setUpdating(id)
        const updateData: Record<string, string> = { status, updated_at: new Date().toISOString() }
        if (status === 'completed') {
            updateData.completed_at = new Date().toISOString()
        }
        const { error } = await supabase.from('watchlist').update(updateData).eq('id', id)
        if (!error) {
            setItems(items.map(item => item.id === id ? { ...item, status: status as WatchlistItem['status'] } : item))
        }
        setUpdating(null)
    }

    const removeItem = async (id: string) => {
        if (!confirm('Remove from watchlist?')) return
        const { error } = await supabase.from('watchlist').delete().eq('id', id)
        if (!error) {
            setItems(items.filter(item => item.id !== id))
        }
    }

    const watchlistItems = items.filter(item => item.status === 'watching')
    const watchedItems = items.filter(item => item.status !== 'watching')

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
                <div className="discover-section__head">
                    <h2>Movies</h2>
                    <span>{items.length} total</span>
                </div>


                {watchlistItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Watchlist</h3>
                        <div className="watchlist-grid">
                            {watchlistItems.map((item) => {
                                const poster = item.poster_path ? imageUrl(item.poster_path) : null
                                return (
                                    <div className="watchlist-card" key={item.id}>
                                        <div className="watchlist-card__poster">
                                            {poster ? (
                                                <img src={poster} alt={item.title} />
                                            ) : (
                                                <div className="discover-card__no-poster"><span>{item.title}</span></div>
                                            )}
                                        </div>
                                        <div className="watchlist-card__info">
                                            <h3>{item.title}</h3>
                                            <span className="watchlist-card__type">Movie</span>
                                            {item.overview && <p className="watchlist-card__overview">{item.overview.slice(0, 100)}...</p>}
                                            {item.vote_average && (
                                                <span style={{ fontSize: '0.8rem', color: '#ffad38' }}>★ {item.vote_average.toFixed(1)}</span>
                                            )}
                                            <div className="watchlist-card__status">
                                                <button
                                                    className={`watchlist-status-btn ${item.status === 'watching' ? 'active' : ''}`}
                                                    onClick={() => updateStatus(item.id, 'watching')}
                                                    disabled={updating === item.id}
                                                >Watch</button>
                                                <button
                                                    className={`watchlist-status-btn ${item.status === 'completed' ? 'active' : ''}`}
                                                    onClick={() => updateStatus(item.id, 'completed')}
                                                    disabled={updating === item.id}
                                                >Watched</button>
                                            </div>
                                            <button className="watchlist-remove-btn" onClick={() => removeItem(item.id)}>Remove</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {watchedItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Watched</h3>
                        <div className="watchlist-grid">
                            {watchedItems.map((item) => {
                                const poster = item.poster_path ? imageUrl(item.poster_path) : null
                                return (
                                    <div className="watchlist-card" key={item.id}>
                                        <div className="watchlist-card__poster">
                                            {poster ? (
                                                <img src={poster} alt={item.title} />
                                            ) : (
                                                <div className="discover-card__no-poster"><span>{item.title}</span></div>
                                            )}
                                        </div>
                                        <div className="watchlist-card__info">
                                            <h3>{item.title}</h3>
                                            <span className="watchlist-card__type">Movie</span>
                                            {item.overview && <p className="watchlist-card__overview">{item.overview.slice(0, 100)}...</p>}
                                            {item.vote_average && (
                                                <span style={{ fontSize: '0.8rem', color: '#ffad38' }}>★ {item.vote_average.toFixed(1)}</span>
                                            )}
                                            <button className="watchlist-remove-btn" onClick={() => removeItem(item.id)}>Remove</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}


                {items.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No movies in your watchlist. Discover some!
                    </p>
                )}
            </div>
        </div>
    )
}

export default Movies
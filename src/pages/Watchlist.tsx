import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import type { WatchlistItem } from '../types'

const Watchlist: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'planning' | 'watching' | 'completed' | 'dropped'>('all')
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
                .order('updated_at', { ascending: false })

            if (!error) setItems(data || [])
            setLoading(false)
        }
        fetchWatchlist()
    }, [])

    const updateStatus = async (id: string, status: string) => {
        setUpdating(id)
        const { error } = await supabase.from('watchlist').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
        if (!error) {
            setItems(items.map(item => item.id === id ? { ...item, status: status as WatchlistItem['status'] } : item))
        }
        setUpdating(null)
    }

    const removeItem = async (id: string) => {
        if (!confirm('Remove from watchlist?')) return
        const { error } = await supabase.from('watchlist').delete().eq('id', id)
        if (!error) setItems(items.filter(item => item.id !== id))
    }

    const filtered = filter === 'all' ? items : items.filter(item => item.status === filter)

    const statusCounts = {
        all: items.length,
        planning: items.filter(i => i.status === 'planning').length,
        watching: items.filter(i => i.status === 'watching').length,
        completed: items.filter(i => i.status === 'completed').length,
        dropped: items.filter(i => i.status === 'dropped').length
    }

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Your Watchlist</h2>
                        <span>{items.length} total</span>
                    </div>

                    <div className="watchlist-tabs">
                        <button className={`watchlist-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({statusCounts.all})</button>
                        <button className={`watchlist-tab ${filter === 'planning' ? 'active' : ''}`} onClick={() => setFilter('planning')}>Planning ({statusCounts.planning})</button>
                        <button className={`watchlist-tab ${filter === 'watching' ? 'active' : ''}`} onClick={() => setFilter('watching')}>Watching ({statusCounts.watching})</button>
                        <button className={`watchlist-tab ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>Completed ({statusCounts.completed})</button>
                        <button className={`watchlist-tab ${filter === 'dropped' ? 'active' : ''}`} onClick={() => setFilter('dropped')}>Dropped ({statusCounts.dropped})</button>
                    </div>

                    {filtered.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                            {items.length === 0 ? 'Your watchlist is empty. Start adding movies and shows!' : 'No items with this status.'}
                        </p>
                    ) : (
                        <div className="watchlist-grid">
                            {filtered.map((item) => {
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
                                            <span className="watchlist-card__type">{item.media_type}</span>
                                            {item.overview && <p className="watchlist-card__overview">{item.overview.slice(0, 100)}...</p>}
                                            <div className="watchlist-card__status">
                                                <button
                                                    className={`watchlist-status-btn ${item.status === 'planning' ? 'active' : ''}`}
                                                    onClick={() => updateStatus(item.id, 'planning')}
                                                    disabled={updating === item.id}
                                                >Plan</button>
                                                <button
                                                    className={`watchlist-status-btn ${item.status === 'watching' ? 'active' : ''}`}
                                                    onClick={() => updateStatus(item.id, 'watching')}
                                                    disabled={updating === item.id}
                                                >Watch</button>
                                                <button
                                                    className={`watchlist-status-btn ${item.status === 'completed' ? 'active' : ''}`}
                                                    onClick={() => updateStatus(item.id, 'completed')}
                                                    disabled={updating === item.id}
                                                >Done</button>
                                                <button
                                                    className={`watchlist-status-btn ${item.status === 'dropped' ? 'active' : ''}`}
                                                    onClick={() => updateStatus(item.id, 'dropped')}
                                                    disabled={updating === item.id}
                                                >Drop</button>
                                            </div>
                                            <button className="watchlist-remove-btn" onClick={() => removeItem(item.id)}>Remove</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default Watchlist
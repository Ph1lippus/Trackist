import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import type { WatchlistItem } from '../types'
import MediaDetailView from '../components/MediaDetailView'

const TVShows: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'planning' | 'watching' | 'completed' | 'dropped'>('all')
    const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null)

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
                .in('media_type', ['tv', 'anime'])
                .order('updated_at', { ascending: false })

            if (!error) {
                setItems(data || [])
            }
            setLoading(false)
        }
        fetchWatchlist()
    }, [])

    const refreshItems = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', user.id)
            .in('media_type', ['tv', 'anime'])
            .order('updated_at', { ascending: false })
        if (data) setItems(data)
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
        <div className="discover-page">
            <div className="discover-container">
                <div className="discover-section__head">
                    <h2>TV Shows</h2>
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
                        {items.length === 0 ? 'No TV shows or anime in your watchlist. Discover some!' : 'No items with this status.'}
                    </p>
                ) : (
                    <div className="discover-grid">
                        {filtered.map((item) => (
                            <article
                                className="media-card"
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                            >
                                <div className="media-card__poster">
                                    {item.poster_path ? (
                                        <img
                                            src={item.media_type === 'anime' ? item.poster_path : imageUrl(item.poster_path) || ''}
                                            alt={item.title}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="media-card__no-poster">
                                            <span>{item.title}</span>
                                        </div>
                                    )}
                                    <div className="media-card__rating" style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--color-orange)', fontSize: '0.6rem' }}>
                                        {item.status}
                                    </div>
                                </div>
                                <div className="media-card__body">
                                    <h3>{item.title}</h3>
                            <span className="media-card__type">TV Show</span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {selectedItem && (
                <MediaDetailView
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    onUpdate={refreshItems}
                />
            )}
        </div>
    )
}

export default TVShows

import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import type { WatchlistItem } from '../types'
import MediaDetailView from '../components/MediaDetailView'

const TVShows: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
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

    const watchingItems = items.filter(item => item.status === 'watching')
    const watchlistItems = items.filter(item => item.status !== 'watching' && item.status !== 'dropped')
    const droppedItems = items.filter(item => item.status === 'dropped')

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

                {watchingItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Currently Watching</h3>
                        <div className="discover-grid">
                            {watchingItems.map((item) => (
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
                                        {item.vote_average && new Date(item.release_date || '9999-12-31') <= new Date() && (
                                            <div className="media-card__rating" style={{ background: 'rgba(0,0,0,0.75)', color: '#ffad38', fontSize: '0.7rem' }}>
                                                ★ {item.vote_average.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="media-card__body">
                                        <h3>{item.title}</h3>
                                        <span className="media-card__type">TV Show</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                )}

                {watchlistItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Watchlist</h3>
                        <div className="discover-grid">
                            {watchlistItems.map((item) => (
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
                                        <div className="media-card__rating" style={{ background: 'rgba(0,0,0,0.75)', color: '#888', fontSize: '0.6rem' }}>
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
                    </div>
                )}


                {droppedItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Dropped</h3>
                        <div className="discover-grid">
                            {droppedItems.map((item) => (
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
                                        <div className="media-card__rating" style={{ background: 'rgba(0,0,0,0.75)', color: '#f44336', fontSize: '0.6rem' }}>
                                            dropped
                                        </div>
                                    </div>
                                    <div className="media-card__body">
                                        <h3>{item.title}</h3>
                                        <span className="media-card__type">TV Show</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                )}

                {items.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No TV shows or anime in your watchlist. Discover some!
                    </p>
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
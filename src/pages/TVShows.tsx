import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import MediaCard from '../components/media/MediaCard'
import AddToListModal from '../components/modals/AddToListModal'
import type { WatchlistItem, TMDBResult } from '../types'

const TVShows: React.FC = () => {
    const navigate = useNavigate()
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
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
                .in('media_type', ['tv', 'anime'])
                .order('updated_at', { ascending: false })

            if (!error) {
                setItems(data || [])
            }
            setLoading(false)
        }
        fetchWatchlist()
    }, [])

    const filteredItems = items.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const watchingItems = filteredItems.filter(item => item.status === 'watching')
    const watchlistItems = filteredItems.filter(item => item.status !== 'watching' && item.status !== 'dropped')
    const droppedItems = filteredItems.filter(item => item.status === 'dropped')

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
                                placeholder="Search your TV shows..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                {watchingItems.length > 0 && (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">Currently Watching</h3>
                        <div className="discover-grid">
                            {watchingItems.map((item) => (
                                <article
                                    className="media-card"
                                    key={item.id}
                                    onClick={() => navigate(`/tv/${item.tmdb_id}`)}
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
                                    onClick={() => navigate(`/tv/${item.tmdb_id}`)}
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
                                    onClick={() => navigate(`/tv/${item.tmdb_id}`)}
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

                {filteredItems.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        {searchQuery ? 'No TV shows match your search' : 'No TV shows or anime in your watchlist. Discover some!'}
                    </p>
                )}
            </div>
        </div>
    )
}

export default TVShows
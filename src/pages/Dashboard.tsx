import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getPopularMovies, imageUrl } from '../services/tmdbService'
import type { WatchlistItem, TMDBResult } from '../types'

const Dashboard: React.FC = () => {
    const navigate = useNavigate()
    const [watching, setWatching] = useState<WatchlistItem[]>([])
    const [popular, setPopular] = useState<TMDBResult[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from('watchlist')
                    .select('*')
                    .eq('user_id', user.id)
                    .in('status', ['watching', 'planning'])
                    .order('updated_at', { ascending: false })
                    .limit(6)
                if (data) setWatching(data)
            }
            const pop = await getPopularMovies()
            setPopular((pop.results || []).slice(0, 6))
            setLoading(false)
        }
        load()
    }, [])

    const getPoster = (path: string | null | undefined) => {
        if (!path) return undefined
        return imageUrl(path) || undefined
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
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Continue Watching</h2>
                        <span>{watching.length} items</span>
                    </div>
                    {watching.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.5, fontSize: '0.9rem' }}>
                            Nothing in progress. Start exploring!
                        </p>
                    ) : (
                        <div className="dashboard-card-grid">
                            {watching.map((item) => (
                                <article className="dashboard-card" key={item.id}>
                                    <div className="dashboard-card__art">
                                        {getPoster(item.poster_path) ? (
                                            <img src={getPoster(item.poster_path)} alt={item.title} />
                                        ) : (
                                            <div className="dashboard-card__no-poster">{item.title}</div>
                                        )}
                                    </div>
                                    <div className="dashboard-card__body">
                                        <h3>{item.title}</h3>
                                        <p>{item.media_type} · {item.status}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>

                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Popular Movies</h2>
                        <button className="dashboard-link-btn" onClick={() => navigate('/discover')}>See More</button>
                    </div>
                    <div className="dashboard-card-grid">
                        {popular.map((item) => (
                            <article className="dashboard-card" key={`pop-${item.id}`}>
                                <div className="dashboard-card__art">
                                    {getPoster(item.poster_path) ? (
                                        <img src={getPoster(item.poster_path)} alt={item.title || item.name || ''} />
                                    ) : (
                                        <div className="dashboard-card__no-poster">{item.title || item.name}</div>
                                    )}
                                </div>
                                <div className="dashboard-card__body">
                                    <h3>{item.title || item.name}</h3>
                                    <p>{item.media_type === 'movie' ? 'Movie' : 'Movie'} · {item.vote_average?.toFixed(1)}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default Dashboard
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
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Continue Watching</h2>
                        <span>{watching.length} items</span>
                    </div>
                    {watching.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.5, fontSize: '0.9rem' }}>
                            Nothing in progress. Start exploring!
                        </p>
                    ) : (
                        <div className="discover-grid">
                            {watching.map((item) => (
                                <article className="discover-card" key={item.id}>
                                    <div className="discover-card__poster">
                                        {getPoster(item.poster_path) ? (
                                            <img src={getPoster(item.poster_path)} alt={item.title} />
                                        ) : (
                                            <div className="discover-card__no-poster"><span>{item.title}</span></div>
                                        )}
                                        <div className="discover-card__rating" style={{ background: 'rgba(133,138,227,0.2)', color: 'var(--color-orange)' }}>
                                            {item.status}
                                        </div>
                                    </div>
                                    <div className="discover-card__body">
                                        <h3>{item.title}</h3>
                                        <span className="discover-card__type">{item.media_type}</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>

                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Popular Movies</h2>
                        <button className="dashboard-link-btn" onClick={() => navigate('/discover')}>See More</button>
                    </div>
                    <div className="discover-grid">
                        {popular.map((item) => (
                            <article className="discover-card" key={`pop-${item.id}`}>
                                <div className="discover-card__poster">
                                    {getPoster(item.poster_path) ? (
                                        <img src={getPoster(item.poster_path)} alt={item.title || item.name || ''} />
                                    ) : (
                                        <div className="discover-card__no-poster"><span>{item.title || item.name}</span></div>
                                    )}
                                    {item.vote_average && (
                                        <div className="discover-card__rating">{item.vote_average.toFixed(1)}</div>
                                    )}
                                </div>
                                <div className="discover-card__body">
                                    <h3>{item.title || item.name}</h3>
                                    <span className="discover-card__type">Movie</span>
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
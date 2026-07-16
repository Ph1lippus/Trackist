import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl, getTVSeasonDetails } from '../services/tmdbService'
import type { WatchlistItem, WatchlistEpisode } from '../types'
import { useNavigate } from 'react-router-dom'

const Upcoming: React.FC = () => {
    const [upcomingEpisodes, setUpcomingEpisodes] = useState<{ item: WatchlistItem; episode: WatchlistEpisode; airDate: string }[]>([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => {
        const fetchUpcoming = async () => {
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
                .order('added_at', { ascending: true })

            if (!error && data) {
                const today = new Date()
                today.setHours(0, 0, 0, 0)

                const episodes: { item: WatchlistItem; episode: WatchlistEpisode; airDate: string }[] = []
                
                for (const item of data) {
                    if (!item.tmdb_id) continue
                    
                    try {
                        const details = await getTVSeasonDetails(item.tmdb_id, 1)
                        if (details.seasons) {
                            for (const season of details.seasons.filter((s: { season_number: number }) => s.season_number > 0)) {
                                try {
                                    const seasonData = await getTVSeasonDetails(item.tmdb_id, season.season_number)
                                    if (seasonData.episodes) {
                                        for (const ep of seasonData.episodes) {
                                            if (ep.air_date && new Date(ep.air_date) >= today) {
                                                episodes.push({
                                                    item,
                                                    episode: {
                                                        id: `${item.id}-${season.season_number}-${ep.episode_number}`,
                                                        watchlist_id: item.id,
                                                        season_number: season.season_number,
                                                        episode_number: ep.episode_number,
                                                        title: ep.name,
                                                        still_path: ep.still_path,
                                                        overview: ep.overview,
                                                        vote_average: ep.vote_average,
                                                        air_date: ep.air_date,
                                                        runtime: ep.runtime,
                                                        watched: false,
                                                        created_at: new Date().toISOString(),
                                                        updated_at: new Date().toISOString()
                                                    },
                                                    airDate: ep.air_date
                                                })
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.error(`Failed to load season ${season.season_number}:`, err)
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`Failed to load show ${item.title}:`, err)
                    }
                }
                
                setUpcomingEpisodes(episodes)
            }
            setLoading(false)
        }
        fetchUpcoming()
    }, [])

    const groupedEpisodes = upcomingEpisodes.reduce((groups, { item, episode, airDate }) => {
        if (!airDate) return groups
        
        const date = new Date(airDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        
        let key: string
        if (date.toDateString() === today.toDateString()) {
            key = 'Today'
        } else if (date.toDateString() === tomorrow.toDateString()) {
            key = 'Tomorrow'
        } else {
            key = date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            })
        }
        
        if (!groups[key]) {
            groups[key] = []
        }
        groups[key].push({ item, episode, airDate })
        return groups
    }, {} as Record<string, { item: WatchlistItem; episode: WatchlistEpisode; airDate: string }[]>)

    const sortedKeys = Object.keys(groupedEpisodes).sort((a, b) => {
        if (a === 'Today') return -1
        if (b === 'Today') return 1
        if (a === 'Tomorrow') return -1
        if (b === 'Tomorrow') return 1
        return new Date(a).getTime() - new Date(b).getTime()
    })

    const handleEpisodeClick = () => {
        navigate('/tvshows')
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
                    <h2>Upcoming Episodes</h2>
                    <span>{upcomingEpisodes.length} total</span>
                </div>

                {upcomingEpisodes.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No upcoming episodes in your watchlist. Add some TV shows to see them here!
                    </p>
                )}

                <div className="upcoming-list">
                    {sortedKeys.map(dateKey => (
                        <div key={dateKey} className="upcoming-date-group">
                            <h3 className="upcoming-date-label">{dateKey}</h3>
                            <div className="discover-grid">
                                    {groupedEpisodes[dateKey].map(({ item, episode }) => (
                                        <article
                                            className="media-card"
                                            key={`${item.id}-${episode.season_number}-${episode.episode_number}`}
                                            onClick={handleEpisodeClick}
                                        >
                                        <div className="media-card__poster">
                                            {episode.still_path ? (
                                                <img
                                                    src={imageUrl(episode.still_path) || ''}
                                                    alt={episode.title || `Episode ${episode.episode_number}`}
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="media-card__no-poster">
                                                    <span>No preview</span>
                                                </div>
                                            )}
                                            <div className="media-card__rating" style={{ 
                                                background: 'rgba(0,0,0,0.75)', 
                                                color: 'var(--color-orange)', 
                                                fontSize: '0.6rem',
                                                top: 'auto',
                                                bottom: '0.5rem',
                                                left: '0.5rem',
                                                right: 'auto'
                                            }}>
                                                S{episode.season_number}E{episode.episode_number}
                                            </div>
                                        </div>
                                        <div className="media-card__body">
                                            <h3>{episode.title || `Episode ${episode.episode_number}`}</h3>
                                            <span className="media-card__type">{item.title}</span>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default Upcoming
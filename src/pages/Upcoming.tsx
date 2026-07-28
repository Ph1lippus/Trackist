import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import type { WatchlistItem, WatchlistEpisode } from '../types'

interface UpcomingItem {
    id: string
    title: string
    poster_path: string | null
    type: 'episode' | 'movie'
    date: string
    item: WatchlistItem
    episode?: WatchlistEpisode // Only for episodes
}

const Upcoming: React.FC = () => {
    const navigate = useNavigate()
    const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([])
    const [loading, setLoading] = useState(true)
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [showAllEpisodes, setShowAllEpisodes] = useState<{dateKey: string, items: UpcomingItem[]} | null>(null)

    useEffect(() => {
        const fetchUpcoming = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            // Check if any shows need a season check (stale check > 6 hours ago)
            // Only check shows that have last_season_number set
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
            const { data: staleShows } = await supabase
                .from('watchlist')
                .select('id')
                .eq('user_id', user.id)
                .eq('media_type', 'tv')
                .not('last_season_number', 'is', null)
                .or(`last_season_check.is.null,last_season_check.lt.${sixHoursAgo}`)
                .limit(1)


            // If there are stale shows, trigger the Edge Function to check for new seasons
            if (staleShows && staleShows.length > 0) {
                try {
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
                    const { data: { session } } = await supabase.auth.getSession()

                    if (session?.access_token) {
                        fetch(`${supabaseUrl}/functions/v1/check-new-seasons`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`
                            },
                            body: JSON.stringify({ userId: user.id })
                        }).catch(err => {
                            console.error('Failed to trigger season check:', err)
                        })
                    }
                } catch (err) {
                    console.error('Failed to trigger season check:', err)
                }
            }

            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const items: UpcomingItem[] = []

            // Fetch upcoming movies from watchlist
            const { data: movies, error: movieError } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', user.id)
                .eq('media_type', 'movie')
                .gte('release_date', today.toISOString().split('T')[0])

            if (!movieError && movies) {
                movies.forEach(item => {
                    if (item.release_date) {
                        items.push({
                            id: item.id,
                            title: item.title,
                            poster_path: item.poster_path || null,
                            type: 'movie',
                            date: item.release_date,
                            item
                        })
                    }
                })
            }

            // Fetch unwatched episodes from the latest season of each TV show
            // We query watchlist_episodes joined with watchlist to get show info
            const { data: episodes, error: episodeError } = await supabase
                .from('watchlist_episodes')
                .select(`
                    *,
                    watchlist!inner (
                        id,
                        user_id,
                        media_type,
                        tmdb_id,
                        title,
                        poster_path,
                        last_season_number
                    )
                `)
                .eq('watchlist.user_id', user.id)
                .eq('watchlist.media_type', 'tv')
                .eq('watched', false)
                .not('air_date', 'is', null)
                .gte('air_date', today.toISOString().split('T')[0])
                .order('air_date', { ascending: false })

            if (!episodeError && episodes) {
                episodes.forEach(ep => {
                    items.push({
                        id: `${ep.watchlist_id}-${ep.season_number}-${ep.episode_number}`,
                        title: ep.watchlist.title,
                        poster_path: ep.watchlist.poster_path || null,
                        type: 'episode',
                        date: ep.air_date || '',
                        item: {
                            id: ep.watchlist.id,
                            user_id: ep.watchlist.user_id,
                            media_type: ep.watchlist.media_type as 'tv' | 'anime',
                            tmdb_id: ep.watchlist.tmdb_id,
                            title: ep.watchlist.title,
                            poster_path: ep.watchlist.poster_path,
                            added_at: '',
                            updated_at: '',
                            status: 'watching'
                        },
                        episode: {
                            id: ep.id,
                            watchlist_id: ep.watchlist_id,
                            season_number: ep.season_number,
                            episode_number: ep.episode_number,
                            tmdb_episode_id: ep.tmdb_episode_id,
                            title: ep.title,
                            still_path: ep.still_path,
                            overview: ep.overview,
                            vote_average: ep.vote_average,
                            air_date: ep.air_date,
                            runtime: ep.runtime,
                            watched: ep.watched,
                            watched_at: ep.watched_at,
                            created_at: ep.created_at,
                            updated_at: ep.updated_at
                        }
                    })
                })
            }

            // Sort items by date (newest first)
            items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

            setUpcomingItems(items)
            setLoading(false)
        }
        fetchUpcoming()
    }, [])

    const groupedItems = upcomingItems.reduce((groups, upcoming) => {
        if (!upcoming.date) return groups
        const date = new Date(upcoming.date)
        const key = date.toISOString().split('T')[0]
        // Only include items in the current month being viewed
        if (date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear()) {
            if (!groups[key]) {
                groups[key] = []
            }
            groups[key].push(upcoming)
        }
        return groups
    }, {} as Record<string, UpcomingItem[]>)

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const daysInMonth = lastDay.getDate()
        // Adjust for Monday as first day (0 = Monday, 6 = Sunday)
        let startDayOfWeek = firstDay.getDay()
        startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1
        
        const days = []
        for (let i = 0; i < startDayOfWeek; i++) {
            days.push(null)
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i))
        }
        return days
    }

    const navigateMonth = (direction: number) => {
        setCurrentMonth(prev => {
            const year = prev.getFullYear()
            const month = prev.getMonth()
            const newDate = new Date(year, month + direction, 1)
            const now = new Date()
            // Don't allow navigating to months before current month
            if (newDate.getFullYear() < now.getFullYear() || 
                (newDate.getFullYear() === now.getFullYear() && newDate.getMonth() < now.getMonth())) {
                return prev
            }
            return newDate
        })
    }

    const canGoBack = () => {
        const now = new Date()
        return currentMonth.getFullYear() > now.getFullYear() || 
               (currentMonth.getFullYear() === now.getFullYear() && currentMonth.getMonth() > now.getMonth())
    }

    const calendarDays = getDaysInMonth(currentMonth)
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="calendar-header">
                    <button 
                        className="calendar-nav-btn-inline"
                        onClick={() => navigateMonth(-1)}
                        title="Previous month"
                        disabled={!canGoBack()}
                        style={{ opacity: canGoBack() ? 1 : 0.3, cursor: canGoBack() ? 'pointer' : 'not-allowed' }}
                    >
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    <h2 className="calendar-title">{monthName}</h2>
                    <button 
                        className="calendar-nav-btn-inline"
                        onClick={() => navigateMonth(1)}
                        title="Next month"
                    >
                        <i className="fas fa-chevron-right"></i>
                    </button>
                </div>
                
                <div className="upcoming-layout">
                    <main className="upcoming-main">
                        <div className="calendar-grid">
                        {weekDays.map(day => (
                            <div key={day} className="calendar-weekday">{day}</div>
                        ))}
                        {calendarDays.map((day, index) => {
                            if (!day) return <div key={`empty-${index}`} className="calendar-day calendar-day--empty" />

                            const dateKey = day.toISOString().split('T')[0]
                            const dayItems = groupedItems[dateKey] || []
                            const isToday = new Date().toDateString() === day.toDateString()

                            // Show max 4 episodes, rest go into "+" button
                            const maxVisible = 4
                            const visibleItems = dayItems.slice(0, maxVisible)
                            const hasMore = dayItems.length > maxVisible

                            return (
                                <div 
                                    key={dateKey} 
                                    className={`calendar-day ${isToday ? 'calendar-day--today' : ''} ${dayItems.length > 0 ? 'calendar-day--has-episodes' : ''}`}
                                    style={{ position: 'relative' }}
                                >
                                    <span className="calendar-day-number" style={{ position: 'absolute', top: '0.2rem', left: '0.2rem' }}>{day.getDate()}</span>
                                    <div style={{ display: 'flex', flexDirection: 'row', gap: '0', paddingTop: '1.2rem', position: 'relative', flexWrap: 'nowrap' }}>
                                        {visibleItems.map((item, idx) => (
                                            <div 
                                                key={item.id}
                                                className="calendar-episode"
                                                onClick={() => {
                                                    if (item.type === 'movie') {
                                                        navigate(`/movie/${item.item.tmdb_id}`)
                                                    } else {
                                                        navigate(`/tv/${item.item.tmdb_id}`)
                                                    }
                                                }}
                                                style={{ 
                                                    marginLeft: idx > 0 ? '-32px' : '0',
                                                    position: 'relative',
                                                    zIndex: idx
                                                }}
                                            >
                                                <div className="calendar-episode-poster">
                                                    {item.item.poster_path ? (
                                                        <img 
                                                            src={item.item.media_type === 'anime' 
                                                                ? item.item.poster_path 
                                                                : (imageUrl as (path: string) => string)(item.item.poster_path)} 
                                                            alt={item.item.title} 
                                                        />
                                                    ) : (
                                                        <div className="calendar-episode-no-poster">
                                                            <span>{item.item.title}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {hasMore && (
                                            <div 
                                                className="calendar-episode-more"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setShowAllEpisodes({ dateKey, items: dayItems })
                                                }}
                                                style={{ 
                                                    marginLeft: '-32px',
                                                    position: 'relative',
                                                    zIndex: 0
                                                }}
                                            >
                                                +{dayItems.length - maxVisible}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        </div>
                    </main>
                </div>

                {showAllEpisodes && (
                    <div className="modal-overlay" onClick={() => setShowAllEpisodes(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <button 
                                className="modal-close"
                                onClick={() => setShowAllEpisodes(null)}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                            <h2 className="modal-title">
                                {new Date(showAllEpisodes.dateKey).toLocaleDateString('en-US', { 
                                    weekday: 'long',
                                    month: 'long', 
                                    day: 'numeric' 
                                })}
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                {showAllEpisodes.items.length} episode{showAllEpisodes.items.length !== 1 ? 's' : ''} scheduled
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {showAllEpisodes.items.map((item) => (
                                    <div
                                        key={item.id}
                                        style={{
                                            display: 'flex',
                                            gap: '1rem',
                                            padding: '1rem',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onClick={() => {
                                            if (item.type === 'movie') {
                                                navigate(`/movie/${item.item.tmdb_id}`)
                                            } else {
                                                navigate(`/tv/${item.item.tmdb_id}`)
                                            }
                                            setShowAllEpisodes(null)
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(133,138,227,0.1)'
                                            e.currentTarget.style.borderColor = 'rgba(133,138,227,0.3)'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '72px',
                                            flexShrink: 0,
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            background: 'linear-gradient(135deg, rgba(133,138,227,0.3), rgba(255,255,255,0.05))'
                                        }}>
                                            {item.item.poster_path ? (
                                                <img 
                                                    src={item.item.media_type === 'anime' 
                                                        ? item.item.poster_path 
                                                        : (imageUrl as (path: string) => string)(item.item.poster_path)} 
                                                    alt={item.item.title}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'rgba(255,255,255,0.4)',
                                                    fontSize: '0.6rem',
                                                    fontWeight: 600,
                                                    textAlign: 'center',
                                                    padding: '0.3rem'
                                                }}>
                                                    <span>{item.item.title}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', justifyContent: 'center' }}>
                                            <div style={{ 
                                                fontSize: '0.9rem', 
                                                fontWeight: 600, 
                                                color: 'var(--color-platinum)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {item.title}
                                            </div>
                                            {item.episode && (
                                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                                    Season {item.episode.season_number}, Episode {item.episode.episode_number}
                                                </div>
                                            )}
                                            {item.type === 'movie' && (
                                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                                    Movie Release
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

export default Upcoming
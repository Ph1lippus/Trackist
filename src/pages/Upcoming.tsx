import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails, imageUrl } from '../services/tmdbService'
import type { WatchlistItem, WatchlistEpisode } from '../types'
import MediaDetailView from '../components/media/MediaDetailView'

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
    const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null)
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [showAllEpisodes, setShowAllEpisodes] = useState<{dateKey: string, items: UpcomingItem[]} | null>(null)

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
                .order('added_at', { ascending: true })

            if (!error && data) {
                const today = new Date()
                today.setHours(0, 0, 0, 0)

                const items: UpcomingItem[] = []
                
                // Separate TV/Anime and Movies
                const tvItems = data.filter(i => i.media_type !== 'movie')
                const movieItems = data.filter(i => i.media_type === 'movie')

                // Handle Movies
                movieItems.forEach(item => {
                    if (item.release_date && new Date(item.release_date) >= today) {
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
                
                // Fetch all show details in parallel for TV/Anime
                const showDetailsPromises = tvItems.map(async (item) => {
                    if (!item.tmdb_id) return null
                    try {
                        const details = await getTVDetails(item.tmdb_id)
                        return { item, details }
                    } catch (err) {
                        console.error(`Failed to load show ${item.title}:`, err)
                        return null
                    }
                })
                
                const showResults = await Promise.all(showDetailsPromises)
                
                // Fetch all seasons in parallel for each show
                const seasonPromises = showResults.flatMap((result) => {
                    if (!result || !result.details.seasons) return []
                    const { item, details } = result
                    // Only check recent and future seasons to save on API calls
                    // If it's a "planning" or "watching" show, we care about upcoming episodes
                    return details.seasons
                        .filter((s: { season_number: number }) => s.season_number > 0)
                        .map(async (season: { season_number: number }) => {
                            try {
                                const seasonData = await getTVSeasonDetails(item.tmdb_id, season.season_number)
                                return { item, season, seasonData }
                            } catch (err) {
                                console.error(`Failed to load season ${season.season_number}:`, err)
                                return null
                            }
                        })
                })
                
                const seasonResults = await Promise.all(seasonPromises)
                
                // Process episodes
                for (const result of seasonResults) {
                    if (!result || !result.seasonData.episodes) continue
                    const { item, season, seasonData } = result
                    
                    for (const ep of seasonData.episodes) {
                        if (ep.air_date && new Date(ep.air_date) >= today) {
                            items.push({
                                id: `${item.id}-${season.season_number}-${ep.episode_number}`,
                                title: item.title,
                                poster_path: item.poster_path || null,
                                type: 'episode',
                                date: ep.air_date,
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
                                }
                            })
                        }
                    }
                }
                
                // Sort items by date
                items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                setUpcomingItems(items)
            }
            setLoading(false)
        }
        fetchUpcoming()
    }, [])

    const groupedItems = upcomingItems.reduce((groups, upcoming) => {
        if (!upcoming.date) return groups
        const date = new Date(upcoming.date)
        const key = date.toISOString().split('T')[0]
        if (!groups[key]) {
            groups[key] = []
        }
        groups[key].push(upcoming)
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
            const newDate = new Date(prev)
            newDate.setMonth(newDate.getMonth() + direction)
            return newDate
        })
    }

    const calendarDays = getDaysInMonth(currentMonth)
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const refreshItems = () => {
        window.location.reload()
    }

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
                                                onClick={() => setSelectedItem(item.item)}
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

                {selectedItem && (
                    <MediaDetailView
                        item={selectedItem}
                        mode={selectedItem.media_type === 'movie' ? 'browse' : 'watchlist'}
                        onClose={() => setSelectedItem(null)}
                        onUpdate={refreshItems}
                    />
                )}

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
                                            setSelectedItem(item.item)
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
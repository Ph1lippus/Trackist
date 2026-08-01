 import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import { loadCalendar, type CalendarItem } from '../services/calendarService'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'

interface UpcomingItem {
    id: string
    title: string
    poster_path: string | null
    type: 'episode' | 'movie'
    date: string
    item: WatchlistItem
    episode?: {
        season_number: number
        episode_number: number
        tmdb_episode_id?: number
        title?: string
        still_path?: string
    }
}

const mapCalendarItem = (item: CalendarItem): UpcomingItem => ({
    id: item.id,
    title: item.title,
    poster_path: item.poster_path,
    type: item.media_type === 'tv' ? 'episode' : 'movie',
    date: item.media_type === 'tv' ? item.air_date : item.release_date,
    item: {
        id: item.watchlist_id,
        user_id: '',
        media_type: item.media_type,
        tmdb_id: item.tmdb_id,
        title: item.title,
        poster_path: item.poster_path || undefined,
        status: item.media_type === 'tv' ? 'watching' : 'planning',
        added_at: '',
        updated_at: ''
    },
    episode: item.media_type === 'tv' ? {
        season_number: item.season_number,
        episode_number: item.episode_number,
        title: item.episode_title,
        still_path: item.still_path || undefined
    } : undefined
})

interface UpcomingProps {
    currentMonth: Date;
}

const Upcoming: React.FC<UpcomingProps> = ({ currentMonth }) => {
    const navigate = useNavigate()
    usePageTitle('Trackist - Upcoming')
    const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedDate, setSelectedDate] = useState<{dateKey: string, items: UpcomingItem[]} | null>(null)

    useEffect(() => {
        const fetchUpcoming = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            // Check if any shows need a season check (stale check > 6 hours ago)
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
            const { data: staleShows } = await supabase
                .from('watchlist')
                .select('id, tmdb_id, last_season_number, last_season_check')
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

            // Stale-while-revalidate calendar loading
            loadCalendar(user.id, (freshItems) => {
                setUpcomingItems(freshItems.map(mapCalendarItem))
            }).then((items) => {
                setUpcomingItems(items.map(mapCalendarItem))
                setLoading(false)
            })
            return

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

    const calendarDays = getDaysInMonth(currentMonth)

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return (
        <section className="dashboard-page" style={{ height: '100vh', overflow: 'hidden' }}>
            <div className="dashboard-shell" style={{ height: '100%', overflow: 'hidden' }}>
                <div className="upcoming-layout" style={{ height: '100%' }}>
                    <main className="upcoming-main" style={{ overflowY: 'auto' }}>
                        <div className="calendar-grid">
                        {weekDays.map(day => (
                            <div key={day} className="calendar-weekday">{day}</div>
                        ))}
                        {calendarDays.map((day, index) => {
                            if (!day) return <div key={`empty-${index}`} className="calendar-day calendar-day--empty" />

                            const dateKey = day.toISOString().split('T')[0]
                            const dayItems = groupedItems[dateKey] || []
                            const isToday = new Date().toDateString() === day.toDateString()

                            // Show max 2 episodes, rest go into "+" button
                            const maxVisible = 3
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
                                                    setSelectedDate({ dateKey, items: dayItems })
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

                {selectedDate && (
                    <div className="upcoming-side-panel">
                        <div className="upcoming-side-panel-header">
                            <h3 className="upcoming-side-panel-title">
                                {new Date(selectedDate.dateKey).toLocaleDateString('en-US', { 
                                    weekday: 'long',
                                    month: 'long', 
                                    day: 'numeric' 
                                })}
                            </h3>
                            <button 
                                className="upcoming-side-panel-close"
                                onClick={() => setSelectedDate(null)}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="upcoming-side-panel-content">
                            {selectedDate.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="upcoming-episode-card"
                                    onClick={() => {
                                        if (item.type === 'movie') {
                                            navigate(`/movie/${item.item.tmdb_id}`)
                                        } else {
                                            navigate(`/tv/${item.item.tmdb_id}`)
                                        }
                                    }}
                                >
                                    <div className="upcoming-episode-card-poster">
                                        {item.item.poster_path ? (
                                            <img 
                                                src={item.item.media_type === 'anime' 
                                                    ? item.item.poster_path 
                                                    : (imageUrl as (path: string) => string)(item.item.poster_path)} 
                                                alt={item.item.title}
                                            />
                                        ) : (
                                            <div className="upcoming-episode-card-no-poster">
                                                <span>{item.item.title}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="upcoming-episode-card-info">
                                        <h4>{item.title}</h4>
                                        {item.episode && (
                                            <p className="upcoming-episode-details">
                                                S{item.episode.season_number} E{item.episode.episode_number}
                                            </p>
                                        )}
                                        {item.type === 'movie' && (
                                            <p className="upcoming-episode-details">Movie Release</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

export default Upcoming
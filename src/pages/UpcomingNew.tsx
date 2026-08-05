import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import { loadCalendar, type CalendarItem } from '../services/calendarService'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatDateString, isToday } from '../utils/dateUtils'

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

const UpcomingNew: React.FC = () => {
    const navigate = useNavigate()
    usePageTitle('Trackist - Upcoming')
    const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([])
    const [loading, setLoading] = useState(true)

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
        }
        fetchUpcoming()
    }, [])

    // Group items by date and filter out past dates
    const groupedItems = upcomingItems.reduce((groups, upcoming) => {
        if (!upcoming.date) return groups
        if (!groups[upcoming.date]) {
            groups[upcoming.date] = []
        }
        groups[upcoming.date].push(upcoming)
        return groups
    }, {} as Record<string, UpcomingItem[]>)

    // Sort dates chronologically
    const sortedDates = Object.keys(groupedItems).sort()

    // Sort items within each date (episodes before movies, then by title)
    const sortedGroupedItems = sortedDates.map(date => {
        const items = [...groupedItems[date]].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'episode' ? -1 : 1
            return a.title.localeCompare(b.title)
        })
        return { date, items }
    })

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

    return (
        <section className="dashboard-page upcoming-new-page">
            <div className="dashboard-shell upcoming-new-shell">

                {sortedGroupedItems.length === 0 ? (
                    <div className="upcoming-new-empty">
                        <i className="fas fa-calendar-check"></i>
                        <h3>Nothing upcoming</h3>
                        <p>No episodes or movie releases are scheduled. Add more shows to your watchlist!</p>
                    </div>
                ) : (
                    <div className="upcoming-new-list">
                        {sortedGroupedItems.map(({ date, items }) => (
                            <div key={date} className="upcoming-new-date-group">
                                <div className={`upcoming-new-date-label ${isToday(date) ? 'today' : ''}`}>
                                    <span className="upcoming-new-date-main">
                                        {formatDateString(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    {isToday(date) && (
                                        <span className="upcoming-new-today-badge">
                                            <i className="fas fa-star"></i> Today
                                        </span>
                                    )}
                                </div>

                                <div className="upcoming-new-cards">
                                    {items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="upcoming-new-card"
                                            onClick={() => {
                                                if (item.type === 'movie') {
                                                    navigate(`/movie/${item.item.tmdb_id}`)
                                                } else {
                                                    navigate(`/tv/${item.item.tmdb_id}`)
                                                }
                                            }}
                                        >
                                            <div className="upcoming-new-card-poster">
                                                {item.item.poster_path ? (
                                                    <img
                                                        src={item.item.media_type === 'anime'
                                                            ? item.item.poster_path
                                                            : (imageUrl as (path: string) => string)(item.item.poster_path)}
                                                        alt={item.item.title}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="upcoming-new-card-no-poster">
                                                        <span>{item.item.title}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="upcoming-new-card-body">
                                                <div className="upcoming-new-card-type">
                                                    {item.type === 'episode' ? (
                                                        <span className="badge badge-episode">
                                                            <i className="fas fa-tv"></i> Episode
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-movie">
                                                            <i className="fas fa-film"></i> Movie
                                                        </span>
                                                    )}
                                                </div>

                                                <h3 className="upcoming-new-card-title">{item.title}</h3>

                                                {item.episode && (
                                                    <div className="upcoming-new-card-info">
                                                        <span className="upcoming-new-card-season">
                                                            <i className="fas fa-layer-group"></i>
                                                            Season {item.episode.season_number}
                                                        </span>
                                                        <span className="upcoming-new-card-episode">
                                                            <i className="fas fa-play-circle"></i>
                                                            Episode {item.episode.episode_number}
                                                        </span>
                                                    </div>
                                                )}

                                                {item.episode?.title && (
                                                    <p className="upcoming-new-card-episode-title">
                                                        "{item.episode.title}"
                                                    </p>
                                                )}

                                                {item.type === 'movie' && (
                                                    <p className="upcoming-new-card-movie-release">
                                                        <i className="fas fa-film"></i> Movie Release
                                                    </p>
                                                )}

                                                <div className="upcoming-new-card-date">
                                                    <i className="fas fa-calendar-day"></i>
                                                    {formatDateString(item.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>
                                            </div>

                                            <div className="upcoming-new-card-arrow">
                                                <i className="fas fa-chevron-right"></i>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}

export default UpcomingNew
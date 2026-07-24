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
    const [dayActiveIndex, setDayActiveIndex] = useState<Record<string, number>>({})

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
                            
                            // Group items by show (tmdb_id) to show one card per show
                            const groupedByShow = dayItems.reduce((groups, upcoming) => {
                                const showKey = upcoming.item.tmdb_id || upcoming.item.id
                                if (!groups[showKey]) {
                                    groups[showKey] = []
                                }
                                groups[showKey].push(upcoming)
                                return groups
                            }, {} as Record<string, UpcomingItem[]>)

                            const showEntries = Object.values(groupedByShow)
                            const activeIdx = dayActiveIndex[dateKey] || 0
                            const activeShow = showEntries[activeIdx] || showEntries[0]

                            const handlePrev = (e: React.MouseEvent) => {
                                e.stopPropagation()
                                if (showEntries.length <= 1) return
                                setDayActiveIndex(prev => ({
                                    ...prev,
                                    [dateKey]: (prev[dateKey] || 0 - 1 + showEntries.length) % showEntries.length
                                }))
                            }

                            const handleNext = (e: React.MouseEvent) => {
                                e.stopPropagation()
                                if (showEntries.length <= 1) return
                                setDayActiveIndex(prev => ({
                                    ...prev,
                                    [dateKey]: ((prev[dateKey] || 0) + 1) % showEntries.length
                                }))
                            }

                            return (
                                <div 
                                    key={dateKey} 
                                    className={`calendar-day ${isToday ? 'calendar-day--today' : ''} ${dayItems.length > 0 ? 'calendar-day--has-episodes' : ''}`}
                                >
                                    <span className="calendar-day-number">{day.getDate()}</span>
                                    {dayItems.length > 0 && activeShow && (
                                        <div 
                                            className="calendar-episode"
                                            onClick={() => setSelectedItem(activeShow[0].item)}
                                        >
                                            <div className="calendar-episode-poster">
                                                {activeShow[0].item.poster_path ? (
                                                    <img 
                                                        src={activeShow[0].item.media_type === 'anime' 
                                                            ? activeShow[0].item.poster_path 
                                                            : (imageUrl as (path: string) => string)(activeShow[0].item.poster_path)} 
                                                        alt={activeShow[0].item.title} 
                                                    />
                                                ) : (
                                                    <div className="calendar-episode-no-poster">
                                                        <span>{activeShow[0].item.title}</span>
                                                    </div>
                                                )}
                                                {showEntries.length > 1 && (
                                                    <>
                                                        <button 
                                                            className="calendar-episode-nav calendar-episode-nav--prev"
                                                            onClick={handlePrev}
                                                            title="Previous show"
                                                        >
                                                            <i className="fas fa-chevron-left"></i>
                                                        </button>
                                                        <button 
                                                            className="calendar-episode-nav calendar-episode-nav--next"
                                                            onClick={handleNext}
                                                            title="Next show"
                                                        >
                                                            <i className="fas fa-chevron-right"></i>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        </div>
                    </main>
                </div>

                {selectedItem && (
                    <MediaDetailView
                        item={selectedItem}
                        mode="watchlist"
                        onClose={() => setSelectedItem(null)}
                        onUpdate={refreshItems}
                    />
                )}
            </div>
        </section>
    )
}

export default Upcoming
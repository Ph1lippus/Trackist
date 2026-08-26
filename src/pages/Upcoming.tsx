import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import { loadCalendar, type CalendarItem } from '../services/calendarService'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import {
    getYearMonth,
    isToday,
    formatDateString
} from '../utils/dateUtils'

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

const orderItemsLikeMiniCards = (items: UpcomingItem[]): UpcomingItem[] => {
    const groups = new Map<string, UpcomingItem[]>()
    for (const item of items) {
        const key = String(item.item.tmdb_id)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
    }
    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.length - b.length)

    const result: UpcomingItem[] = []
    const pointers = sortedGroups.map(() => 0)
    let madeProgress: boolean
    do {
        madeProgress = false
        for (let i = 0; i < sortedGroups.length; i++) {
            const group = sortedGroups[i]
            const ptr = pointers[i]
            if (ptr < group.length) {
                result.push(group[ptr])
                pointers[i] = ptr + 1
                madeProgress = true
            }
        }
    } while (madeProgress)

    return result
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
    const [selectedDate, setSelectedDate] = useState<{dateKey: string, items: UpcomingItem[]} | null>(null)
    const [dayCellInnerWidth, setDayCellInnerWidth] = useState(0)
    const calendarGridRef = useRef<HTMLDivElement>(null)

    const monthKey = useMemo(() => {
        const y = currentMonth.getFullYear()
        const m = currentMonth.getMonth()
        return `${y}-${m}`
    }, [currentMonth])

    const groupedItems = useMemo(() => {
        return upcomingItems.reduce((groups, upcoming) => {
            if (!upcoming.date) return groups
            const dateKey = upcoming.date
            const { year, month } = getYearMonth(dateKey)
            const [viewYear, viewMonth] = monthKey.split('-').map(Number)
            if (year === viewYear && month === viewMonth) {
                if (!groups[dateKey]) groups[dateKey] = []
                groups[dateKey].push(upcoming)
            }
            return groups
        }, {} as Record<string, UpcomingItem[]>)
    }, [upcomingItems, monthKey])

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const firstDay = new Date(Date.UTC(year, month, 1))
        const lastDay = new Date(Date.UTC(year, month + 1, 0))
        const daysInMonth = lastDay.getUTCDate()
        let startDayOfWeek = firstDay.getUTCDay()
        startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

        const days: (Date | null)[] = []
        for (let i = 0; i < startDayOfWeek; i++) days.push(null)
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(Date.UTC(year, month, i)))
        return days
    }, [currentMonth])

    const measureDayCell = useCallback(() => {
        const grid = calendarGridRef.current
        if (!grid) return
        const gridWidth = grid.getBoundingClientRect().width
        const style = getComputedStyle(grid)
        const columnGap = parseFloat(style.columnGap || style.gap || '9.6')
        const totalGaps = 6 * columnGap
        const availableWidth = gridWidth - totalGaps
        const cellWidth = availableWidth / 7
        const dayEl = grid.querySelector('.calendar-day') as HTMLElement | null
        if (dayEl) {
            const dayStyle = getComputedStyle(dayEl)
            const paddingX = parseFloat(dayStyle.paddingLeft) + parseFloat(dayStyle.paddingRight)
            setDayCellInnerWidth(Math.max(0, cellWidth - paddingX))
        } else {
            setDayCellInnerWidth(Math.max(0, cellWidth))
        }
    }, [])

    useEffect(() => {
        if (calendarGridRef.current) return
        const grid = calendarGridRef.current
        if (!grid) return

        let timeout: ReturnType<typeof setTimeout>
        const scheduleMeasure = () => {
            clearTimeout(timeout)
            timeout = setTimeout(() => measureDayCell(), 80)
        }

        const raf = requestAnimationFrame(() => scheduleMeasure())
        const observer = new ResizeObserver(scheduleMeasure)
        observer.observe(grid)
        return () => {
            cancelAnimationFrame(raf)
            clearTimeout(timeout)
            observer.disconnect()
        }
    }, [measureDayCell])

    useEffect(() => {
        const fetchUpcoming = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                return
            }

            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
            const { data: staleShows } = await supabase
                .from('watchlist')
                .select('id')
                .eq('user_id', user.id)
                .eq('media_type', 'tv')
                .not('last_season_number', 'is', null)
                .or(`last_season_check.is.null,last_season_check.lt.${sixHoursAgo}`)
                .limit(1)

            if (staleShows && staleShows.length > 0) {
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (session?.access_token && supabaseUrl) {
                        fetch(`${supabaseUrl}/functions/v1/check-new-seasons`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`
                            },
                            body: JSON.stringify({ userId: user.id })
                        }).catch(err => {
                            console.error('Background season check failed:', err)
                        })
                    }
                }).catch(() => {})
            }

            loadCalendar(user.id, (freshItems) => {
                setUpcomingItems(freshItems.map(mapCalendarItem))
            }).then((items) => {
                setUpcomingItems(items.map(mapCalendarItem))
            })
            return
        }
        fetchUpcoming()
    }, [])

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return (
        <section className="dashboard-page" style={{ height: '100vh', overflow: 'hidden' }}>
            <div className="dashboard-shell" style={{ height: '100%', overflow: 'hidden' }}>
                <div className="upcoming-layout" style={{ height: '100%' }}>
                    <main className="upcoming-main" style={{ overflowY: 'auto' }}>
                        <div className="calendar-grid" ref={calendarGridRef}>
                        {weekDays.map(day => (
                            <div key={day} className="calendar-weekday">{day}</div>
                        ))}
                        {calendarDays.map((day, index) => {
                            if (!day) return <div key={`empty-${index}`} className="calendar-day calendar-day--empty" />

                            const dateKey = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`

                            const dayItems = groupedItems[dateKey] || []
                            const isTodayDate = isToday(dateKey)

                            const cardWidth = 72
                            const minOverlap = 8
                            const maxCards = dayCellInnerWidth > 0
                                ? Math.max(1, Math.floor((dayCellInnerWidth - minOverlap) / (cardWidth - minOverlap)))
                                : 2

                            const hasMore = dayItems.length > maxCards

                            const groups = new Map<string, UpcomingItem[]>()
                            for (const item of dayItems) {
                                const key = String(item.item.tmdb_id)
                                if (!groups.has(key)) groups.set(key, [])
                                groups.get(key)!.push(item)
                            }
                            const sortedGroups = Array.from(groups.values()).sort((a, b) => a.length - b.length)

                            const visibleItems: UpcomingItem[] = []
                            const pointers = sortedGroups.map(() => 0)
                            while (visibleItems.length < maxCards && visibleItems.length < dayItems.length) {
                                let madeProgress = false
                                for (let i = 0; i < sortedGroups.length && visibleItems.length < maxCards; i++) {
                                    const group = sortedGroups[i]
                                    const ptr = pointers[i]
                                    if (ptr < group.length) {
                                        visibleItems.push(group[ptr])
                                        pointers[i] = ptr + 1
                                        madeProgress = true
                                    }
                                }
                                if (!madeProgress) break
                            }

                            let dynamicOverlap = 0
                            if (visibleItems.length > 1 && dayCellInnerWidth > 0) {
                                const idealStep = (dayCellInnerWidth - cardWidth) / (visibleItems.length - 1)
                                dynamicOverlap = Math.max(minOverlap, cardWidth - idealStep)
                            }

                            return (
                                <div
                                    key={dateKey}
                                    className={`calendar-day ${isTodayDate ? 'calendar-day--today' : ''} ${dayItems.length > 0 ? 'calendar-day--has-episodes' : ''}`}
                                    style={{ position: 'relative' }}
                                >
                                    <span className="calendar-day-number" style={{ position: 'absolute', top: '0.4rem', left: '0.4rem' }}>{day.getUTCDate()}</span>
                                    <div className="calendar-episodes" style={{ display: 'flex', flexDirection: 'row', gap: '0', paddingTop: '1.2rem', position: 'relative', flexWrap: 'nowrap', overflow: 'hidden' }}>
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
                                                     marginLeft: idx > 0 ? `-${dynamicOverlap}px` : '0',
                                                     position: 'relative',
                                                     zIndex: idx
                                                 }}
                                            >
                                                <div className="calendar-episode-poster">
                                                    {item.item.poster_path ? (
                                                            <img
                                                                src={imageUrl(item.item.poster_path, 'w185') || ''}
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
                                    </div>
                                    {hasMore && (
                                        <button
                                            className="calendar-day-more-btn"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedDate({ dateKey, items: dayItems })
                                            }}
                                            aria-label={`${dayItems.length - visibleItems.length} more`}
                                        >
                                            <i className="fa-solid fa-plus"></i>
                                        </button>
                                    )}
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
                                {formatDateString(selectedDate.dateKey, {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
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
                            {orderItemsLikeMiniCards(selectedDate.items).map((item) => (
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
                                                src={imageUrl(item.item.poster_path, 'w185') || ''}
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



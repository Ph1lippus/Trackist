import React, { useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import { loadCalendar, type CalendarItem } from '../services/calendarService'
import { getShowAirSchedule } from '../services/tvmazeService'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import useDetailModalStore from '../stores/detailModalStore'
import {
    getYearMonth,
    isTodayLocal,
    formatDateString,
    formatAirstampTime
} from '../utils/dateUtils'

interface UpcomingItem {
    id: string
    title: string
    poster_path: string | null
    type: 'episode' | 'movie'
    date: string
    release_type?: 'theatrical' | 'digital'
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
    const movies = items.filter(item => item.type === 'movie')
    const episodes = items.filter(item => item.type === 'episode')
    const groups = new Map<string, UpcomingItem[]>()
    for (const item of episodes) {
        const key = String(item.item.tmdb_id)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
    }
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
        const quantityDifference = a.length - b.length
        return quantityDifference || a[0].title.localeCompare(b[0].title)
    })

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

    return [...movies, ...result]
}

const buildSidePanelCards = (items: UpcomingItem[]): UpcomingItem[] => {
    const movies: UpcomingItem[] = []
    const groups = new Map<string, UpcomingItem[]>()

    for (const item of items) {
        if (item.type === 'movie') {
            movies.push(item)
            continue
        }
        const key = item.item.tmdb_id != null ? `tv:${item.item.tmdb_id}` : `ep:${item.id}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
        const quantityDifference = a.length - b.length
        return quantityDifference || a[0].title.localeCompare(b[0].title)
    })

    const cards: UpcomingItem[] = [...movies]
    for (const group of sortedGroups) {
        group.sort((a, b) => {
            const seasonDiff = (a.episode?.season_number || 0) - (b.episode?.season_number || 0)
            return seasonDiff || (a.episode?.episode_number || 0) - (b.episode?.episode_number || 0)
        })
        cards.push(...group)
    }
    return cards
}

const mapCalendarItem = (item: CalendarItem): UpcomingItem => ({
    id: item.id,
    title: item.title,
    poster_path: item.poster_path,
    type: item.media_type === 'tv' ? 'episode' : 'movie',
    date: item.media_type === 'tv'
        ? (item.airstamp ? new Date(item.airstamp).toISOString().split('T')[0] : item.air_date)
        : item.release_date,
    release_type: item.media_type === 'movie' ? item.release_type : undefined,
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
    usePageTitle('Track1st - Upcoming')
    const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([])
    const [selectedDate, setSelectedDate] = useState<{dateKey: string, items: UpcomingItem[]} | null>(null)
    const [dayCellInnerWidth, setDayCellInnerWidth] = useState(0)
    const [loading, setLoading] = useState(true)
    const [airstampTimes, setAirstampTimes] = useState<Record<string, string>>({})
    const [airstamps, setAirstamps] = useState<Record<string, string>>({})
    const calendarGridRef = useRef<HTMLDivElement>(null)
    const upcomingVersionRef = useRef(0)

    const getEpisodeTime = (item: UpcomingItem): string | null => {
        if (item.type !== 'episode' || !item.item.tmdb_id || !item.episode) return null
        const key = `${item.item.tmdb_id}-${item.episode.season_number}-${item.episode.episode_number}`
        return airstampTimes[key] || null
    }

    const getEpisodeTimeOnly = (item: UpcomingItem): string | null => {
        if (item.type !== 'episode' || !item.item.tmdb_id || !item.episode) return null
        const key = `${item.item.tmdb_id}-${item.episode.season_number}-${item.episode.episode_number}`
        return airstampTimes[key] || null
    }

    const getEpisodeTooltip = (item: UpcomingItem): string | undefined => {
        if (item.type === 'movie') {
            const label = item.release_type === 'digital' ? 'Digital' : 'Cinema'
            return `${item.title}\n${label}`
        }
        if (item.type !== 'episode' || !item.episode) return undefined
        const parts = [`S${item.episode.season_number} E${item.episode.episode_number}`]
        const time = getEpisodeTime(item)
        if (time) parts.push(time)
        return parts.join('\n')
    }

    useLayoutEffect(() => {
        const version = ++upcomingVersionRef.current

        const fetchAirstamps = async () => {
            const uniqueShowIds = new Set<number>()
            for (const item of upcomingItems) {
                if (item.type === 'episode' && item.item.tmdb_id) {
                    uniqueShowIds.add(item.item.tmdb_id)
                }
            }

            const times: Record<string, string> = {}
            const stamps: Record<string, string> = {}
            await Promise.all(
                Array.from(uniqueShowIds).map(async tmdbId => {
                    try {
                        const schedule = await getShowAirSchedule(tmdbId)
                        for (const ep of schedule.episodes) {
                            if (ep.airstamp) {
                                const key = `${tmdbId}-${ep.season}-${ep.episode}`
                                times[key] = formatAirstampTime(ep.airstamp)
                                stamps[key] = ep.airstamp
                            }
                        }
                    } catch {
                        // ignore
                    }
                })
            )

            if (version === upcomingVersionRef.current) {
                setAirstampTimes(times)
                setAirstamps(stamps)
            }
        }

        if (upcomingItems.length > 0) {
            fetchAirstamps()
        }
    }, [upcomingItems])

    const monthKey = useMemo(() => {
        const y = currentMonth.getFullYear()
        const m = currentMonth.getMonth()
        return `${y}-${m}`
    }, [currentMonth])

    const getLocalDate = (item: UpcomingItem): string | null => {
        if (item.type === 'episode' && item.item.tmdb_id && item.episode) {
            const key = `${item.item.tmdb_id}-${item.episode.season_number}-${item.episode.episode_number}`
            const stamp = airstamps[key]
            if (stamp) {
                const d = new Date(stamp)
                if (!Number.isNaN(d.getTime())) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                }
            }
        }
        // No client-side airstamp (TVMaze unavailable/blocked): fall back to
        // the edge function air_date so episodes still appear on the calendar
        // instead of being silently dropped.
        return item.date || null
    }

    const groupedItems = useMemo(() => {
        const source = upcomingItems.filter(item => {
            if (item.type === 'movie') return true
            if (!item.item.tmdb_id || !item.episode) return false
            return true
        })
        return source.reduce((groups, upcoming) => {
            if (!upcoming.date) return groups
            const localDate = getLocalDate(upcoming)
            if (!localDate) return groups
            const { year, month } = getYearMonth(localDate)
            const [viewYear, viewMonth] = monthKey.split('-').map(Number)
            if (year === viewYear && month === viewMonth) {
                if (!groups[localDate]) groups[localDate] = []
                groups[localDate].push(upcoming)
            }
            return groups
        }, {} as Record<string, UpcomingItem[]>)
    }, [upcomingItems, monthKey, airstamps]) // eslint-disable-line react-hooks/exhaustive-deps

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const daysInMonth = lastDay.getDate()
        let startDayOfWeek = firstDay.getDay()
        startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

        const days: (Date | null)[] = []
        for (let i = 0; i < startDayOfWeek; i++) days.push(null)
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i))
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

            loadCalendar(user.id, (freshItems) => {
                setUpcomingItems(freshItems.map(mapCalendarItem))
                setLoading(false)
            }).then((items) => {
                setUpcomingItems(items.map(mapCalendarItem))
                setLoading(false)
            }).catch(() => {
                setLoading(false)
            })

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

            return
        }
        fetchUpcoming()
    }, [])

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return (
        <section className="dashboard-page" style={{ height: '100vh', overflow: 'visible' }}>
            <div className="dashboard-shell" style={{ height: '100%', overflow: 'hidden' }}>
                <div className="upcoming-layout" style={{ height: '100%' }}>
                        <main className="upcoming-main" style={{ overflowY: 'auto' }}>
                            <div className="calendar-grid" ref={calendarGridRef}>
                                {loading && (
                                    <div className="upcoming-loading">
                                        <div className="discover-spinner" />
                                        <p>Loading your calendar...</p>
                                    </div>
                                )}
                                {!loading && weekDays.map(day => (
                                    <div key={day} className="calendar-weekday">{day}</div>
                            ))}
                            {!loading && calendarDays.map((day, index) => {
                            if (!day) return <div key={`empty-${index}`} className="calendar-day calendar-day--empty" />

                            const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

                            const dayItems = groupedItems[dateKey] || []
                            const isTodayDate = isTodayLocal(dateKey)

                            const cardWidth = 72
                            const minOverlap = 8
                            const maxCards = dayCellInnerWidth > 0
                                ? Math.max(1, Math.floor((dayCellInnerWidth - minOverlap) / (cardWidth - minOverlap)))
                                : 2

                            const hasMore = dayItems.length > maxCards

                            const visibleItems = orderItemsLikeMiniCards(dayItems).slice(0, maxCards)
                            const displayItems = visibleItems

                            let dynamicOverlap = 0
                            if (displayItems.length > 1 && dayCellInnerWidth > 0) {
                                const idealStep = (dayCellInnerWidth - cardWidth) / (displayItems.length - 1)
                                dynamicOverlap = Math.max(minOverlap, cardWidth - idealStep)
                            }

                            return (
                                <div
                                    key={dateKey}
                                    className={`calendar-day ${isTodayDate ? 'calendar-day--today' : ''} ${dayItems.length > 0 ? 'calendar-day--has-episodes' : ''}`}
                                    style={{ position: 'relative' }}
                                >
                                    <span className="calendar-day-number" style={{ position: 'absolute', top: '0.4rem', left: '0.4rem' }}>{day.getDate()}</span>
                                    <div className="calendar-episodes" style={{ display: 'flex', flexDirection: 'row', gap: '0', paddingTop: '1.2rem', position: 'relative', flexWrap: 'nowrap', overflow: 'visible' }}>
                                        {displayItems.map((item, idx) => (
                                            <div
                                                key={item.id}
                                                className="calendar-episode"
                                                data-tooltip={getEpisodeTooltip(item)}
                                                onClick={() => {
                                                    if (item.type === 'movie' && item.item.tmdb_id) {
                                                        useDetailModalStore.getState().open('movie', item.item.tmdb_id)
                                                    } else if (item.item.tmdb_id) {
                                                        useDetailModalStore.getState().open('tv', item.item.tmdb_id)
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
                                            ...(selectedDate.dateKey.split('-')[0] !== String(new Date().getUTCFullYear()) ? { year: 'numeric' } : {})
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
                            {buildSidePanelCards(selectedDate.items).map((item) => {
                                const showTmdbId = item.item.tmdb_id
                                return (
                                    <div
                                        key={item.id}
                                        className="upcoming-episode-card"
                                        onClick={() => {
                                            if (item.type === 'movie' && showTmdbId) {
                                                useDetailModalStore.getState().open('movie', showTmdbId)
                                            } else if (showTmdbId) {
                                                useDetailModalStore.getState().open('tv', showTmdbId)
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
                                            {item.type === 'episode' && item.episode && (
                                                <div className="upcoming-episode-info">
                                                    <p className="upcoming-episode-details">
                                                        S{item.episode.season_number} E{item.episode.episode_number}
                                                        {item.episode.title && (
                                                            <span> - {item.episode.title}</span>
                                                        )}
                                                    </p>
                                                    {getEpisodeTimeOnly(item) && (
                                                        <p className="upcoming-episode-time">{getEpisodeTimeOnly(item)}</p>
                                                    )}
                                                </div>
                                            )}
                                            {item.type === 'movie' && (
                                                <p className="upcoming-episode-details">{item.release_type === 'digital' ? 'Digital' : 'In Theaters'}</p>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

export default Upcoming



import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../services/supabaseClient'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePageTitle } from '../hooks/usePageTitle'

interface EpisodeStats {
    totalEpisodesWatched: number
    totalWatchTimeMinutes: number
}

const formatHours = (minutes: number): string => {
    const hours = minutes / 60
    if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k hrs`
    return `${Math.round(hours).toLocaleString()} hrs`
}

const Statistics: React.FC = () => {
    usePageTitle('Trackist - Statistics')
    const [episodeStats, setEpisodeStats] = useState<EpisodeStats>({ totalEpisodesWatched: 0, totalWatchTimeMinutes: 0 })
    const [loading, setLoading] = useState(true)
    const libraryStore = useLibraryStore()

    useEffect(() => {
        const fetchEpisodeStats = async () => {
            try {
                const { data, error } = await supabase.rpc('get_my_watch_statistics')
                if (!error && data && data.length > 0) {
                    setEpisodeStats({
                        totalEpisodesWatched: Number(data[0].total_episodes_watched) || 0,
                        totalWatchTimeMinutes: Number(data[0].total_watch_time_minutes) || 0
                    })
                }
            } catch (err) {
                console.error('Failed to fetch episode statistics:', err)
            }
            setLoading(false)
        }
        fetchEpisodeStats()
    }, [])

    const items = libraryStore.allItems

    const stats = useMemo(() => {
        const movies = items.filter(i => i.media_type === 'movie')
        const tvShows = items.filter(i => i.media_type === 'tv')

        const totalCompleted = items.filter(i => i.status === 'completed').length
        const totalWatching = items.filter(i => i.status === 'watching').length
        const totalPlanning = items.filter(i => i.status === 'planning').length
        const totalDropped = items.filter(i => i.status === 'dropped').length
        const totalCaughtUp = items.filter(i => i.status === 'caught_up').length

        const moviesCompleted = movies.filter(i => i.status === 'completed').length
        const tvCompleted = tvShows.filter(i => i.status === 'completed').length

        const scoredItems = items.filter(i => i.vote_average != null && i.vote_average > 0)
        const avgScore = scoredItems.length > 0
            ? Math.round((scoredItems.reduce((sum, i) => sum + (i.vote_average || 0), 0) / scoredItems.length) * 10) / 10
            : null

        const highestScored = scoredItems.length > 0
            ? scoredItems.reduce((best, curr) => (curr.vote_average || 0) > (best?.vote_average || 0) ? curr : best, scoredItems[0])
            : null

        const lowestScored = scoredItems.length > 0
            ? scoredItems.reduce((worst, curr) => (curr.vote_average || 0) < (worst?.vote_average || 0) ? curr : worst, scoredItems[0])
            : null

        const completionRate = items.length > 0
            ? Math.round((totalCompleted / items.length) * 100)
            : 0

        const scoreBuckets = [
            { label: '0-2', min: 0, max: 2, count: 0 },
            { label: '2-4', min: 2, max: 4, count: 0 },
            { label: '4-6', min: 4, max: 6, count: 0 },
            { label: '6-8', min: 6, max: 8, count: 0 },
            { label: '8-10', min: 8, max: 10, count: 0 },
        ]
        scoredItems.forEach(item => {
            const score = item.vote_average || 0
            const bucket = scoreBuckets.find(b => score >= b.min && score < b.max)
            if (bucket) bucket.count++
            else if (score === 10) scoreBuckets[4].count++
        })

        const yearMap = new Map<number, number>()
        items.forEach(item => {
            const year = new Date(item.added_at).getFullYear()
            if (!isNaN(year)) {
                yearMap.set(year, (yearMap.get(year) || 0) + 1)
            }
        })
        const yearsAdded = Array.from(yearMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([year, count]) => ({ year, count }))

        const tvInProgress = tvShows.filter(i => i.status === 'watching' || i.status === 'caught_up')
        const avgEpisodesPerShow = tvShows.length > 0
            ? Math.round(episodeStats.totalEpisodesWatched / tvShows.length)
            : 0
        const avgProgressInWatching = tvInProgress.length > 0
            ? Math.round(tvInProgress.reduce((sum, i) => sum + (i.current_episode || 0), 0) / tvInProgress.length)
            : 0

        const movieCompletionRate = movies.length > 0 ? Math.round((moviesCompleted / movies.length) * 100) : 0
        const tvCompletionRate = tvShows.length > 0 ? Math.round((tvCompleted / tvShows.length) * 100) : 0

        const avgWatchTimePerEpisode = episodeStats.totalEpisodesWatched > 0
            ? Math.round(episodeStats.totalWatchTimeMinutes / episodeStats.totalEpisodesWatched)
            : 0

        const totalWatchHours = Math.round(episodeStats.totalWatchTimeMinutes / 60)
        const totalDaysWatching = Math.round(episodeStats.totalWatchTimeMinutes / 1440)

        const mostAddedType = items.length > 0
            ? (movies.length >= tvShows.length ? 'Movies' : 'TV Shows')
            : null

        const now = new Date()
        const thisMonth = items.filter(i => i.status === 'completed' && i.completed_at && new Date(i.completed_at).getMonth() === now.getMonth() && new Date(i.completed_at).getFullYear() === now.getFullYear()).length
        const lastMonth = items.filter(i => i.status === 'completed' && i.completed_at && new Date(i.completed_at).getMonth() === ((now.getMonth() + 11) % 12) && new Date(i.completed_at).getFullYear() === (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())).length

        return {
            totalItems: items.length,
            totalMovies: movies.length,
            totalTvShows: tvShows.length,
            totalCompleted,
            totalWatching,
            totalPlanning,
            totalDropped,
            totalCaughtUp,
            moviesCompleted,
            tvCompleted,
            avgScore,
            highestScored,
            lowestScored,
            completionRate,
            scoreBuckets,
            yearsAdded,
            avgEpisodesPerShow,
            avgProgressInWatching,
            movieCompletionRate,
            tvCompletionRate,
            avgWatchTimePerEpisode,
            totalWatchHours,
            totalDaysWatching,
            totalEpisodesWatched: episodeStats.totalEpisodesWatched,
            totalWatchTimeMinutes: episodeStats.totalWatchTimeMinutes,
            mostAddedType,
            thisMonthCompleted: thisMonth,
            lastMonthCompleted: lastMonth
        }
    }, [items, episodeStats])

    const statusData = useMemo(() => {
        return [
            { label: 'Completed', count: stats.totalCompleted, color: '#68ffae', icon: 'fa-circle-check' },
            { label: 'Watching', count: stats.totalWatching, color: '#ffc107', icon: 'fa-play' },
            { label: 'Planning', count: stats.totalPlanning, color: '#b0b0b0', icon: 'fa-bookmark' },
            { label: 'Caught Up', count: stats.totalCaughtUp, color: '#0096ff', icon: 'fa-arrow-up' },
            { label: 'Dropped', count: stats.totalDropped, color: '#f44336', icon: 'fa-xmark' },
        ].filter(s => s.count > 0)
    }, [stats])

    const maxScoreCount = Math.max(...stats.scoreBuckets.map(b => b.count), 1)
    const maxYearCount = Math.max(...stats.yearsAdded.map(y => y.count), 1)

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading statistics...</p></div>
            </div>
        </section>
    )

    return (
        <div className="statistics-page">
            <div className="statistics-container">
                <div className="stats-hero">
                    <div className="stats-hero__header">
                        <h1 className="stats-hero__title">Your Library Stats</h1>
                        <p className="stats-hero__subtitle">Everything about your watching journey</p>
                    </div>
                    <div className="stats-hero__grid">
                        <div className="stats-hero-card stats-hero-card--primary">
                            <div className="stats-hero-card__icon"><i className="fa-solid fa-layer-group"></i></div>
                            <div className="stats-hero-card__value">{stats.totalItems}</div>
                            <div className="stats-hero-card__label">Total Items</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--mint">
                            <div className="stats-hero-card__icon"><i className="fa-solid fa-circle-check"></i></div>
                            <div className="stats-hero-card__value">{stats.totalCompleted}</div>
                            <div className="stats-hero-card__label">Completed</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--gold">
                            <div className="stats-hero-card__icon"><i className="fa-solid fa-play"></i></div>
                            <div className="stats-hero-card__value">{stats.totalWatching}</div>
                            <div className="stats-hero-card__label">Watching</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--blue">
                            <div className="stats-hero-card__icon"><i className="fa-solid fa-tv"></i></div>
                            <div className="stats-hero-card__value">{stats.totalEpisodesWatched.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Episodes Watched</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--purple">
                            <div className="stats-hero-card__icon"><i className="fa-solid fa-clock"></i></div>
                            <div className="stats-hero-card__value">{formatHours(stats.totalWatchTimeMinutes)}</div>
                            <div className="stats-hero-card__label">Watch Time</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--pink">
                            <div className="stats-hero-card__icon"><i className="fa-solid fa-star"></i></div>
                            <div className="stats-hero-card__value">{stats.avgScore !== null ? stats.avgScore : '—'}</div>
                            <div className="stats-hero-card__label">Avg TMDB Score</div>
                        </div>
                    </div>
                </div>

                <div className="stats-grid stats-grid--2col">
                    <div className="stats-panel">
                        <h3 className="stats-panel__title"><i className="fa-solid fa-gauge-high"></i> Completion Rate</h3>
                        <div className="stats-completion">
                            <div className="stats-completion__ring" style={{ '--progress': `${stats.completionRate * 3.6}deg` } as React.CSSProperties}>
                                <div className="stats-completion__ring-inner">
                                    <span className="stats-completion__value">{stats.completionRate}%</span>
                                    <span className="stats-completion__label">completed</span>
                                </div>
                            </div>
                            <div className="stats-completion__details">
                                <div className="stats-completion__row"><span>Completed</span><strong>{stats.totalCompleted}</strong></div>
                                <div className="stats-completion__row"><span>In Progress</span><strong>{stats.totalWatching + stats.totalCaughtUp}</strong></div>
                                <div className="stats-completion__row"><span>Planned</span><strong>{stats.totalPlanning}</strong></div>
                                <div className="stats-completion__row"><span>Dropped</span><strong>{stats.totalDropped}</strong></div>
                            </div>
                        </div>
                    </div>

                    <div className="stats-panel">
                        <h3 className="stats-panel__title"><i className="fa-solid fa-chart-pie"></i> Media Type Breakdown</h3>
                        <div className="stats-media">
                            <div className="stats-media__item">
                                <div className="stats-media__header"><span className="stats-media__label"><i className="fa-solid fa-film"></i> Movies</span><span className="stats-media__count">{stats.totalMovies}</span></div>
                                <div className="stats-media__bar"><div className="stats-media__fill stats-media__fill--movies" style={{ width: `${stats.totalItems > 0 ? (stats.totalMovies / stats.totalItems) * 100 : 0}%` }} /></div>
                                <div className="stats-media__sub"><span>{stats.moviesCompleted} completed</span><span className="stats-media__rate">{stats.movieCompletionRate}%</span></div>
                            </div>
                            <div className="stats-media__item">
                                <div className="stats-media__header"><span className="stats-media__label"><i className="fa-solid fa-tv"></i> TV Shows</span><span className="stats-media__count">{stats.totalTvShows}</span></div>
                                <div className="stats-media__bar"><div className="stats-media__fill stats-media__fill--tv" style={{ width: `${stats.totalItems > 0 ? (stats.totalTvShows / stats.totalItems) * 100 : 0}%` }} /></div>
                                <div className="stats-media__sub"><span>{stats.tvCompleted} completed</span><span className="stats-media__rate">{stats.tvCompletionRate}%</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="stats-panel">
                    <h3 className="stats-panel__title"><i className="fa-solid fa-list-check"></i> Status Breakdown</h3>
                    <div className="stats-status">
                        {statusData.map(status => (
                            <div className="stats-status__item" key={status.label}>
                                <div className="stats-status__header">
                                    <span className="stats-status__label"><i className={`fa-solid ${status.icon}`} style={{ color: status.color }}></i>{status.label}</span>
                                    <span className="stats-status__count">{status.count}</span>
                                </div>
                                <div className="stats-status__bar"><div className="stats-status__fill" style={{ width: `${stats.totalItems > 0 ? (status.count / stats.totalItems) * 100 : 0}%`, background: `linear-gradient(90deg, ${status.color}, ${status.color}cc)` }} /></div>
                            </div>
                        ))}
                        {statusData.length === 0 && <p className="stats-empty">No items in your library yet.</p>}
                    </div>
                </div>

                <div className="stats-grid stats-grid--2col">
                    <div className="stats-panel">
                        <h3 className="stats-panel__title"><i className="fa-solid fa-chart-column"></i> TMDB Score Distribution</h3>
                        <div className="stats-rating">
                            {stats.scoreBuckets.map(bucket => (
                                <div className="stats-rating__row" key={bucket.label}>
                                    <span className="stats-rating__label">{bucket.label}</span>
                                    <div className="stats-rating__bar"><div className="stats-rating__fill" style={{ width: `${(bucket.count / maxScoreCount) * 100}%`, opacity: bucket.count > 0 ? 0.4 + (bucket.count / maxScoreCount) * 0.6 : 0.1 }} /></div>
                                    <span className="stats-rating__count">{bucket.count}</span>
                                </div>
                            ))}
                            <div className="stats-rating__footer"><span>{stats.totalItems} total items</span><span>{stats.totalCompleted} completed</span></div>
                        </div>
                    </div>

                    <div className="stats-panel">
                        <h3 className="stats-panel__title"><i className="fa-solid fa-calendar-days"></i> Items Added Per Year</h3>
                        <div className="stats-years">
                            {stats.yearsAdded.map(year => (
                                <div className="stats-years__row" key={year.year}>
                                    <span className="stats-years__label">{year.year}</span>
                                    <div className="stats-years__bar"><div className="stats-years__fill" style={{ width: `${(year.count / maxYearCount) * 100}%` }} /></div>
                                    <span className="stats-years__count">{year.count}</span>
                                </div>
                            ))}
                            {stats.yearsAdded.length === 0 && <p className="stats-empty">No items added yet.</p>}
                        </div>
                    </div>
                </div>

                <div className="stats-panel">
                    <h3 className="stats-panel__title"><i className="fa-solid fa-lightbulb"></i> Insights</h3>
                    <div className="stats-insights">
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--mint"><i className="fa-solid fa-trophy"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Highest TMDB Score</div>
                                {stats.highestScored ? <>
                                    <div className="stats-insight-card__value">{stats.highestScored.vote_average} <i className="fa-solid fa-star" style={{ color: '#ffc107', fontSize: '0.8rem' }}></i></div>
                                    <div className="stats-insight-card__sub">{stats.highestScored.title}</div>
                                </> : <div className="stats-insight-card__value">—</div>}
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--red"><i className="fa-solid fa-thumbs-down"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Lowest TMDB Score</div>
                                {stats.lowestScored ? <>
                                    <div className="stats-insight-card__value">{stats.lowestScored.vote_average} <i className="fa-solid fa-star" style={{ color: '#ffc107', fontSize: '0.8rem' }}></i></div>
                                    <div className="stats-insight-card__sub">{stats.lowestScored.title}</div>
                                </> : <div className="stats-insight-card__value">—</div>}
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--blue"><i className="fa-solid fa-film"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Avg Episodes Per Show</div>
                                <div className="stats-insight-card__value">{stats.avgEpisodesPerShow}</div>
                                <div className="stats-insight-card__sub">across {stats.totalTvShows} shows</div>
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--purple"><i className="fa-solid fa-stopwatch"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Avg Time Per Episode</div>
                                <div className="stats-insight-card__value">{stats.avgWatchTimePerEpisode > 0 ? `${stats.avgWatchTimePerEpisode}m` : '—'}</div>
                                <div className="stats-insight-card__sub">per episode</div>
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--gold"><i className="fa-solid fa-calendar"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Total Days Watching</div>
                                <div className="stats-insight-card__value">{stats.totalDaysWatching.toLocaleString()}</div>
                                <div className="stats-insight-card__sub">days of content</div>
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--pink"><i className="fa-solid fa-fire"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">This Month Completed</div>
                                <div className="stats-insight-card__value">{stats.thisMonthCompleted}</div>
                                <div className="stats-insight-card__sub">{stats.lastMonthCompleted > 0 ? `${stats.lastMonthCompleted} last month` : 'No completions last month'}</div>
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--blue"><i className="fa-solid fa-chart-line"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Avg Progress (Watching)</div>
                                <div className="stats-insight-card__value">{stats.avgProgressInWatching}</div>
                                <div className="stats-insight-card__sub">episodes across {stats.totalWatching} shows</div>
                            </div>
                        </div>
                        <div className="stats-insight-card">
                            <div className="stats-insight-card__icon stats-insight-card__icon--purple"><i className="fa-solid fa-heart"></i></div>
                            <div className="stats-insight-card__content">
                                <div className="stats-insight-card__label">Most Added Type</div>
                                <div className="stats-insight-card__value">{stats.mostAddedType || '—'}</div>
                                <div className="stats-insight-card__sub">in your library</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Statistics
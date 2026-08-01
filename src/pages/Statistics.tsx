import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../services/supabaseClient'
import { useCache } from '../hooks/useCache'
import { usePageTitle } from '../hooks/usePageTitle'
import type { WatchlistItem } from '../types'

interface Stats {
    totalItems: number
    totalMovies: number
    totalTvShows: number
    moviesCompleted: number
    tvShowsCompleted: number
    totalCompleted: number
    totalWatching: number
    totalPlanning: number
    totalDropped: number
    totalCaughtUp: number
    totalEpisodesWatched: number
    totalWatchTimeMinutes: number
    averageRating: number | null
    highestRated: { title: string; rating: number } | null
    lowestRated: { title: string; rating: number } | null
    mostCommonStatus: string
    completionRate: number
}

const formatMinutes = (minutes: number): string => {
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor((minutes % 1440) / 60)
    const mins = minutes % 60
    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)
    return parts.join(' ')
}

const Statistics: React.FC = () => {
    usePageTitle('Trackist - Statistics')
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)
    const { stats: cacheStats, clearCache, isClearing } = useCache()

    useEffect(() => {
        const fetchStats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            const { data: watchlist, error: watchlistError } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', user.id)

            if (watchlistError) {
                console.error('Error fetching watchlist:', watchlistError)
                setLoading(false)
                return
            }

            const items = (watchlist || []) as WatchlistItem[]

            // Fetch episode statistics
            let totalEpisodesWatched = 0
            let totalWatchTimeMinutes = 0

            try {
                const { data: episodeStats, error: episodeStatsError } = await supabase
                    .rpc('get_my_watch_statistics')

                if (episodeStatsError) {
                    console.error('Error fetching episode statistics:', episodeStatsError)
                } else if (episodeStats && episodeStats.length > 0) {
                    totalEpisodesWatched = Number(episodeStats[0].total_episodes_watched)
                    totalWatchTimeMinutes = Number(episodeStats[0].total_watch_time_minutes)
                }
            } catch (error) {
                console.error('Failed to fetch episode statistics:', error)
            }

            // Separate movies and TV shows/anime
            const movies = items.filter(i => i.media_type === 'movie')
            const tvShows = items.filter(i => i.media_type === 'tv' || i.media_type === 'anime')

            const moviesCompleted = movies.filter(i => i.status === 'completed').length
            const tvShowsCompleted = tvShows.filter(i => i.status === 'completed').length

            const totalCompleted = items.filter(i => i.status === 'completed').length
            const totalWatching = items.filter(i => i.status === 'watching').length
            const totalPlanning = items.filter(i => i.status === 'planning').length
            const totalDropped = items.filter(i => i.status === 'dropped').length
            const totalCaughtUp = items.filter(i => i.status === 'caught_up').length

            const ratedItems = items.filter(i => i.rating != null && i.rating > 0)
            const averageRating = ratedItems.length > 0
                ? Math.round((ratedItems.reduce((sum, i) => sum + (i.rating || 0), 0) / ratedItems.length) * 10) / 10
                : null

            const highestRated = ratedItems.length > 0
                ? ratedItems.reduce((best, curr) => (curr.rating || 0) > (best?.rating || 0) ? curr : best, ratedItems[0])
                : null

            const lowestRated = ratedItems.length > 0
                ? ratedItems.reduce((worst, curr) => (curr.rating || 0) < (worst?.rating || 0) ? curr : worst, ratedItems[0])
                : null

            const statusCounts = [
                { status: 'Completed', count: totalCompleted },
                { status: 'Watching', count: totalWatching },
                { status: 'Planning', count: totalPlanning },
                { status: 'Caught Up', count: totalCaughtUp },
                { status: 'Dropped', count: totalDropped },
            ]
            const mostCommonStatus = statusCounts.reduce((a, b) => a.count > b.count ? a : b).status

            const completionRate = items.length > 0
                ? Math.round((totalCompleted / items.length) * 100)
                : 0

            setStats({
                totalItems: items.length,
                totalMovies: movies.length,
                totalTvShows: tvShows.length,
                moviesCompleted,
                tvShowsCompleted,
                totalCompleted,
                totalWatching,
                totalPlanning,
                totalDropped,
                totalCaughtUp,
                totalEpisodesWatched,
                totalWatchTimeMinutes,
                averageRating,
                highestRated: highestRated ? { title: highestRated.title, rating: highestRated.rating || 0 } : null,
                lowestRated: lowestRated ? { title: lowestRated.title, rating: lowestRated.rating || 0 } : null,
                mostCommonStatus,
                completionRate,
            })

            setLoading(false)
        }

        fetchStats()
    }, [])

    const statusData = useMemo(() => {
        if (!stats) return []
        return [
            { label: 'Completed', count: stats.totalCompleted, color: '--color-mint' },
            { label: 'Watching', count: stats.totalWatching, color: '#ffc107' },
            { label: 'Planning', count: stats.totalPlanning, color: '#888' },
            { label: 'Caught Up', count: stats.totalCaughtUp, color: '#0096ff' },
            { label: 'Dropped', count: stats.totalDropped, color: '#f44336' },
        ].filter(s => s.count > 0)
    }, [stats])

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading statistics...</p></div>
            </div>
        </section>
    )

    if (!stats) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Could not load statistics.</p>
            </div>
        </section>
    )

    return (
        <div className="statistics-page">
            <div className="statistics-container">
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Statistics</h2>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                                Cache: {cacheStats.memoryEntries + cacheStats.dbEntries} entries
                            </span>
                            <button
                                onClick={clearCache}
                                disabled={isClearing || (cacheStats.memoryEntries === 0 && cacheStats.dbEntries === 0)}
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'rgba(255,255,255,0.7)',
                                    borderRadius: '8px',
                                    cursor: isClearing ? 'not-allowed' : 'pointer',
                                    fontSize: '0.8rem',
                                    opacity: (cacheStats.memoryEntries === 0 && cacheStats.dbEntries === 0) ? 0.5 : 1,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isClearing ? 'Clearing...' : 'Clear Cache'}
                            </button>
                        </div>
                    </div>

                    {/* Summary Row */}
                    <div className="statistics-summary">
                        <div className="summary-stat">
                            <span className="summary-stat__value">{stats.totalItems}</span>
                            <span className="summary-stat__label">Total Items</span>
                        </div>
                        <div className="summary-stat">
                            <span className="summary-stat__value">{stats.totalCompleted}</span>
                            <span className="summary-stat__label">Completed</span>
                        </div>
                        <div className="summary-stat">
                            <span className="summary-stat__value">{stats.totalWatching}</span>
                            <span className="summary-stat__label">Watching</span>
                        </div>
                        <div className="summary-stat">
                            <span className="summary-stat__value">{stats.totalEpisodesWatched.toLocaleString()}</span>
                            <span className="summary-stat__label">Episodes</span>
                        </div>
                        <div className="summary-stat">
                            <span className="summary-stat__value">{formatMinutes(stats.totalWatchTimeMinutes)}</span>
                            <span className="summary-stat__label">Watch Time</span>
                        </div>
                        <div className="summary-stat">
                            <span className="summary-stat__value">{stats.averageRating !== null ? stats.averageRating : '—'}</span>
                            <span className="summary-stat__label">Avg Rating</span>
                        </div>
                    </div>

                    {/* Media Type Breakdown */}
                    <div className="statistics-section">
                        <h3 className="statistics-section__title">Media Type Breakdown</h3>
                        <div className="statistics-breakdown">
                            <div className="breakdown-item">
                                <div className="breakdown-item__header">
                                    <span className="breakdown-item__label">Movies</span>
                                    <span className="breakdown-item__count">{stats.totalMovies}</span>
                                </div>
                                <div className="breakdown-bar">
                                    <div
                                        className="breakdown-bar__fill breakdown-bar__fill--movies"
                                        style={{ width: `${stats.totalItems > 0 ? (stats.totalMovies / stats.totalItems) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="breakdown-item__sub">
                                    {stats.moviesCompleted} completed
                                </div>
                            </div>
                            <div className="breakdown-item">
                                <div className="breakdown-item__header">
                                    <span className="breakdown-item__label">TV Shows & Anime</span>
                                    <span className="breakdown-item__count">{stats.totalTvShows}</span>
                                </div>
                                <div className="breakdown-bar">
                                    <div
                                        className="breakdown-bar__fill breakdown-bar__fill--tv"
                                        style={{ width: `${stats.totalItems > 0 ? (stats.totalTvShows / stats.totalItems) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="breakdown-item__sub">
                                    {stats.tvShowsCompleted} completed
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Status Breakdown */}
                    <div className="statistics-section">
                        <h3 className="statistics-section__title">Status Breakdown</h3>
                        <div className="statistics-breakdown">
                            {statusData.map(status => (
                                <div className="breakdown-item" key={status.label}>
                                    <div className="breakdown-item__header">
                                        <span className="breakdown-item__label">{status.label}</span>
                                        <span className="breakdown-item__count">{status.count}</span>
                                    </div>
                                    <div className="breakdown-bar">
                                        <div
                                            className="breakdown-bar__fill"
                                            style={{
                                                width: `${stats.totalItems > 0 ? (status.count / stats.totalItems) * 100 : 0}%`,
                                                background: `linear-gradient(90deg, ${status.color}, ${status.color}dd)`
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Additional Insights */}
                    <div className="statistics-section">
                        <h3 className="statistics-section__title">Additional Insights</h3>
                        <div className="statistics-insights">
                            <div className="insight-card">
                                <div className="insight-card__label">Completion Rate</div>
                                <div className="insight-card__value">{stats.completionRate}%</div>
                                <div className="insight-card__bar">
                                    <div
                                        className="insight-card__bar-fill"
                                        style={{ width: `${stats.completionRate}%` }}
                                    />
                                </div>
                            </div>
                            <div className="insight-card">
                                <div className="insight-card__label">Most Common Status</div>
                                <div className="insight-card__value">{stats.mostCommonStatus}</div>
                            </div>
                            {stats.highestRated && (
                                <div className="insight-card">
                                    <div className="insight-card__label">Highest Rated</div>
                                    <div className="insight-card__value insight-card__value--high">
                                        {stats.highestRated.rating}
                                    </div>
                                    <div className="insight-card__sub">{stats.highestRated.title}</div>
                                </div>
                            )}
                            {stats.lowestRated && (
                                <div className="insight-card">
                                    <div className="insight-card__label">Lowest Rated</div>
                                    <div className="insight-card__value insight-card__value--low">
                                        {stats.lowestRated.rating}
                                    </div>
                                    <div className="insight-card__sub">{stats.lowestRated.title}</div>
                                </div>
                            )}
                            <div className="insight-card">
                                <div className="insight-card__label">Avg Episodes Per Show</div>
                                <div className="insight-card__value">
                                    {stats.totalTvShows > 0
                                        ? Math.round(stats.totalEpisodesWatched / stats.totalTvShows)
                                        : '—'}
                                </div>
                            </div>
                            <div className="insight-card">
                                <div className="insight-card__label">Avg Watch Time Per Episode</div>
                                <div className="insight-card__value">
                                    {stats.totalEpisodesWatched > 0
                                        ? formatMinutes(Math.round(stats.totalWatchTimeMinutes / stats.totalEpisodesWatched))
                                        : '—'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Statistics

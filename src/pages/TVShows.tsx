import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { getWatchedEpisodeCount, markEpisodeWatched, checkAndUpdateCompleted } from '../services/watchlistService'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useScrollRestoration } from '../hooks/useScrollRestoration'

interface TVShowWithProgress extends WatchlistItem {
    total_episodes_watched: number
}

const TVShows: React.FC = () => {
    const navigate = useNavigate()
    const { clearScrollPosition } = useScrollRestoration()
    const [items, setItems] = useState<TVShowWithProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [markAllModal, setMarkAllModal] = useState<WatchlistItem | null>(null)
    const [markingAllWatched, setMarkingAllWatched] = useState(false)
    const [showAllCurrentlyWatching, setShowAllCurrentlyWatching] = useState(false)
    const [showAllNotStarted, setShowAllNotStarted] = useState(false)
    const [showAllCompleted, setShowAllCompleted] = useState(false)

    const CURRENTLY_WATCHING_ROW_COUNT = 2 // Show 2 rows for "Currently Watching"
    const OTHER_SECTION_ROW_COUNT = 1 // Show 1 row for other sections

    const fetchWatchlist = useCallback(async () => {
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
            .order('updated_at', { ascending: false })

        if (!error && data) {
            // Fetch episode progress for each TV show
            const itemsWithProgress: TVShowWithProgress[] = await Promise.all(
                (data || []).map(async (item: WatchlistItem) => {
                    const totalEpisodesWatched = await getWatchedEpisodeCount(item.id)

                    // For shows that appear completed, verify total_episodes from TMDB
                    if (item.tmdb_id && (
                        item.status === 'completed' || item.status === 'caught_up' ||
                        (item.total_episodes !== undefined && 
                         item.total_episodes > 0 && 
                         totalEpisodesWatched >= item.total_episodes)
                    )) {
                        try {
                            const details = await getTVDetails(item.tmdb_id)
                            const currentTotalEpisodes = details.number_of_episodes || 0
                            const storedTotalEpisodes = item.total_episodes || 0

                            if (currentTotalEpisodes !== storedTotalEpisodes) {
                                await supabase.from('watchlist').update({
                                    total_episodes: currentTotalEpisodes,
                                    total_seasons: details.number_of_seasons || item.total_seasons,
                                    updated_at: new Date().toISOString()
                                }).eq('id', item.id)

                                return {
                                    ...item,
                                    total_episodes: currentTotalEpisodes,
                                    total_seasons: details.number_of_seasons || item.total_seasons,
                                    total_episodes_watched: totalEpisodesWatched
                                }
                            }
                        } catch (err) {
                            console.error(`Failed to verify total_episodes for ${item.title}:`, err)
                        }
                    }

                    return {
                        ...item,
                        total_episodes_watched: totalEpisodesWatched
                    }
                })
            )
            setItems(itemsWithProgress)
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        const load = async () => {
            await fetchWatchlist()
        }
        load().catch(() => {})
    }, [fetchWatchlist])

    // Restore scroll position on mount
    useEffect(() => {
        const savedPosition = sessionStorage.getItem('scrollPosition')
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition))
            sessionStorage.removeItem('scrollPosition')
        }
    }, [])

    // Clear scroll position when navigating to detail page
    useEffect(() => {
        const handleNavigation = () => {
            clearScrollPosition()
        }
        
        window.addEventListener('beforeunload', handleNavigation)
        return () => window.removeEventListener('beforeunload', handleNavigation)
    }, [clearScrollPosition])

    // Listen for watchlist-refresh event from the Fix Progress modal
    useEffect(() => {
        const handleRefresh = () => {
            fetchWatchlist().catch(() => {})
        }
        window.addEventListener('watchlist-refresh', handleRefresh)
        return () => window.removeEventListener('watchlist-refresh', handleRefresh)
    }, [fetchWatchlist])

    // Reset trigger: check if completed shows now have new episodes/seasons
    useEffect(() => {
        const checkForNewEpisodes = async () => {
            const completedShows = items.filter(
                item => (item.status === 'completed' || item.status === 'caught_up' || (
                    item.status === 'watching' && 
                    item.total_episodes !== undefined && 
                    item.total_episodes > 0 && 
                    item.total_episodes_watched >= item.total_episodes
                )) && 
                item.total_episodes_watched > 0 &&
                item.total_episodes !== undefined
            )

            if (completedShows.length === 0) return

            const updatedItems = [...items]
            let hasChanges = false

            for (const show of completedShows) {
                if (!show.tmdb_id) continue

                try {
                    const details = await getTVDetails(show.tmdb_id)
                    const currentTotalEpisodes = details.number_of_episodes || 0
                    const storedTotalEpisodes = show.total_episodes || 0

                    if (currentTotalEpisodes > storedTotalEpisodes) {
                        const index = updatedItems.findIndex(item => item.id === show.id)
                        if (index !== -1) {
                            updatedItems[index] = {
                                ...updatedItems[index],
                                status: 'watching',
                                total_episodes: currentTotalEpisodes,
                                total_seasons: details.number_of_seasons || show.total_seasons
                            }
                        }
                        hasChanges = true

                        await supabase.from('watchlist').update({
                            status: 'watching',
                            total_episodes: currentTotalEpisodes,
                            total_seasons: details.number_of_seasons || show.total_seasons,
                            updated_at: new Date().toISOString()
                        }).eq('id', show.id)
                    }
                } catch (err) {
                    console.error(`Failed to check for new episodes for ${show.title}:`, err)
                }
            }

            if (hasChanges) {
                setItems(updatedItems)
            }
        }

        if (!loading && items.length > 0) {
            checkForNewEpisodes()
        }

        const interval = setInterval(() => {
            if (items.length > 0) {
                checkForNewEpisodes()
            }
        }, 5 * 60 * 1000)

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && items.length > 0) {
                checkForNewEpisodes()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, items.length])

    const filteredItems = items.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Container A: Currently Watching - some episodes watched, but total watched < total available
    const currentlyWatching = filteredItems.filter(
        item => item.status === 'watching' && 
        item.total_episodes_watched > 0 && 
        (item.total_episodes === undefined || item.total_episodes_watched < item.total_episodes)
    )

    // Container B: Watchlist (Not Started) - in watchlist with 0 episodes watched
    const notStarted = filteredItems.filter(
        item => (item.status === 'watching' || item.status === 'planning') && 
        item.total_episodes_watched === 0
    )

    // Container C: Completed - all available episodes watched
    const completed = filteredItems.filter(
        item => (item.status === 'completed' || item.status === 'caught_up' || (
            item.status === 'watching' && 
            item.total_episodes !== undefined && 
            item.total_episodes > 0 && 
            item.total_episodes_watched >= item.total_episodes
        ))
    )

    const visibleCurrentlyWatching = currentlyWatching
    const visibleNotStarted = notStarted
    const visibleCompleted = completed

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        media_type: 'tv'
    })

    const handleMarkAllWatched = async (item: WatchlistItem) => {
        if (!item.tmdb_id) return

        setMarkingAllWatched(true)
        try {
            // Fetch all episodes from TMDB
            const details = await getTVDetails(item.tmdb_id)
            const seasonNumbers = (details.seasons || [])
                .filter((s: { season_number: number }) => s.season_number > 0)
                .map((s: { season_number: number }) => s.season_number)

            // Insert all episodes into watchlist_episodes
            for (const season of seasonNumbers) {
                const seasonData = await getTVSeasonDetails(item.tmdb_id, season)
                const episodes = seasonData.episodes || []
                for (const ep of episodes) {
                    await markEpisodeWatched(item.id, season, ep.episode_number, {
                        tmdb_episode_id: ep.id,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        vote_average: ep.vote_average,
                        air_date: ep.air_date,
                        runtime: ep.runtime
                    })
                }
            }

            // Check TMDB status and update accordingly (completed vs caught_up)
            await checkAndUpdateCompleted(item.id, item.tmdb_id)

            setMarkAllModal(null)
            fetchWatchlist()
        } catch (err) {
            console.error('Failed to mark all episodes as watched:', err)
            alert('Failed to mark all episodes as watched. Please try again.')
        } finally {
            setMarkingAllWatched(false)
        }
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
            <div className="discover-container" style={{ width: '85%' }}>
                <div className="discover-search-wrap">
                    <form onSubmit={(e) => e.preventDefault()}>
                        <div className="discover-search-box">
                            <svg className="discover-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                className="discover-search"
                                placeholder="Search your TV shows..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                {/* Container A (Top): Currently Watching */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Currently Watching</h3>
                        {currentlyWatching.length > 0 && (
                            <button 
                                className="expand-icon-btn"
                                onClick={() => setShowAllCurrentlyWatching(!showAllCurrentlyWatching)}
                                aria-label={showAllCurrentlyWatching ? 'Show less' : 'Show more'}
                            >
                                <i className={`fa-solid fa-angle-${showAllCurrentlyWatching ? 'down' : 'up'}`}></i>
                            </button>
                        )}
                    </div>
                    {currentlyWatching.length > 0 ? (
                        <div 
                            className={`discover-grid ${!showAllCurrentlyWatching ? 'watchlist-grid--collapsed' : ''}`}
                            style={!showAllCurrentlyWatching ? { maxHeight: `${CURRENTLY_WATCHING_ROW_COUNT * 245}px` } : undefined}
                        >
                            {visibleCurrentlyWatching.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    item={buildTmdbItem(item)}
                                    isInWatchlist={true}
                                    onAdd={() => {}}
                                    onMarkWatched={() => setMarkAllModal(item)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            {searchQuery ? 'No matching shows' : 'No shows currently in progress'}
                        </p>
                    )}
                </div>

                {/* Container B (Middle): Watchlist (Not Started) */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Watchlist (Not Started)</h3>
                        {notStarted.length > 0 && (
                            <button 
                                className="expand-icon-btn"
                                onClick={() => setShowAllNotStarted(!showAllNotStarted)}
                                aria-label={showAllNotStarted ? 'Show less' : 'Show more'}
                            >
                                <i className={`fa-solid fa-angle-${showAllNotStarted ? 'down' : 'up'}`}></i>
                            </button>
                        )}
                    </div>
                    {notStarted.length > 0 ? (
                        <div 
                            className={`discover-grid ${!showAllNotStarted ? 'watchlist-grid--collapsed' : ''}`}
                            style={!showAllNotStarted ? { maxHeight: `${OTHER_SECTION_ROW_COUNT * 245}px` } : undefined}
                        >
                            {visibleNotStarted.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    item={buildTmdbItem(item)}
                                    isInWatchlist={true}
                                    onAdd={() => {}}
                                    onMarkWatched={() => setMarkAllModal(item)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            {searchQuery ? 'No matching shows' : 'No shows queued to start'}
                        </p>
                    )}
                </div>

                {/* Container C (Bottom): Completed */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Completed</h3>
                        {completed.length > 0 && (
                            <button 
                                className="expand-icon-btn"
                                onClick={() => setShowAllCompleted(!showAllCompleted)}
                                aria-label={showAllCompleted ? 'Show less' : 'Show more'}
                            >
                                <i className={`fa-solid fa-angle-${showAllCompleted ? 'down' : 'up'}`}></i>
                            </button>
                        )}
                    </div>
                    {completed.length > 0 ? (
                        <div 
                            className={`discover-grid ${!showAllCompleted ? 'watchlist-grid--collapsed' : ''}`}
                            style={!showAllCompleted ? { maxHeight: `${OTHER_SECTION_ROW_COUNT * 245}px` } : undefined}
                        >
                            {visibleCompleted.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    item={buildTmdbItem(item)}
                                    isInWatchlist={true}
                                    onAdd={() => {}}
                                    onMarkUnwatched={() => navigate(`/tv/${item.tmdb_id}`)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            {searchQuery ? 'No matching shows' : 'No completed shows yet'}
                        </p>
                    )}
                </div>

                {filteredItems.length === 0 && !searchQuery && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No TV shows or anime in your watchlist. Discover some!
                    </p>
                )}
            </div>

            {markAllModal && (
                <ConfirmModal
                    isOpen={true}
                    title="Mark as Fully Watched"
                    message={`Have you fully watched "${markAllModal.title}"? This will mark all episodes as watched and set the status to completed.`}
                    onConfirm={() => handleMarkAllWatched(markAllModal)}
                    onCancel={() => {
                        if (!markingAllWatched) {
                            setMarkAllModal(null)
                            navigate(`/tv/${markAllModal.tmdb_id}`)
                        }
                    }}
                    confirmText={markingAllWatched ? 'Marking...' : 'Yes, Fully Watched'}
                    cancelText="Go to Details"
                    confirmColor="success"
                />
            )}
        </div>
    )
}

export default TVShows
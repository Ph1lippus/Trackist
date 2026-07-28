import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getTVDetails } from '../services/tmdbService'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'

interface TVShowWithProgress extends WatchlistItem {
    total_episodes_watched: number
}

const TVShows: React.FC = () => {
    const navigate = useNavigate()
    const [items, setItems] = useState<TVShowWithProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [markAllModal, setMarkAllModal] = useState<WatchlistItem | null>(null)

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
                    let totalEpisodesWatched = 0
                    const { data: episodeData } = await supabase
                        .from('watchlist_episodes')
                        .select('watched')
                        .eq('watchlist_id', item.id)
                        .eq('watched', true)

                    if (episodeData) {
                        totalEpisodesWatched = episodeData.length
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
        fetchWatchlist().catch(() => {})
    }, [fetchWatchlist])

    // Restore scroll position on mount
    useEffect(() => {
        const savedPosition = sessionStorage.getItem('scrollPosition')
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition))
            sessionStorage.removeItem('scrollPosition')
        }
    }, [])

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
            // Check shows in the completed container (status='completed' OR all episodes watched)
            const completedShows = items.filter(
                item => (item.status === 'completed' || (
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

                    // If TMDB now reports more episodes than when we stored it, move it back to watching
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

                        // Also update the database to reflect the new status and totals
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

        // Run check on initial load
        if (!loading && items.length > 0) {
            checkForNewEpisodes()
        }

        // Also run check every 5 minutes to catch newly released episodes
        const interval = setInterval(() => {
            if (items.length > 0) {
                checkForNewEpisodes()
            }
        }, 5 * 60 * 1000)

        // Run check when page becomes visible (user switches back to this tab)
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
        item => (item.status === 'completed' || (
            item.status === 'watching' && 
            item.total_episodes !== undefined && 
            item.total_episodes > 0 && 
            item.total_episodes_watched >= item.total_episodes
        ))
    )

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        media_type: 'tv'
    })

    const handleMarkAllWatched = async (item: WatchlistItem) => {
        // Mark the show as completed in the database
        await supabase.from('watchlist').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', item.id)

        setMarkAllModal(null)
        fetchWatchlist()
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
            <div className="discover-container">
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
                    <h3 className="watchlist-section__title">Currently Watching</h3>
                    {currentlyWatching.length > 0 ? (
                        <div className="discover-grid">
                            {currentlyWatching.map((item) => (
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
                    <h3 className="watchlist-section__title">Watchlist (Not Started)</h3>
                    {notStarted.length > 0 ? (
                        <div className="discover-grid">
                            {notStarted.map((item) => (
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
                    <h3 className="watchlist-section__title">Completed</h3>
                    {completed.length > 0 ? (
                        <div className="discover-grid">
                            {completed.map((item) => (
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
                        setMarkAllModal(null)
                        navigate(`/tv/${markAllModal.tmdb_id}`)
                    }}
                    confirmText="Yes, Fully Watched"
                    cancelText="Go to Details"
                    confirmColor="success"
                />
            )}
        </div>
    )
}

export default TVShows
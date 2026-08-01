import React, { useEffect, useState, useMemo } from 'react'
import { getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { markEpisodeWatched, checkAndUpdateCompleted } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { VirtuosoGrid } from 'react-virtuoso'

const TVShows: React.FC = () => {
    usePageTitle('Trackist - TV Shows')
    const { committedQuery } = useSearch()
    
    // Use global store
    const store = useLibraryStore()
    const tvShows = store.tvShows
    const isInitialized = store.isInitialized
    
    const [markAllModal, setMarkAllModal] = useState<WatchlistItem | null>(null)
    const [markingAllWatched, setMarkingAllWatched] = useState(false)

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Calculate episode progress for TV shows
    const tvShowsWithProgress = useMemo(() => {
        if (!isInitialized) return []
        
        return tvShows.map(show => ({
            ...show,
            total_episodes_watched: 0 // Will be calculated on demand
        }))
    }, [tvShows, isInitialized])

    // Listen for watchlist-refresh event from the Fix Progress modal
    useEffect(() => {
        const handleRefresh = () => {
            // Refresh is handled by the store, but we can trigger a re-fetch if needed
            if (store.allItems.length > 0) {
                // The store already has the data, no need to refetch
            }
        }
        window.addEventListener('watchlist-refresh', handleRefresh)
        return () => window.removeEventListener('watchlist-refresh', handleRefresh)
    }, [store])

    // Reset trigger: check if completed shows now have new episodes/seasons
    useEffect(() => {
        const checkForNewEpisodes = async () => {
            if (!isInitialized || tvShows.length === 0) return

            const completedShows = tvShows.filter(
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

            for (const show of completedShows) {
                if (!show.tmdb_id) continue

                try {
                    const details = await getTVDetails(show.tmdb_id)
                    const currentTotalEpisodes = details.number_of_episodes || 0
                    const storedTotalEpisodes = show.total_episodes || 0

                    if (currentTotalEpisodes > storedTotalEpisodes) {
                        // Check if any new episodes have been released (air_date <= today)
                        const latestSeasonNumber = details.number_of_seasons || 1
                        const seasonData = await getTVSeasonDetails(show.tmdb_id, latestSeasonNumber)
                        const newEpisodes = seasonData.episodes?.filter((ep: { episode_number: number; air_date?: string }) => ep.episode_number > storedTotalEpisodes) || []
                        
                        // Only update if at least one new episode has been released
                        const hasReleasedEpisodes = newEpisodes.some((ep: { episode_number: number; air_date?: string }) => {
                            if (!ep.air_date) return true // If no air date, assume released
                            return new Date(ep.air_date) <= new Date()
                        })

                        if (hasReleasedEpisodes) {
                            await store.updateItem(show.id, {
                                status: 'watching',
                                total_episodes: currentTotalEpisodes,
                                total_seasons: details.number_of_seasons || show.total_seasons
                            })
                        }
                    }
                } catch (err) {
                    console.error(`Failed to check for new episodes for ${show.title}:`, err)
                }
            }
        }

        checkForNewEpisodes()

        const interval = setInterval(() => {
            if (tvShows.length > 0) {
                checkForNewEpisodes()
            }
        }, 5 * 60 * 1000)

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && tvShows.length > 0) {
                checkForNewEpisodes()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [isInitialized, tvShows.length, store])

    // Filter items based on global search (strict TV-type lock)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return tvShowsWithProgress
        return tvShowsWithProgress.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [tvShowsWithProgress, committedQuery])

    // Container A: Currently Watching - only shows with 'watching' status
    const currentlyWatching = filteredItems.filter(
        item => item.status === 'watching'
    )

    // Container B: Watchlist (Not Started) - in watchlist with 0 episodes watched
    const notStarted = filteredItems.filter(
        item => item.status === 'planning'
    ).sort((a, b) => {
        // Sort by added date (oldest first)
        const dateA = new Date(a.added_at || 0)
        const dateB = new Date(b.added_at || 0)
        return dateA.getTime() - dateB.getTime()
    })

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
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
                        air_date: ep.air_date,
                        runtime: ep.runtime
                    })
                }
            }

            // Check TMDB status and update accordingly (completed vs caught_up)
            await checkAndUpdateCompleted(item.id, item.tmdb_id)

            setMarkAllModal(null)
            // Refresh the store
            await store.refreshItem(item.id)
        } catch (err) {
            console.error('Failed to mark all episodes as watched:', err)
            alert('Failed to mark all episodes as watched. Please try again.')
        } finally {
            setMarkingAllWatched(false)
        }
    }

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                {/* Container A (Top): Currently Watching */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Currently Watching</h3>
                    </div>
                    {currentlyWatching.length > 0 ? (
                        <VirtuosoGrid
                            computeItemKey={(index) => currentlyWatching[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={currentlyWatching}
                            overscan={800}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = currentlyWatching[index]
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
                                        isInWatchlist={true}
                                        onAdd={() => {}}
                                        onMarkWatched={() => setMarkAllModal(item)}
                                    />
                                )
                            }}
                        />
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No shows currently in progress
                        </p>
                    )}
                </div>

                {/* Container B (Bottom): Watchlist (Not Started) */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Watchlist (Not Started)</h3>
                    </div>
                    {notStarted.length > 0 ? (
                        <VirtuosoGrid
                            computeItemKey={(index) => notStarted[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={notStarted}
                            overscan={800}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = notStarted[index]
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
                                        isInWatchlist={true}
                                        onAdd={() => {}}
                                        onMarkWatched={() => setMarkAllModal(item)}
                                    />
                                )
                            }}
                        />
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No shows queued to start
                        </p>
                    )}
                </div>

                {filteredItems.length === 0 && (
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
                        }
                    }}
                    confirmText={markingAllWatched ? 'Marking...' : 'Yes, Fully Watched'}
                    cancelText="Cancel"
                    confirmColor="success"
                />
            )}
        </div>
    )
}

export default TVShows
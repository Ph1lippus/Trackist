import React, { useEffect, useMemo, useState } from 'react'
import { getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import { markShowAsFullyWatched } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { VirtuosoGrid } from 'react-virtuoso'
import { useMobile } from '../contexts/useMobile'

const TVShows: React.FC = () => {
    usePageTitle('Trackist - TV Shows')
    const { committedQuery } = useSearch()

    // Use global store
    const store = useLibraryStore()
    const tvShows = store.tvShows
    const isInitialized = store.isInitialized

    const [markAllModal, setMarkAllModal] = useState<WatchlistItem | null>(null)
    const [markingAllWatched, setMarkingAllWatched] = useState(false)

    const { isMobile } = useMobile()

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Use current_episode from store data instead of fetching from database
    // This prevents infinite loops caused by repeated API calls

    // Calculate episode progress for TV shows
    const tvShowsWithProgress = useMemo(() => {
        return tvShows.map(show => ({
            ...show,
            total_episodes_watched: show.current_episode ?? 0
        }))
    }, [tvShows])

    // Listen for watchlist-refresh event from the Fix Progress modal
    useEffect(() => {
        const handleRefresh = () => {
            // Store will be updated by the refresh, so we don't need to do anything here
            // The current_episode field will be updated by the watchlistService
        }
        window.addEventListener('watchlist-refresh', handleRefresh)
        return () => window.removeEventListener('watchlist-refresh', handleRefresh)
    }, [])

    // Reset trigger: check if completed shows now have new episodes/seasons
    useEffect(() => {
        const checkForNewEpisodes = async () => {
            const currentStore = useLibraryStore.getState()
            const currentTvShows = currentStore.tvShows
            
            if (!isInitialized || currentTvShows.length === 0) return
            
            // DEBUG: Log all shows and their updated_at timestamps
            console.log('🔍 DEBUG - Checking shows order:', currentTvShows.map(s => ({
                id: s.id,
                title: s.title,
                updated_at: s.updated_at,
                added_at: s.added_at,
                status: s.status
            })).sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()))

            const completedShows = currentTvShows.filter(
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
                            // Update status and episode count WITHOUT updating updated_at
                            // This prevents the show from jumping to the top of the list
                            const { supabase } = await import('../services/supabaseClient')
                            await supabase
                                .from('watchlist')
                                .update({
                                    status: 'watching' as const,
                                    total_episodes: currentTotalEpisodes,
                                    total_seasons: details.number_of_seasons || show.total_seasons
                                })
                                .eq('id', show.id)
                            
                            // Update local store state WITHOUT changing updated_at
                            const currentState = useLibraryStore.getState()
                            const updatedItems = currentState.allItems.map(item => 
                                item.id === show.id 
                                    ? { ...item, status: 'watching' as const, total_episodes: currentTotalEpisodes, total_seasons: details.number_of_seasons || show.total_seasons }
                                    : item
                            )
                            const updatedTvShows = currentState.tvShows.map(item =>
                                item.id === show.id
                                    ? { ...item, status: 'watching' as const, total_episodes: currentTotalEpisodes, total_seasons: details.number_of_seasons || show.total_seasons }
                                    : item
                            )
                            useLibraryStore.setState({
                                allItems: updatedItems,
                                tvShows: updatedTvShows
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
            checkForNewEpisodes()
        }, 5 * 60 * 1000)

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkForNewEpisodes()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [isInitialized]) // Only depend on initialization

    // Filter items based on global search (strict TV-type lock)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return tvShowsWithProgress
        return tvShowsWithProgress.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [tvShowsWithProgress, committedQuery])

    // Container A: Currently Watching - only shows with 'watching' status
    const currentlyWatching = filteredItems.filter(
        item => item.status === 'watching'
    ).sort((a, b) => {
        // Sort by updated_at (most recent first)
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    })

    // Container B: Watchlist (Not Started) - in watchlist with 0 episodes watched
    const notStarted = filteredItems.filter(
        item => item.status === 'planning'
    ).sort((a, b) => {
        // Sort by added_at (oldest first, newest last)
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
            // Gold standard: just set the status directly - no need to insert every episode
            await markShowAsFullyWatched(item.id, item.tmdb_id)

            setMarkAllModal(null)
            // Refresh the store
            await store.refreshItem(item.id)
            
            // Check for milestone and celebrate
            // Use getState() to read the FRESH store state (the `store`
            // variable is a stale closure snapshot from the last render)
            const updatedItem = useLibraryStore.getState().allItems.find(i => i.id === item.id)
            if (updatedItem) {
                const newStatus = updatedItem.status
                if (
                    (newStatus === 'completed' || newStatus === 'caught_up') &&
                    item.status !== 'completed' && item.status !== 'caught_up'
                ) {
                    launchCosmicConfetti()
                }
            }
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
                            increaseViewportBy={{
                                        top: isMobile ? 500 : 1000,
                                        bottom: isMobile ? 1500 : 2500,
                                    }}
                            computeItemKey={(index) => currentlyWatching[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={currentlyWatching}
                            overscan={isMobile ? 500 : 1200}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = currentlyWatching[index]
                                const episodesLeft = item.total_episodes !== undefined
                                    ? Math.max(0, item.total_episodes - item.total_episodes_watched)
                                    : undefined
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
                                        isInWatchlist={true}
                                        onAdd={() => {}}
                                        onMarkWatched={() => setMarkAllModal(item)}
                                        episodesLeft={episodesLeft}
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
                            increaseViewportBy={{
                                top: isMobile ? 500 : 1000,
                                bottom: isMobile ? 1500 : 2500,
                            }}
                            computeItemKey={(index) => notStarted[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={notStarted}
                            overscan={isMobile ? 500 : 800}
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
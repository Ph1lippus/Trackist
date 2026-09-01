import React, { useEffect, useMemo, useState } from 'react'
import { markShowAsFullyWatched } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useSelectionStore } from '../stores/useSelectionStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { supabase } from '../services/supabaseClient'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'
import ViewToggleButton from '../components/layout/ViewToggleButton'

const TVShows: React.FC = () => {
    usePageTitle('Track1st - TV Shows')
    const { committedQuery } = useSearch()
    const { showIcons } = useMediaCardIcons()

    // Use global store with proper selectors
    const tvShows = useLibraryStore((state) => state.tvShows)
    const isInitialized = useLibraryStore((state) => state.isInitialized)

    const [markAllModal, setMarkAllModal] = useState<WatchlistItem | null>(null)
    const [markingAllWatched, setMarkingAllWatched] = useState(false)

    const { 
        tvShowsSelectionMode: selectionMode, 
        tvShowsSelectedIds: selectedIds, 
        toggleTVShowSelection: toggleSelection 
    } = useSelectionStore()

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    



    // Use actual watched episode count instead of current_episode
    // current_episode is the episode number within the current season, not the total watched count
    const tvShowsWithProgress = useMemo(() => {
        return tvShows.map(show => ({
            ...show,
            total_episodes_watched: show.watched_episodes_count ?? 0
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

    // Filter items based on global search (strict TV-type lock)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return tvShowsWithProgress
        return tvShowsWithProgress.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [tvShowsWithProgress, committedQuery])

    // Container A: Currently Watching - only shows with 'watching' status
    const currentlyWatching = useMemo(() => filteredItems.filter(
        item => item.status === 'watching'
    ).sort((a, b) => {
        // Sort by updated_at (most recent first)
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

    // Container B: Watchlist (Not Started) - in watchlist with 0 episodes watched
    const notStarted = useMemo(() => filteredItems.filter(
        item => item.status === 'planning'
    ).sort((a, b) => {
        // Sort by added_at (oldest first, newest last)
        const dateA = new Date(a.added_at || 0)
        const dateB = new Date(b.added_at || 0)
        return dateA.getTime() - dateB.getTime()
    }), [filteredItems])

    // Container C: Paused - shows with 'paused' status
    const paused = useMemo(() => filteredItems.filter(
        item => item.status === 'paused'
    ).sort((a, b) => {
        // Sort by updated_at (most recent first)
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

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
            await useLibraryStore.getState().refreshItem(item.id)
            
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


    const handleMarkUnwatched = async (item: WatchlistItem) => {
        if (!item.id) return

        try {
            // Delete all watched episodes
            await supabase
                .from('watchlist_episodes')
                .delete()
                .eq('watchlist_id', item.id)

            // Reset to planning status with fresh episode tracking
            await supabase
                .from('watchlist')
                .update({
                    status: 'planning',
                    current_season: 1,
                    current_episode: 0,
                    watched_episodes_count: 0,
                    next_season_number: 1,
                    next_episode_number: 1,
                    completed_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id)

            // Refresh the store
            await useLibraryStore.getState().refreshItem(item.id)
        } catch (err) {
            console.error('Failed to mark as unwatched:', err)
            alert('Failed to mark as unwatched. Please try again.')
        }
    }
    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                {/* Container A (Top): Currently Watching - header always shown so the view toggle stays visible */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Currently Watching</h3>
                        <ViewToggleButton />
                    </div>
                    {currentlyWatching.length > 0 && (
                        <div className="discover-grid">
                            {currentlyWatching.map((item) => {
                                const episodesLeft = item.total_episodes !== undefined
                                    ? Math.max(0, item.total_episodes - item.total_episodes_watched)
                                    : undefined
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkWatched={selectionMode ? undefined : (item.status === 'completed' || item.status === 'caught_up') ? undefined : () => setMarkAllModal(item)}
                                            onMarkUnwatched={selectionMode ? undefined : (item.status === 'completed' || item.status === 'caught_up') ? () => handleMarkUnwatched(item) : undefined}
                                            episodesLeft={episodesLeft}
                                            showIcons={showIcons}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Container C: Paused */}
                {paused.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Paused</h3>
                        </div>
                        <div className="discover-grid">
                            {paused.map((item) => {
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkWatched={selectionMode ? undefined : (item.status === 'completed' || item.status === 'caught_up') ? undefined : () => setMarkAllModal(item)}
                                            onMarkUnwatched={selectionMode ? undefined : (item.status === 'completed' || item.status === 'caught_up') ? () => handleMarkUnwatched(item) : undefined}
                                            showIcons={showIcons}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Container B (Bottom): Watchlist (Not Started) */}
                {notStarted.length > 0 && (
                    <div className="watchlist-section">
                        <div className="watchlist-section__header">
                            <h3 className="watchlist-section__title">Watchlist (Not Started)</h3>
                        </div>
                        <div className="discover-grid">
                            {notStarted.map((item) => {
                                const isSelected = selectedIds.has(item.id)
                                
                                return (
                                    <div key={item.id} style={{ position: 'relative' }}>
                                        <MediaCard
                                            item={buildTmdbItem(item)}
                                            selected={selectionMode && isSelected}
                                            selectable={selectionMode}
                                            onSelect={() => toggleSelection(item.id)}
                                            isInWatchlist={true}
                                            onAdd={selectionMode ? undefined : () => {}}
                                            onMarkWatched={selectionMode ? undefined : (item.status === 'completed' || item.status === 'caught_up') ? undefined : () => setMarkAllModal(item)}
                                            onMarkUnwatched={selectionMode ? undefined : (item.status === 'completed' || item.status === 'caught_up') ? () => handleMarkUnwatched(item) : undefined}
                                            showIcons={showIcons}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {isInitialized && currentlyWatching.length === 0 && notStarted.length === 0 && paused.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No TV shows or anime in your watchlist. Discover some!
                    </p>
                )}
            </div>

            <button className="upcoming-new-scroll-top" onClick={scrollToTop} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>

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
                    confirmLoading={markingAllWatched}
                />
            )}
        </div>
    )
}

export default TVShows



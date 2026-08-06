import React, { useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { VirtuosoGrid } from 'react-virtuoso'
import { removeAllWatchedEpisodes } from '../services/watchlistService'
import { useMobile } from '../contexts/useMobile'

const Finished: React.FC = () => {
    usePageTitle('Trackist - Finished')
    const { committedQuery } = useSearch()

    // Use global store
    const store = useLibraryStore()
    const finished = store.finished

    const [unwatchModal, setUnwatchModal] = useState<{
        isOpen: boolean
        item: WatchlistItem
        isTV: boolean
    } | null>(null)
    const [unwatchLoading, setUnwatchLoading    ] = useState(false)

    const { isMobile } = useMobile()

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // DEBUG: Log finished items order
    useEffect(() => {
        if (finished.length > 0) {
            console.log('🔍 DEBUG - Finished page order:', finished.map(item => ({
                id: item.id,
                title: item.title,
                media_type: item.media_type,
                completed_at: item.completed_at,
                updated_at: item.updated_at,
                status: item.status
            })).sort((a, b) => new Date(b.completed_at || b.updated_at || 0).getTime() - new Date(a.completed_at || a.updated_at || 0).getTime()))
        }
    }, [finished])
    
    // Filter items based on global search (both movie + tv types)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return finished
        return finished.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [finished, committedQuery])

    const finishedMovies = filteredItems.filter(item => item.media_type === 'movie').sort((a, b) => {
        // Sort by completed_at, falling back to updated_at (most recent first)
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    })
    const finishedTVShows = filteredItems.filter(item => item.media_type === 'tv' || item.media_type === 'anime').sort((a, b) => {
        // Sort by completed_at, falling back to updated_at (most recent first)
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    })

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type === 'anime' ? 'tv' : item.media_type
    })

    const handleUnwatchMovie = async (item: WatchlistItem) => {
        await store.updateStatus(item.id, 'planning')
        // Refresh the store to update the UI
        await store.refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchTVShow = async (item: WatchlistItem) => {
        // Remove all watched episodes AND update status
        await removeAllWatchedEpisodes(item.id)
        // Refresh the store to update the UI
        await store.refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchConfirm = async () => {
        if (!unwatchModal) return
        
        setUnwatchLoading(true)
        try {
            if (unwatchModal.isTV) {
                await handleUnwatchTVShow(unwatchModal.item)
            } else {
                await handleUnwatchMovie(unwatchModal.item)
            }
        } finally {
            setUnwatchLoading(false)
        }
    }

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                {/* Finished TV Shows */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Finished TV Shows</h3>
                    </div>
                    {finishedTVShows.length > 0 ? (
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 2000 : 1000,
                                bottom: isMobile ? 4000 : 2500,
                            }}
                            computeItemKey={(index) => finishedTVShows[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={finishedTVShows}
                            overscan={isMobile ? 2000 : 800}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = finishedTVShows[index]
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
                                        onMarkUnwatched={() => setUnwatchModal({ isOpen: true, item, isTV: true })}
                                    />
                                )
                            }}
                        />
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No finished TV shows yet
                        </p>
                    )}
                </div>

                {/* Finished Movies */}
                <div className="watchlist-section">
                    <div className="watchlist-section__header">
                        <h3 className="watchlist-section__title">Finished Movies</h3>
                    </div>
                    {finishedMovies.length > 0 ? (
                        <VirtuosoGrid
                            increaseViewportBy={{
                                top: isMobile ? 2000 : 1000,
                                bottom: isMobile ? 4000 : 2500,
                            }}
                            computeItemKey={(index) => finishedMovies[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={finishedMovies}
                            overscan={isMobile ? 2000 : 800}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = finishedMovies[index]
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
                                        onMarkUnwatched={() => setUnwatchModal({ isOpen: true, item, isTV: false })}
                                    />
                                )
                            }}
                        />
                    ) : (
                        <p style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.6 }}>
                            No finished movies yet
                        </p>
                    )}
                </div>

                {finished.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No finished movies or TV shows yet. Complete some from your watchlist!
                    </p>
                )}
            </div>

            {unwatchModal && (
                <ConfirmModal
                    isOpen={unwatchModal.isOpen}
                    title={unwatchModal.isTV ? 'Remove All Episodes' : 'Move Back to Watchlist'}
                    message={
                        unwatchModal.isTV
                            ? `Are you sure you want to remove all watched episodes from "${unwatchModal.item.title}" and move it back to your watchlist?`
                            : `Are you sure you want to move "${unwatchModal.item.title}" back to your watchlist?`
                    }
                    onConfirm={handleUnwatchConfirm}
                    onCancel={() => setUnwatchModal(null)}
                    confirmText="Yes, Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                    confirmLoading={unwatchLoading}
                />
            )}
        </div>
    )
}

export default Finished
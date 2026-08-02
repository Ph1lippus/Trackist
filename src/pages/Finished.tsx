import React, { useEffect, useMemo } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { VirtuosoGrid } from 'react-virtuoso'

const Finished: React.FC = () => {
    usePageTitle('Trackist - Finished')
    const { committedQuery } = useSearch()
    
    // Use global store
    const store = useLibraryStore()
    const finished = store.finished

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Filter items based on global search (both movie + tv types)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return finished
        return finished.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [finished, committedQuery])

    const finishedMovies = filteredItems.filter(item => item.media_type === 'movie').sort((a, b) => {
        // Sort by completed_at (most recent first)
        const dateA = new Date(a.completed_at || 0)
        const dateB = new Date(b.completed_at || 0)
        return dateB.getTime() - dateA.getTime()
    })
    const finishedTVShows = filteredItems.filter(item => item.media_type === 'tv' || item.media_type === 'anime').sort((a, b) => {
        // Sort by completed_at (most recent first)
        const dateA = new Date(a.completed_at || 0)
        const dateB = new Date(b.completed_at || 0)
        return dateB.getTime() - dateA.getTime()
    })

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type === 'anime' ? 'tv' : item.media_type
    })

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
                            computeItemKey={(index) => finishedTVShows[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={finishedTVShows}
                            overscan={800}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = finishedTVShows[index]
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
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
                            computeItemKey={(index) => finishedMovies[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            useWindowScroll={true}
                            data={finishedMovies}
                            overscan={800}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = finishedMovies[index]
                                return (
                                    <MediaCard
                                        item={buildTmdbItem(item)}
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
        </div>
    )
}

export default Finished
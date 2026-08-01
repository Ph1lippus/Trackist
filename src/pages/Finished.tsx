import React, { useEffect, useMemo } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import MediaCard from '../components/media/MediaCard'
import type { WatchlistItem, TMDBResult } from '../types'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'

const Finished: React.FC = () => {
    usePageTitle('Trackist - Finished')
    const { clearScrollPosition } = useScrollRestoration()
    const { committedQuery } = useSearch()
    
    // Use global store
    const store = useLibraryStore()
    const finished = store.finished

    // Scroll to top when page loads
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Clear scroll position when navigating to detail page
    useEffect(() => {
        const handleNavigation = () => {
            clearScrollPosition()
        }
        
        window.addEventListener('beforeunload', handleNavigation)
        return () => window.removeEventListener('beforeunload', handleNavigation)
    }, [clearScrollPosition])

    // Filter items based on global search (both movie + tv types)
    const filteredItems = useMemo(() => {
        if (!committedQuery) return finished
        return finished.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [finished, committedQuery])

    const finishedMovies = filteredItems.filter(item => item.media_type === 'movie')
    const finishedTVShows = filteredItems.filter(item => item.media_type === 'tv' || item.media_type === 'anime')

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
                        <div className="discover-grid">
                            {finishedTVShows.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    item={buildTmdbItem(item)}
                                />
                            ))}
                        </div>
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
                        <div className="discover-grid">
                            {finishedMovies.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    item={buildTmdbItem(item)}
                                />
                            ))}
                        </div>
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
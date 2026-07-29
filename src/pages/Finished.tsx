import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import MediaCard from '../components/media/MediaCard'
import type { WatchlistItem, TMDBResult } from '../types'
import { useScrollRestoration } from '../hooks/useScrollRestoration'

const Finished: React.FC = () => {
    const { clearScrollPosition } = useScrollRestoration()
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchActive, setSearchActive] = useState(false)

    useEffect(() => {
        const fetchFinished = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', user.id)
                .in('status', ['completed', 'caught_up'])
                .order('updated_at', { ascending: false })

            if (!error) {
                setItems(data || [])
            }
            setLoading(false)
        }
        fetchFinished()
    }, [])

    // Clear scroll position when navigating to detail page
    useEffect(() => {
        const handleNavigation = () => {
            clearScrollPosition()
        }
        
        window.addEventListener('beforeunload', handleNavigation)
        return () => window.removeEventListener('beforeunload', handleNavigation)
    }, [clearScrollPosition])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setSearchActive(true)
    }

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
        setSearchActive(false)
    }

    const filteredItems = searchActive
        ? items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : items

    const finishedMovies = filteredItems.filter(item => item.media_type === 'movie')
    const finishedTVShows = filteredItems.filter(item => item.media_type === 'tv' || item.media_type === 'anime')

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type === 'anime' ? 'tv' : item.media_type
    })

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
                    <form onSubmit={handleSearch}>
                        <div className="discover-search-box">
                            <svg className="discover-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                className="discover-search"
                                placeholder="Search finished movies and shows..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </form>
                </div>

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
                            {searchQuery ? 'No matching shows' : 'No finished TV shows yet'}
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
                            {searchQuery ? 'No matching movies' : 'No finished movies yet'}
                        </p>
                    )}
                </div>

                {items.length === 0 && !searchQuery && (
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No finished movies or TV shows yet. Complete some from your watchlist!
                    </p>
                )}
            </div>
        </div>
    )
}

export default Finished
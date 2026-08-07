import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSearch } from '../hooks/useSearch'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'

const MobileMovies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const navigate = useNavigate()
    const { committedQuery } = useSearch()
    const movies = useLibraryStore((state) => state.movies)
    const [updatingId, setUpdatingId] = useState<string | null>(null)

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const handleToggleWatched = async (movie: WatchlistItem) => {
        if (!movie.id) return

        setUpdatingId(movie.id)
        try {
            const isCompleted = movie.status === 'completed' || movie.status === 'caught_up'
            const nextStatus = isCompleted ? 'planning' : 'completed'

            await useLibraryStore.getState().updateStatus(movie.id, nextStatus)

            if (!isCompleted && movie.status === 'planning') {
                launchCosmicConfetti()
            }
        } catch (err) {
            console.error('Failed to update movie status:', err)
        } finally {
            setUpdatingId(null)
        }
    }

    const toWatch = useMemo(() => {
        const filtered = committedQuery
            ? movies.filter(m => m.status === 'planning' && m.title.toLowerCase().includes(committedQuery.toLowerCase()))
            : movies.filter(m => m.status === 'planning')
        return filtered.sort((a, b) => {
            const dateA = new Date(a.added_at || 0)
            const dateB = new Date(b.added_at || 0)
            return dateA.getTime() - dateB.getTime()
        })
    }, [movies, committedQuery])

    const watched = useMemo(() => {
        const filtered = committedQuery
            ? movies.filter(m => (m.status === 'completed' || m.status === 'caught_up') && m.title.toLowerCase().includes(committedQuery.toLowerCase()))
            : movies.filter(m => m.status === 'completed' || m.status === 'caught_up')
        return filtered.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })
    }, [movies, committedQuery])

    const renderMovieCard = (movie: WatchlistItem) => {
        const isUpdating = updatingId === movie.id
        const isCompleted = movie.status === 'completed' || movie.status === 'caught_up'

        return (
            <div
                key={movie.id}
                className="mobile-tvshow-card"
                onClick={() => { if (movie.tmdb_id) navigate(`/movie/${movie.tmdb_id}`) }}
            >
                <div className="mobile-tvshow-card-poster">
                    {movie.poster_path ? (
                        <img src={imageUrl(movie.poster_path) || ''} alt={movie.title} loading="lazy" />
                    ) : (
                        <div className="mobile-tvshow-card-no-poster">
                            <span>{movie.title}</span>
                        </div>
                    )}
                </div>
                <div className="mobile-tvshow-card-body">
                    <h3 className="mobile-tvshow-card-title">{movie.title}</h3>
                </div>
                <button
                    className={`mobile-tvshow-card-add-btn ${isCompleted ? 'mobile-tvshow-card-add-btn--done' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation()
                        handleToggleWatched(movie)
                    }}
                    disabled={isUpdating}
                    title={isCompleted ? 'Mark as unwatched' : 'Mark as watched'}
                >
                    <i className={`fa-solid ${isUpdating ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                </button>
            </div>
        )
    }

    return (
        <section className="dashboard-page mobile-tvshows-page">
            <div className="dashboard-shell mobile-tvshows-shell">
                <div className="mobile-page-tabs">
                    <button className="mobile-page-tab active">Mobile</button>
                    <button className="mobile-page-tab" onClick={() => navigate('/Movies')}>Normal</button>
                </div>

                {toWatch.length === 0 && watched.length === 0 ? (
                    <div className="mobile-tvshows-empty">
                        <i className="fa-solid fa-film"></i>
                        <h3>No movies yet</h3>
                        <p>Add movies to your watchlist to see them here</p>
                    </div>
                ) : (
                    <div className="mobile-tvshows-list">
                        {toWatch.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">To Watch</h2>
                                <div className="mobile-tvshows-cards">
                                    {toWatch.map(movie => renderMovieCard(movie))}
                                </div>
                            </div>
                        )}

                        {watched.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">Watched</h2>
                                <div className="mobile-tvshows-cards">
                                    {watched.map(movie => renderMovieCard(movie))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    )
}

export default MobileMovies

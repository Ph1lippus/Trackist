import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'

const MobileMovies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const navigate = useNavigate()
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
        return movies
            .filter(movie => movie.status === 'planning')
            .sort((a, b) => {
                const dateA = new Date(a.added_at || 0)
                const dateB = new Date(b.added_at || 0)
                return dateA.getTime() - dateB.getTime()
            })
    }, [movies])

    const watched = useMemo(() => {
        return movies
            .filter(movie => movie.status === 'completed' || movie.status === 'caught_up')
            .sort((a, b) => {
                const dateA = new Date(a.updated_at || 0)
                const dateB = new Date(b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })
    }, [movies])

    const renderMovieCard = (movie: WatchlistItem) => {
        const isUpdating = updatingId === movie.id
        const isCompleted = movie.status === 'completed' || movie.status === 'caught_up'

        return (
            <div
                key={movie.id}
                className="mobile-movie-card"
                onClick={() => { if (movie.tmdb_id) navigate(`/movie/${movie.tmdb_id}`) }}
            >
                <div className="mobile-movie-card-poster">
                    {movie.poster_path ? (
                        <img src={imageUrl(movie.poster_path) || ''} alt={movie.title} loading="lazy" />
                    ) : (
                        <div className="mobile-movie-card-no-poster">
                            <span>{movie.title}</span>
                        </div>
                    )}
                </div>
                <div className="mobile-movie-card-body">
                    <h3 className="mobile-movie-card-title">{movie.title}</h3>
                </div>
                <button
                    className={`mobile-movie-card-add-btn ${isCompleted ? 'mobile-movie-card-add-btn--done' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation()
                        handleToggleWatched(movie)
                    }}
                    disabled={isUpdating}
                    title={isCompleted ? 'Mark as unwatched' : 'Mark as watched'}
                >
                    <i className={`fa-solid ${isUpdating ? 'fa-spinner fa-spin' : isCompleted ? 'fa-check' : 'fa-check'}`}></i>
                </button>
            </div>
        )
    }

    return (
        <section className="dashboard-page mobile-movies-page">
            <div className="dashboard-shell mobile-movies-shell">
                {toWatch.length === 0 && watched.length === 0 ? (
                    <div className="mobile-movies-empty">
                        <i className="fa-solid fa-film"></i>
                        <h3>No movies yet</h3>
                        <p>Add movies to your watchlist to see them here</p>
                    </div>
                ) : (
                    <div className="mobile-movies-list">
                        {toWatch.length > 0 && (
                            <div className="mobile-movies-section">
                                <h2 className="mobile-movies-section-title">To Watch</h2>
                                <div className="mobile-movies-cards">
                                    {toWatch.map(movie => renderMovieCard(movie))}
                                </div>
                            </div>
                        )}

                        {watched.length > 0 && (
                            <div className="mobile-movies-section">
                                <h2 className="mobile-movies-section-title">Watched</h2>
                                <div className="mobile-movies-cards">
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

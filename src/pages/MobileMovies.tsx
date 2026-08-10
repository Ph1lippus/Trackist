import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSearch } from '../hooks/useSearch'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import ConfirmModal from '../components/modals/ConfirmModal'

const MobileMovies: React.FC = () => {
    usePageTitle('Trackist - Movies')
    const navigate = useNavigate()
    const { inputValue, setInputValue, commitQuery, clear, committedQuery } = useSearch()
    const movies = useLibraryStore((state) => state.movies)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch'
        item: WatchlistItem
    } | null>(null)

    const handleSwitchToNormal = () => {
        navigate('/movies')
    }

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const handleToggleWatched = async (movie: WatchlistItem) => {
        if (!movie.id) return

        const isCompleted = movie.status === 'completed' || movie.status === 'caught_up'
        const nextStatus = isCompleted ? 'planning' : 'completed'

        if (!isCompleted) {
            setConfirmModal({ isOpen: true, action: 'watch', item: movie })
            return
        }

        setUpdatingId(movie.id)
        try {
            await useLibraryStore.getState().updateStatus(movie.id, nextStatus)
        } catch (err) {
            console.error('Failed to update movie status:', err)
        } finally {
            setUpdatingId(null)
        }
    }

    const handleConfirmAction = async () => {
        if (!confirmModal) return

        setUpdatingId(confirmModal.item.id)
        try {
            await useLibraryStore.getState().updateStatus(confirmModal.item.id, 'completed')
            launchCosmicConfetti()
        } catch (err) {
            console.error('Failed to update movie status:', err)
        } finally {
            setUpdatingId(null)
            setConfirmModal(null)
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
                        if (isCompleted) {
                            handleToggleWatched(movie)
                        } else {
                            setConfirmModal({ isOpen: true, action: 'watch', item: movie })
                        }
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
            <button
                className="mobile-view-toggle-fixed"
                onClick={handleSwitchToNormal}
                title="Switch to Normal View"
            >
                <i className="fa-solid fa-desktop"></i>
            </button>
            <div className="mobile-page-search">
                <form onSubmit={(e) => { e.preventDefault(); commitQuery(); }}>
                    <input
                        type="text"
                        className="mobile-page-search-input"
                        placeholder="Search movies..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                    />
                    {inputValue && (
                        <button type="button" className="mobile-page-search-clear" onClick={clear} aria-label="Clear search">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    )}
                </form>
            </div>
            <div className="dashboard-shell mobile-tvshows-shell">
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

            <button className="upcoming-new-scroll-top" onClick={scrollToTop} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>

            <ConfirmModal
                isOpen={Boolean(confirmModal?.isOpen && confirmModal.action === 'watch')}
                title="Mark as Watched"
                message={`Are you sure you want to mark "${confirmModal?.item.title}" as watched?`}
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmModal(null)}
                confirmText="Confirm"
                confirmColor="success"
            />
        </section>
    )
}

export default MobileMovies

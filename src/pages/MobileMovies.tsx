import React, { useMemo, useState, useCallback } from 'react'
import { imageUrl } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMobile } from '../contexts/useMobile'
import { useSearch } from '../hooks/useSearch'
import { useMissingPosters } from '../hooks/useMissingPosters'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import ConfirmModal from '../components/modals/ConfirmModal'
import ViewToggleButton from '../components/layout/ViewToggleButton'
import useDetailModalStore from '../stores/detailModalStore'

const MobileMovies: React.FC = () => {
    const { isMobile } = useMobile()
    usePageTitle('Track1st - Movies')
    const { committedQuery } = useSearch()
    const movies = useLibraryStore((state) => state.movies)
    const missingPosters = useMissingPosters(movies)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'watch' | 'unwatch'
        item: WatchlistItem
    } | null>(null)

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    

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

    const renderMovieCard = useCallback((movie: WatchlistItem) => {
        const isUpdating = updatingId === movie.id
        const isCompleted = movie.status === 'completed' || movie.status === 'caught_up'
        const posterPath = movie.poster_path || (movie.tmdb_id ? (missingPosters[movie.tmdb_id] || null) : null)

        return (
            <div
                key={movie.id}
                className="mobile-tvshow-card"
                onClick={() => { if (movie.tmdb_id) useDetailModalStore.getState().open('movie', movie.tmdb_id) }}
            >
                <div className="mobile-tvshow-card-poster">
                    {posterPath ? (
                        <img src={imageUrl(posterPath, isMobile ? 'w342' : 'w342') || ''} alt={movie.title} loading="lazy" />
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
    }, [updatingId, confirmModal, handleToggleWatched, handleConfirmAction, isMobile, missingPosters])

    return (
        <section className="dashboard-page mobile-tvshows-page">
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
                                <div className="mobile-tvshows-section-header">
                                    <h2 className="mobile-tvshows-section-title">To Watch</h2>
                                    <ViewToggleButton />
                                </div>
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





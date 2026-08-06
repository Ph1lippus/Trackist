import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMovieDetails, imageUrlOriginal, getFanartImages, getBestBackdropPath } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { supabase } from '../services/supabaseClient'
import { invalidateUserCache } from '../services/cacheService'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { createMovieDeepLink, openInStremio, createStremioWebUrl } from '../utils/stremioUtils'

const MovieDetail: React.FC = () => {
    usePageTitle('Trackist - Movie Detail')
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [fanartImages, setFanartImages] = useState<{ hdmovielogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [watchlistStatus, setWatchlistStatus] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [showTrailer, setShowTrailer] = useState(false)
    const [trailerKey, setTrailerKey] = useState<string | null>(null)
    const [showCast, setShowCast] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean } | null>(null)
    const [markWatchedModal, setMarkWatchedModal] = useState<{ isOpen: boolean; markAsWatched: boolean } | null>(null)
    const [modalLoading, setModalLoading] = useState(false)

    // Use global store
    const libraryStore = useLibraryStore()

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [id])

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return
            setLoading(true)
            try {
                const [data, fanart] = await Promise.all([
                    getMovieDetails(Number(id)),
                    getFanartImages(Number(id), 'movies')
                ])
                setDetails(data)
                setFanartImages(fanart)

                // Find trailer from videos
                if (data.videos?.results) {
                    const trailer = data.videos.results.find(
                        (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
                    )
                    if (trailer) setTrailerKey(trailer.key)
                }

                // Check if in watchlist using global store
                const watchlistItem = useLibraryStore.getState().allItems.find(item => item.tmdb_id === Number(id))
                setIsInWatchlist(!!watchlistItem)
                if (watchlistItem) {
                    setWatchlistId(watchlistItem.id)
                    setWatchlistStatus(watchlistItem.status)
                } else {
                    setWatchlistId(null)
                    setWatchlistStatus(null)
                }
            } catch (err) {
                console.error('Failed to load movie details:', err)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [id])

    const formatRuntime = (minutes?: number): string => {
        if (!minutes) return ''
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours > 0) {
            return `${hours}h ${mins}m`
        }
        return `${mins}m`
    }

    const getAgeRating = (): string => {
        if (!details?.release_dates?.results) return ''
        const usRelease = details.release_dates.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US')
        if (usRelease?.release_dates?.[0]?.certification) {
            return usRelease.release_dates[0].certification
        }
        return ''
    }

    const getAgeRatingTooltip = (): string => {
        const rating = getAgeRating()
        const tooltips: Record<string, string> = {
            'G': 'General Audiences - All ages admitted',
            'PG': 'Parental Guidance Suggested - Some material may not be suitable for children',
            'PG-13': 'Parents Strongly Cautioned - Some material may be inappropriate for children under 13',
            'R': 'Restricted - Under 17 requires accompanying parent or adult guardian',
            'NC-17': 'Adults Only - No one 17 and under admitted',
            'NR': 'Not Rated - Film has not been rated by the MPAA',
            'UR': 'Unrated - Film has not been rated',
            'TV-Y': 'All Children - Suitable for all children',
            'TV-Y7': 'Directed to Older Children - Suitable for children age 7 and up',
            'TV-G': 'General Audience - Suitable for all ages',
            'TV-PG': 'Parental Guidance Suggested - Some material may not be suitable for children',
            'TV-14': 'Parents Strongly Cautioned - Some material may not be suitable for children under 14',
            'TV-MA': 'Mature Audience Only - Specifically designed for adults',
        }
        return tooltips[rating] || rating
    }

    const getLogoUrl = (): string | null => {
        if (details?.images?.logos) {
            const logos = details.images.logos as Array<{ file_path: string; iso_639_1?: string | null }>
            const englishLogo = logos.find(
                (logo) => logo.iso_639_1 === 'en'
            )
            if (englishLogo) {
                return imageUrlOriginal(englishLogo.file_path)
            }
            const noLanguageLogo = logos.find(
                (logo) => logo.iso_639_1 === null || logo.iso_639_1 === ''
            )
            if (noLanguageLogo) {
                return imageUrlOriginal(noLanguageLogo.file_path)
            }
            if (logos.length > 0) {
                return imageUrlOriginal(logos[0].file_path)
            }
        }
        if (fanartImages?.hdmovielogo?.[0]?.url) {
            return fanartImages.hdmovielogo[0].url
        }
    
        return null
    } 

    const handleAddToWatchlist = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !details) {
            alert('Please log in')
            return null
        }

        setAdding(true)

        const newItem: WatchlistItem = {
            id: crypto.randomUUID(),
            user_id: user.id,
            media_type: 'movie',
            tmdb_id: details.id,
            title: details.title || '',
            poster_path: details.poster_path || undefined,
            overview: details.overview,
            release_date: details.release_date,
            vote_average: details.vote_average,
            status: 'planning',
            added_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }

        // Optimistic update via store
        await libraryStore.addItem(newItem)
        
        setIsInWatchlist(true)
        setWatchlistId(newItem.id)
        setWatchlistStatus('planning')
        setAdding(false)
        return newItem.id
    }

    const handleRemoveFromWatchlist = async () => {
        if (!watchlistId) return

        setModalLoading(true)
        try {
            // Optimistic update via store
            await libraryStore.removeItem(watchlistId)
            
            // Invalidate cache to ensure Finished page shows updated data immediately
            await invalidateUserCache()
            
            setIsInWatchlist(false)
            setWatchlistId(null)
            setWatchlistStatus(null)
            setConfirmModal(null)
        } finally {
            setModalLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="detail-page">
                <div className="detail-page__content">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading movie details...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!details) {
        return <div className="detail-page-error">Movie not found</div>
    }

    const backdropUrl = imageUrlOriginal(getBestBackdropPath(details.images?.backdrops) ?? details.backdrop_path ?? null)    
    const logoUrl = getLogoUrl()
    const title = details.title || 'Untitled'
    const year = details.release_date?.slice(0, 4) || ''
    const rating = details.vote_average?.toFixed(1)
    const runtime = formatRuntime(details.runtime)
    const ageRating = getAgeRating()
    const overview = details.overview || 'No description available.'
    const genres = details.genres || []
    const cast = (details.credits?.cast || [])
        .slice(0, 10)
        .sort((a: { profile_path?: string | null }, b: { profile_path?: string | null }) => {
            if (a.profile_path && !b.profile_path) return -1
            if (!a.profile_path && b.profile_path) return 1
            return 0
        })
    return (
        <div className="detail-page detail-page--no-scroll">
            {backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}
            
            <div className="detail-page__content detail-page__content--split">
                <div className="detail-page__main detail-page__main--movie">
                    <div className="detail-page__left">
                        <div className="detail-page__title-section">
                        <div className="detail-page__logo-section">
                            {logoUrl ? (
                                <img src={logoUrl} alt={title} className="detail-page__logo" />
                            ) : (
                                <h1 className="detail-page__title">{title}</h1>
                            )}
                        </div>
                        
                        <div className="detail-page__meta">
                            
                            {year && <span className="detail-page__year">{year}</span>}
                            {runtime && <span className="detail-page__runtime">{runtime}</span>}
                            {rating !== undefined && rating !== null && (
                                <span className="detail-page__rating" aria-label={`Rating: ${rating} out of 10`}>
                                    <span aria-hidden="true">★</span> {rating}
                                </span>
                            )}

                            {ageRating && (
                                <span className="detail-page__age-rating" data-tooltip={getAgeRatingTooltip()}>
                                    {ageRating}
                                </span>
                            )}
                        </div>

                        


                        {genres.length > 0 && (
                            <div className="detail-page__genres">
                                {genres.map((g: { id: number; name: string }) => (
                                    <span key={g.id} className="detail-page__genre">{g.name}</span>
                                ))}
                            </div>
                        )}
                        
                    </div>

                    <div className="detail-page__overview-section">
                        <h2 className="detail-page__section-title">Overview</h2>
                        <p className="detail-page__overview">{overview}</p>
                        
                        <div className="detail-page__actions">
                            {trailerKey && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => setShowTrailer(!showTrailer)}
                                    title={showTrailer ? 'Close Trailer' : 'Watch Trailer'}
                                >
                                    <i className="fa-solid fa-clapperboard"></i>
                                </button>
                            )}
                            {cast.length > 0 && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => setShowCast(!showCast)}
                                    title={showCast ? 'Hide Cast' : 'Cast'}
                                >
                                    <i className="fa-solid fa-users"></i>
                                </button>
                            )}
                            <button 
                                className="detail-page__icon-btn"
                                onClick={() => {
                                    const deepLink = createMovieDeepLink(details.id)
                                    const webUrl = createStremioWebUrl('movie', details.id)
                                    openInStremio(deepLink, webUrl)
                                }}
                                title="Open in Stremio"
                            >
                                <i className="fa-solid fa-play"></i>
                            </button>
                            {!isInWatchlist ? (
                                <>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={handleAddToWatchlist}
                                        disabled={adding}
                                        title="Add to Watchlist"
                                    >
                                        <i className="fa-regular fa-bookmark"></i>
                                    </button>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={async () => {
                                            setIsUpdatingStatus(true)
                                            const newWatchlistId = await handleAddToWatchlist()
                                            if (newWatchlistId) {
                                                // Capture previous status from store
                                                const previousStatus = useLibraryStore.getState().allItems.find(item => item.id === newWatchlistId)?.status
                                                // Update status to completed via store
                                                await libraryStore.updateStatus(newWatchlistId, 'completed')
                                                setWatchlistStatus('completed')
                                                // Trigger Cosmic Confetti when transitioning from 'planning' to 'completed'
                                                if (previousStatus === 'planning') {
                                                    launchCosmicConfetti()
                                                    // Invalidate cache to ensure Finished page shows updated data immediately
                                                    await invalidateUserCache()
                                                }
                                            }
                                            setIsUpdatingStatus(false)
                                        }}
                                        disabled={adding || isUpdatingStatus}
                                        title="Mark as Watched"
                                    >
                                        <i className="fa-solid fa-eye"></i>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setConfirmModal({ isOpen: true })}
                                        title="Remove from Watchlist"
                                    >
                                        <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                                    </button>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => {
                                            if (!watchlistId) return
                                            const markAsWatched = watchlistStatus !== 'completed'
                                            setMarkWatchedModal({ isOpen: true, markAsWatched })
                                        }}
                                        disabled={isUpdatingStatus}
                                        title={watchlistStatus === 'completed' ? 'Mark as Unwatched' : 'Mark as Watched'}
                                    >
                                        <i className={watchlistStatus === 'completed' ? 'fa-solid fa-eye-slash' :'fa-solid fa-eye'}></i>
                                    </button>
                                </>
                            )}
                        </div>

                        {showTrailer && trailerKey && (
                            <div className="detail-page__trailer-overlay" onClick={() => setShowTrailer(false)}>
                                <div className="detail-page__trailer-modal" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        className="detail-page__trailer-close"
                                        onClick={() => setShowTrailer(false)}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                    <iframe
                                        src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&vq=hd1080`}
                                        title="Trailer"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        className="detail-page__trailer-iframe"
                                    />
                                </div>
                            </div>
                        )}

                    </div>

                    {showCast && cast.length > 0 && (
                        <div className="detail-page__cast-section">
                            {showCast && (
                                <div className="detail-page__cast-list">
                                    {cast.map((c: { id: number; name: string; profile_path?: string; character?: string }) => (
                                        <div 
                                            key={c.id} 
                                            className="detail-page__cast-item"
                                            onClick={() => navigate(`/person/${c.id}`)}
                                        >
                                            <div className="detail-page__cast-info">
                                                <span className="detail-page__cast-name">{c.name}</span>
                                                {c.character && (
                                                    <span className="detail-page__cast-character">{c.character}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    </div>
                    <div className="detail-page__right" style={{ display: 'none' }}>
                    </div>
                </div>
            </div>

            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title="Remove from Watchlist"
                    message="Are you sure you want to remove this movie from your watchlist?"
                    onConfirm={handleRemoveFromWatchlist}
                    onCancel={() => setConfirmModal(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                    confirmLoading={modalLoading}
                />
            )}
            {markWatchedModal && (
                <ConfirmModal
                    isOpen={markWatchedModal.isOpen}
                    title={markWatchedModal.markAsWatched ? 'Mark as Watched' : 'Mark as Unwatched'}
                    message={markWatchedModal.markAsWatched ? 'Are you sure you want to mark this movie as watched?' : 'Are you sure you want to mark this movie as unwatched?'}
                    onConfirm={async () => {
                        if (!watchlistId) return
                        setModalLoading(true)
                        try {
                            const newStatus = markWatchedModal.markAsWatched ? 'completed' : 'planning'
                            const previousStatus = watchlistStatus
                            await libraryStore.updateStatus(watchlistId, newStatus)
                            setWatchlistStatus(newStatus)
                            // Trigger Cosmic Confetti when transitioning from 'planning' to 'completed'
                            if (markWatchedModal.markAsWatched && previousStatus === 'planning') {
                                launchCosmicConfetti()
                                // Invalidate cache to ensure Finished page shows updated data immediately
                                await invalidateUserCache()
                            }
                            setMarkWatchedModal(null)
                        } finally {
                            setModalLoading(false)
                        }
                    }}
                    onCancel={() => setMarkWatchedModal(null)}
                    confirmText={markWatchedModal.markAsWatched ? 'Mark as Watched' : 'Mark as Unwatched'}
                    cancelText="Cancel"
                    confirmColor="primary"
                    confirmLoading={modalLoading}
                />
            )}
        </div>
    )
}

export default MovieDetail
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getMovieDetails, imageUrlOriginal, getBestBackdropPath, getBestPoster, isNoLanguageCode } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { invalidateUserCache, getCachedOrFetch } from '../services/cacheService'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { createMovieDeepLink, openInStremio } from '../utils/stremioUtils'
import { curateCast } from '../utils/castUtils'
import { useShowStremioButton } from '../hooks/useShowStremioButton'
import { useShowLetterboxButton } from '../hooks/useShowLetterboxButton'
import { useShowTmdbButton } from '../hooks/useShowTmdbButton'
import { useMobile } from '../contexts/useMobile'
import { useAuthStore } from '../stores/useAuthStore'
import stremioIcon from '../assets/stremio-logo-icon-only-fullcolor.svg'
import letterboxdIcon from '../assets/letterboxd-decal-dots-pos-rgb-500px.png'
import tmdbLogo from '../assets/CompactTMDB.svg'
import ShareButton from '../components/media/ShareButton'
import CastList from '../components/CastList'
import { useDetailSidebar } from '../hooks/useDetailSidebar'
import useDetailModalStore from '../stores/detailModalStore'
import { AlignLeft, Bookmark, Clapperboard, Eye, EyeOff, Users, X } from 'lucide-react'

interface MovieDetailProps {
    itemId?: number
}

const MovieDetail: React.FC<MovieDetailProps> = ({ itemId: propId }) => {
    const { id: paramId } = useParams<{ id: string }>()
    const id = propId?.toString() ?? paramId
    const isInModal = useDetailModalStore((s) => s.isOpen)
    const { showStremioButton, loading: stremioLoading } = useShowStremioButton()
    const { showLetterboxButton, loading: letterboxLoading } = useShowLetterboxButton()
    const { showTmdbButton, loading: tmdbLoading } = useShowTmdbButton()
    const { isMobile } = useMobile()
    const { isOpen: isSidebarOpen } = useDetailSidebar()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const movieTitle = details?.title || details?.name
    usePageTitle(movieTitle ? `${movieTitle} - Track1st` : 'Track1st - Movie Detail')
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [showTrailer, setShowTrailer] = useState(false)
    const [trailerKey, setTrailerKey] = useState<string | null>(null)
    const [showCast, setShowCast] = useState(false)
    const [showDescription, setShowDescription] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean } | null>(null)
    const [markWatchedModal, setMarkWatchedModal] = useState<{ isOpen: boolean; markAsWatched: boolean } | null>(null)
    const [modalLoading, setModalLoading] = useState(false)

    const watchlistItem = useLibraryStore((state) => state.allItems.find((item) => item.tmdb_id === Number(id)))
    const isInWatchlist = !!watchlistItem
    const watchlistId = watchlistItem?.id ?? null
    const watchlistStatus = watchlistItem?.status ?? null

    const openExternal = (url: string) => {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    

    const fetchDetails = useCallback(async () => {
        setLoading(true)
        setError(null)
        if (!id) {
            setLoading(false)
            return
        }
        try {
            const data = await getCachedOrFetch(
                'movie-details-v3',
                Number(id),
                () => getMovieDetails(Number(id)),
                { ttl: 30 * 60 * 1000, staleWhileRevalidate: true }
            )
            setDetails(data)
            
            // Find trailer from videos
            const videos = (data.videos?.results || []).filter((v: { type?: string; site?: string; key?: string }) => v && typeof v === 'object')
            const trailer = videos.find(
                (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
            )
            if (trailer) setTrailerKey(trailer.key)
        } catch (err) {
            console.error('Failed to load movie details:', err)
            setError('Failed to load movie details. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        void fetchDetails()
    }, [fetchDetails])

    // Push backdrop URL to the overlay store when in modal so it renders outside the scroll container
    useEffect(() => {
        if (!isInModal || !details) return
        const heroPoster = isMobile ? getBestPoster(details?.images?.posters) : null
        const url = heroPoster
            ? imageUrlOriginal(heroPoster)
            : imageUrlOriginal(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null)
        useDetailModalStore.getState().setBackdropUrl(url)
        return () => { useDetailModalStore.getState().setBackdropUrl(null) }
    }, [isInModal, details, isMobile])

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
            const logos = details.images.logos as Array<{ file_path: string; width?: number; height?: number; vote_average?: number; vote_count?: number; iso_639_1?: string | null }>
            const sorted = [...logos].sort((a, b) => {
                const aRes = (a.width ?? 0) * (a.height ?? 0)
                const bRes = (b.width ?? 0) * (b.height ?? 0)
                if (bRes !== aRes) return bRes - aRes
                const aVote = a.vote_average ?? 0
                const bVote = b.vote_average ?? 0
                if (bVote !== aVote) return bVote - aVote
                const aCount = a.vote_count ?? 0
                const bCount = b.vote_count ?? 0
                if (bCount !== aCount) return bCount - aCount
                return 0
            })
            const english = sorted.find(l => l.iso_639_1 === 'en')
            if (english) return imageUrlOriginal(english.file_path)
            const noLang = sorted.find(l => isNoLanguageCode(l.iso_639_1))
            if (noLang) return imageUrlOriginal(noLang.file_path)
            if (sorted[0]) return imageUrlOriginal(sorted[0].file_path)
            return null
        }
        return null
    }

    const handleAddToWatchlist = async () => {
        const user = useAuthStore.getState().user
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
        await useLibraryStore.getState().addItem(newItem)
        
        setAdding(false)
        return newItem.id
    }

    const handleRemoveFromWatchlist = async () => {
        if (!watchlistId) return

        setModalLoading(true)
        try {
            // Optimistic update via store
            await useLibraryStore.getState().removeItem(watchlistId)
            
            // Invalidate cache to ensure Finished page shows updated data immediately
            await invalidateUserCache()
            
            setConfirmModal(null)
        } finally {
            setModalLoading(false)
        }
    }

    const cast = useMemo(() => curateCast(
        (details?.credits?.cast || []) as Array<{ id: number; name: string; profile_path?: string | null; character?: string | null; order?: number }>
    ), [details?.credits?.cast])

    if (loading) {
        return <div className="detail-page-loading" aria-live="polite">Loading movie...</div>
    }

    if (error && !details) {
        return (
            <div className="detail-page-error" role="alert">
                <div className="error-boundary__card">
                    <p>{error}</p>
                    <button className="detail-page__retry-btn" onClick={() => void fetchDetails()}>
                        Try again
                    </button>
                </div>
            </div>
        )
    }

    if (!details) {
        return <div className="detail-page-error">Movie not found</div>
    }

    const heroPoster = isMobile ? getBestPoster(details?.images?.posters) : null
    const backdropUrl = heroPoster
        ? imageUrlOriginal(heroPoster)
        : imageUrlOriginal(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null)    
    const logoUrl = getLogoUrl()
    const title = details?.title || ''
    const year = details?.release_date?.slice(0, 4) || ''
    const movieVoteAverage = details?.vote_average
    const hasRating = typeof movieVoteAverage === 'number' && movieVoteAverage > 0
    const rating = hasRating ? movieVoteAverage.toFixed(1) : null
    const runtime = formatRuntime(details?.runtime)
    const ageRating = getAgeRating()
    const overview = details?.overview || 'No description available.'
    const genres = details?.genres || []
    const shareUrl = window.location.href
    return (
        <div className="detail-page detail-page--no-scroll">
            {!isInModal && backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} loading="lazy" />
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
                            {rating && (
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
                        {(!isMobile || showDescription) && <>
                            <h2 className="detail-page__section-title">Description</h2>
                            <p className="detail-page__overview">{overview}</p>
                        </>}
                        
                        <div className="detail-page__actions">
                            {!isInWatchlist ? (
                                <>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={handleAddToWatchlist}
                                        disabled={adding}
                                        title="Add to Watchlist"
                                    >
                                        <Bookmark size={18} color="#fff" />
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
                                                await useLibraryStore.getState().updateStatus(newWatchlistId, 'completed')
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
                                        <Eye size={18} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setConfirmModal({ isOpen: true })}
                                        title="Remove from Watchlist"
                                    >
                                        <Bookmark size={18} color="#68ffae" fill="#68ffae" />
                                    </button>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => {
                                            if (!watchlistId) return
                                            const markAsWatched = watchlistStatus !== 'completed' && watchlistStatus !== 'caught_up'
                                            setMarkWatchedModal({ isOpen: true, markAsWatched })
                                        }}
                                        disabled={isUpdatingStatus}
                                        title={(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? 'Mark as Unwatched' : 'Mark as Watched'}
                                    >
                                        {(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </>
                            )}
                            {trailerKey && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => {
                                        if (isMobile) {
                                            window.open(`https://www.youtube.com/watch?v=${trailerKey}`, '_blank')
                                        } else {
                                            setShowTrailer(!showTrailer)
                                        }
                                    }}
                                    title={showTrailer && !isMobile ? 'Close Trailer' : 'Watch Trailer'}
                                >
                                    <Clapperboard size={18} />
                                </button>
                            )}
                            {cast.length > 0 && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => setShowCast(!showCast)}
                                    title={showCast ? 'Hide Cast' : 'Cast'}
                                >
                                    <Users size={18} />
                                </button>
                            )}
                            <ShareButton
                                url={shareUrl}
                                title={`${title} on Track1st`}
                                text={`I found ${title} on Track1st. Add it to your watchlist and see if it belongs in your next movie night.`}
                            />
                            <div className="detail-page__actions-spacer" />
                            {showStremioButton && !stremioLoading && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => {
                                        if (!details) return
                                        const sharingLink = createMovieDeepLink(details.id, (details.external_ids as { imdb_id?: string })?.imdb_id)
                                        openInStremio(sharingLink)
                                    }}
                                    title="Open in Stremio"
                                >
                                    <img src={stremioIcon} alt="Stremio" className="detail-page__stremio-logo" />
                                </button>
                            )}
                            {showLetterboxButton && !letterboxLoading && (
                                <button 
                                    className="detail-page__icon-btn detail-page__icon-btn--letterbox"
                                    onClick={() => {
                                        if (!details) return
                                        const imdbId = details.external_ids?.imdb_id
                                        if (imdbId) {
                                            openExternal(`https://letterboxd.com/imdb/${imdbId}/`)
                                        } else {
                                            const title = details.title || ''
                                            const slug = title
                                                .toLowerCase()
                                                .replace(/[^a-z0-9]+/g, '-')
                                                .replace(/^-+|-+$/g, '')
                                            openExternal(`https://letterboxd.com/film/${slug}/`)
                                        }
                                    }}
                                    title="Open in Letterbox"
                                >
                                    <img src={letterboxdIcon} alt="Letterboxd" className="detail-page__letterbox-logo" />
                                </button>
                            )}
                            {showTmdbButton && !tmdbLoading && (
                                <button 
                                    className="detail-page__icon-btn detail-page__icon-btn--tmdb"
                                    onClick={() => {
                                        if (!details) return
                                        openExternal(`https://www.themoviedb.org/movie/${details.id}`)
                                    }}
                                    title="Open on TMDB"
                                >
                                    <img src={tmdbLogo} alt="TMDB" className="detail-page__tmdb-logo" />
                                </button>
                            )}
                        </div>

                        {/* Mobile fixed action container */}
                        <div className={`detail-page__actions-mobile${isSidebarOpen ? ' detail-page__actions-mobile--open' : ''}`}>
                            <button className="detail-page__icon-btn" onClick={() => setShowDescription(!showDescription)} title={showDescription ? 'Hide Description' : 'Show Description'} aria-label={showDescription ? 'Hide Description' : 'Show Description'}>
                                <AlignLeft size={18} />
                            </button>
                            <ShareButton
                                url={shareUrl}
                                title={`${title} on Track1st`}
                                text={`I found ${title} on Track1st. Add it to your watchlist and see if it belongs in your next movie night.`}
                            />
                            {showStremioButton && !stremioLoading && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => {
                                        if (!details) return
                                        const sharingLink = createMovieDeepLink(details.id, (details.external_ids as { imdb_id?: string })?.imdb_id)
                                        openInStremio(sharingLink)
                                    }}
                                    title="Open in Stremio"
                                >
                                    <img src={stremioIcon} alt="Stremio" className="detail-page__stremio-logo" />
                                </button>
                            )}
                            {showLetterboxButton && !letterboxLoading && (
                                <button 
                                    className="detail-page__icon-btn detail-page__icon-btn--letterbox"
                                    onClick={() => {
                                        if (!details) return
                                        const imdbId = details.external_ids?.imdb_id
                                        if (imdbId) {
                                            openExternal(`https://letterboxd.com/imdb/${imdbId}/`)
                                        } else {
                                            const title = details.title || ''
                                            const slug = title
                                                .toLowerCase()
                                                .replace(/[^a-z0-9]+/g, '-')
                                                .replace(/^-+|-+$/g, '')
                                            openExternal(`https://letterboxd.com/film/${slug}/`)
                                        }
                                    }}
                                    title="Open in Letterbox"
                                >
                                    <img src={letterboxdIcon} alt="Letterboxd" className="detail-page__letterbox-logo" />
                                </button>
                            )}
                            {cast.length > 0 && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => setShowCast(!showCast)}
                                    title={showCast ? 'Hide Cast' : 'Cast'}
                                >
                                    <Users size={18} />
                                </button>
                            )}
                            {trailerKey && (
                                <button 
                                    className="detail-page__icon-btn"
                                    onClick={() => {
                                        if (isMobile) {
                                            window.open(`https://www.youtube.com/watch?v=${trailerKey}`, '_blank')
                                        } else {
                                            setShowTrailer(!showTrailer)
                                        }
                                    }}
                                    title={showTrailer && !isMobile ? 'Close Trailer' : 'Watch Trailer'}
                                >
                                    <Clapperboard size={18} />
                                </button>
                            )}
                            {!isInWatchlist ? (
                                <>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={async () => {
                                            setIsUpdatingStatus(true)
                                            const newWatchlistId = await handleAddToWatchlist()
                                            if (newWatchlistId) {
                                                // Capture previous status from store
                                                const previousStatus = useLibraryStore.getState().allItems.find(item => item.id === newWatchlistId)?.status
                                                // Update status to completed via store
                                                await useLibraryStore.getState().updateStatus(newWatchlistId, 'completed')
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
                                        <Eye size={18} />
                                    </button>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={handleAddToWatchlist}
                                        disabled={adding}
                                        title="Add to Watchlist"
                                    >
                                        <Bookmark size={18} color="#fff" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => {
                                            if (!watchlistId) return
                                            const markAsWatched = watchlistStatus !== 'completed' && watchlistStatus !== 'caught_up'
                                            setMarkWatchedModal({ isOpen: true, markAsWatched })
                                        }}
                                        disabled={isUpdatingStatus}
                                        title={(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? 'Mark as Unwatched' : 'Mark as Watched'}
                                    >
                                        {(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setConfirmModal({ isOpen: true })}
                                        title="Remove from Watchlist"
                                    >
                                        <Bookmark size={18} color="#68ffae" fill="#68ffae" />
                                    </button>
                                </>
                            )}
                        </div>

                        {!isMobile && showTrailer && trailerKey && (
                            <div className="detail-page__trailer-overlay" onClick={() => setShowTrailer(false)}>
                                <div className="detail-page__trailer-modal" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        className="detail-page__trailer-close"
                                        onClick={() => setShowTrailer(false)}
                                    >
                                        <X size={18} />
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

                    </div>
                    {showCast && cast.length > 0 && (
                        <div className="detail-page__episodes-container">
                            <CastList cast={cast} isInModal={isInModal} maxItems={isMobile ? 8 : 16} />
                        </div>
                    )}
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
                            await useLibraryStore.getState().updateStatus(watchlistId, newStatus)
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

export default React.memo(MovieDetail)

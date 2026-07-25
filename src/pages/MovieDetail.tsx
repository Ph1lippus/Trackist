import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getMovieDetails, imageUrl, imageUrlOriginal, getFanartImages } from '../services/tmdbService'
import type { TMDBResult } from '../types'

const MovieDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [fanartImages, setFanartImages] = useState<{ hdmovielogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [adding, setAdding] = useState(false)
    const [showTrailer, setShowTrailer] = useState(false)
    const [trailerKey, setTrailerKey] = useState<string | null>(null)

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return
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

                // Check if in watchlist
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: watchlistData } = await supabase
                        .from('watchlist')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('tmdb_id', Number(id))
                        .single()
                    setIsInWatchlist(!!watchlistData)
                }
            } catch (err) {
                console.error('Failed to load movie details:', err)
            }
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

    const getLogoUrl = (): string | null => {
        // Try TMDB logos first
        if (details?.images?.logos?.[0]?.file_path) {
            return imageUrlOriginal(details.images.logos[0].file_path)
        }
        // Try Fanart logos
        if (fanartImages?.hdmovielogo?.[0]?.url) {
            return fanartImages.hdmovielogo[0].url
        }
        return null
    }

    const getProviders = () => {
        const watchProviders = details?.['watch/providers']
        if (!watchProviders || !Array.isArray(watchProviders.results)) return []
        const usProviders = watchProviders.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US')
        if (!usProviders) return []
        const providers = []
        if (usProviders.flatrate) providers.push(...usProviders.flatrate)
        if (usProviders.buy) providers.push(...usProviders.buy)
        if (usProviders.rent) providers.push(...usProviders.rent)
        return providers.slice(0, 5)
    }

    const handleAddToWatchlist = async (status: string) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !details) {
            alert('Please log in')
            return
        }

        setAdding(true)
        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: 'movie',
            tmdb_id: details.id,
            title: details.title || '',
            poster_path: details.poster_path,
            overview: details.overview,
            release_date: details.release_date,
            vote_average: details.vote_average,
            status
        })

        if (error) {
            alert('Error: ' + error.message)
        } else {
            setIsInWatchlist(true)
        }
        setAdding(false)
    }

    if (!details) {
        return <div className="detail-page-error">Movie not found</div>
    }

    const backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null
    const logoUrl = getLogoUrl()
    const title = details.title || 'Untitled'
    const year = details.release_date?.slice(0, 4) || ''
    const rating = details.vote_average?.toFixed(1)
    const runtime = formatRuntime(details.runtime)
    const ageRating = getAgeRating()
    const overview = details.overview || 'No description available.'
    const genres = details.genres || []
    const cast = details.credits?.cast?.slice(0, 10) || []
    const providers = getProviders()

    return (
        <div className="detail-page">
            {backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}
            
            <div className="detail-page__content">
                <button className="detail-page__back" onClick={() => navigate(-1)}>
                    ← Back
                </button>

                <div className="detail-page__header">
                    <div className="detail-page__logo-section">
                        {logoUrl ? (
                            <img src={logoUrl} alt={title} className="detail-page__logo" />
                        ) : (
                            <h1 className="detail-page__title">{title}</h1>
                        )}
                    </div>
                    
                    <div className="detail-page__meta">
                        {year && <span className="detail-page__year">{year}</span>}
                        {rating && <span className="detail-page__rating">★ {rating}</span>}
                        {runtime && <span className="detail-page__runtime">{runtime}</span>}
                        {ageRating && <span className="detail-page__age-rating">{ageRating}</span>}
                    </div>

                    {providers.length > 0 && (
                        <div className="detail-page__providers">
                            {providers.map((p: { logo_path: string }, idx: number) => (
                                <img
                                    key={idx}
                                    src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                                    alt="Provider"
                                    className="detail-page__provider-logo"
                                />
                            ))}
                        </div>
                    )}

                    {genres.length > 0 && (
                        <div className="detail-page__genres">
                            {genres.map((g: { id: number; name: string }) => (
                                <span key={g.id} className="detail-page__genre">{g.name}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="detail-page__main">
                    <div className="detail-page__overview-section">
                        <h2 className="detail-page__section-title">Overview</h2>
                        <p className="detail-page__overview">{overview}</p>
                        
                        <div className="detail-page__actions">
                            {trailerKey && (
                                <button 
                                    className="detail-page__btn detail-page__btn--trailer"
                                    onClick={() => setShowTrailer(!showTrailer)}
                                >
                                    {showTrailer ? 'Close Trailer' : 'Watch Trailer'}
                                </button>
                            )}
                            {!isInWatchlist ? (
                                <>
                                    <button 
                                        className="detail-page__btn detail-page__btn--watch"
                                        onClick={() => handleAddToWatchlist('watching')}
                                        disabled={adding}
                                    >
                                        {adding ? 'Adding...' : 'Add to Watchlist'}
                                    </button>
                                    <button 
                                        className="detail-page__btn detail-page__btn--watched"
                                        onClick={() => handleAddToWatchlist('completed')}
                                        disabled={adding}
                                    >
                                        Mark as Watched
                                    </button>
                                </>
                            ) : (
                                <div className="detail-page__in-watchlist">✓ In your watchlist</div>
                            )}
                        </div>

                        {showTrailer && trailerKey && (
                            <div className="detail-page__trailer-container">
                                <iframe
                                    src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                                    title="Trailer"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="detail-page__trailer-iframe"
                                />
                            </div>
                        )}
                    </div>

                    {cast.length > 0 && (
                        <div className="detail-page__cast-section">
                            <h2 className="detail-page__section-title">Cast</h2>
                            <div className="detail-page__cast-list">
                                {cast.map((c: { id: number; name: string; profile_path?: string; character?: string }) => (
                                    <div 
                                        key={c.id} 
                                        className="detail-page__cast-item"
                                        onClick={() => navigate(`/person/${c.id}`)}
                                    >
                                        {c.profile_path && (
                                            <img 
                                                src={imageUrl(c.profile_path) || ''} 
                                                alt={c.name} 
                                                className="detail-page__cast-photo"
                                            />
                                        )}
                                        <div className="detail-page__cast-info">
                                            <span className="detail-page__cast-name">{c.name}</span>
                                            {c.character && (
                                                <span className="detail-page__cast-character">{c.character}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MovieDetail

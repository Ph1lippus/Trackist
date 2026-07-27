import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, imageUrl, imageUrlOriginal, getFanartImages } from '../services/tmdbService'
import type { TMDBResult, WatchlistEpisode } from '../types'

const TVShowDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [fanartImages, setFanartImages] = useState<{ hdtvlogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return
            try {
                const [data, fanart] = await Promise.all([
                    getTVDetails(Number(id)),
                    getFanartImages(Number(id), 'tv')
                ])
                setDetails(data)
                setFanartImages(fanart)

                // Check if in watchlist
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: watchlistData } = await supabase
                        .from('watchlist')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('tmdb_id', Number(id))
                        .single()
                    if (watchlistData) {
                        setIsInWatchlist(true)
                        setWatchlistId(watchlistData.id)
                    }
                }
            } catch (err) {
                console.error('Failed to load TV show details:', err)
            }
        }
        fetchDetails()
    }, [id])

    const handleAddToWatchlist = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !details) {
            alert('Please log in')
            return
        }

        setAdding(true)
        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: 'tv',
            tmdb_id: details.id,
            title: details.name || '',
            poster_path: details.poster_path,
            overview: details.overview,
            release_date: details.first_air_date,
            vote_average: details.vote_average
        })

        if (error) {
            alert('Error: ' + error.message)
        } else if (data) {
            setIsInWatchlist(true)
            setWatchlistId(data.id)
        }
        setAdding(false)
    }

    const getLogoUrl = (): string | null => {
        if (details?.images?.logos) {
            const englishLogo = details.images.logos.find(
                (logo: any) => logo.iso_639_1 === 'en'
            )
            if (englishLogo) {
                return imageUrlOriginal(englishLogo.file_path)
            }
            const noLanguageLogo = details.images.logos.find(
                (logo: any) => logo.iso_639_1 === null || logo.iso_639_1 === ''
            )
            if (noLanguageLogo) {
                return imageUrlOriginal(noLanguageLogo.file_path)
            }
            if (details.images.logos.length > 0) {
                return imageUrlOriginal(details.images.logos[0].file_path)
            }
        }
        if (fanartImages?.hdtvlogo?.[0]?.url) {
            return fanartImages.hdtvlogo[0].url
        }

        return null
    }  

    const getAgeRating = (): string => {
        if (!details?.content_ratings?.results) return ''
        const usRating = details.content_ratings.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US')
        if (usRating?.rating) {
            return usRating.rating
        }
        return ''
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

    if (!details) {
        return <div className="detail-page-error">TV Show not found</div>
    }

    const backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null
    const logoUrl = getLogoUrl()
    const title = details.name || 'Untitled'
    const year = details.first_air_date?.slice(0, 4) || ''
    const rating = details.vote_average?.toFixed(1)
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
                        {details.number_of_seasons && <span className="detail-page__seasons">{details.number_of_seasons} Seasons</span>}
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

                <div className="detail-page__main detail-page__main--tv">
                    <div className="detail-page__left">
                        <div className="detail-page__overview-section">
                            <h2 className="detail-page__section-title">Overview</h2>
                            <p className="detail-page__overview">{overview}</p>
                            
                            <div className="detail-page__actions">
                                {!isInWatchlist ? (
                                    <>
                                        <button 
                                            className="detail-page__btn detail-page__btn--watch"
                                            onClick={handleAddToWatchlist}
                                            disabled={adding}
                                        >
                                            {adding ? 'Adding...' : 'Add to Watchlist'}
                                        </button>
                                    </>
                                ) : (
                                    <div className="detail-page__in-watchlist">✓ In your watchlist</div>
                                )}
                            </div>

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

                    <div className="detail-page__right">
                        <div className="detail-page__episodes-section">
                            <h2 className="detail-page__section-title">Episodes</h2>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TVShowDetail

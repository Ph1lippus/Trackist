import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails, imageUrl, imageUrlOriginal, getFanartImages } from '../services/tmdbService'
import type { TMDBResult, WatchlistEpisode } from '../types'

const TVShowDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [fanartImages, setFanartImages] = useState<{ hdtvlogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<WatchlistEpisode[]>([])
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [showTrailer, setShowTrailer] = useState(false)
    const [trailerKey, setTrailerKey] = useState<string | null>(null)
    const hasUserSelectedSeason = useRef(false)

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
                
                if (data.seasons?.[0]) {
                    setSelectedSeason(data.seasons[0].season_number)
                }

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

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!details || !id) return
            
            try {
                const seasonList = (details.seasons || [])
                    .filter((s: { season_number: number }) => s.season_number > 0)
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

                let watchedEpisodes: WatchlistEpisode[] = []
                if (isInWatchlist && watchlistId) {
                    const { data: we } = await supabase
                        .from('watchlist_episodes')
                        .select('*')
                        .eq('watchlist_id', watchlistId)
                        .eq('watched', true)
                    watchedEpisodes = we || []
                }

                const allEpisodes: WatchlistEpisode[] = []
                for (const season of seasonList) {
                    const sData = await getTVSeasonDetails(Number(id), season)
                    const sEpisodes = sData.episodes || []
                    for (const ep of sEpisodes) {
                        const watched = watchedEpisodes?.find(we =>
                            we.season_number === season && we.episode_number === ep.episode_number
                        )
                        allEpisodes.push({
                            id: `${id}-${season}-${ep.episode_number}`,
                            watchlist_id: watchlistId || '',
                            season_number: season,
                            episode_number: ep.episode_number,
                            title: ep.name,
                            still_path: ep.still_path,
                            overview: ep.overview,
                            vote_average: ep.vote_average,
                            air_date: ep.air_date,
                            runtime: ep.runtime,
                            watched: !!watched,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                    }
                }
                setEpisodes(allEpisodes)
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
        }
        loadEpisodes()
    }, [details, id, isInWatchlist, watchlistId])

    const handleAddToWatchlist = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !details) {
            alert('Please log in')
            return
        }

        setAdding(true)
        const { data, error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: 'tv',
            tmdb_id: details.id,
            title: details.name || '',
            poster_path: details.poster_path,
            overview: details.overview,
            release_date: details.first_air_date,
            vote_average: details.vote_average,
            status: 'watching'
        }).select().single()

        if (error) {
            alert('Error: ' + error.message)
        } else if (data) {
            setIsInWatchlist(true)
            setWatchlistId(data.id)
        }
        setAdding(false)
    }

    const handleSeasonChange = (season: number) => {
        hasUserSelectedSeason.current = true
        setSelectedSeason(season)
    }

    const isEpisodeReleased = (episode: WatchlistEpisode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
    }

    const getLogoUrl = (): string | null => {
        // Try TMDB logos first
        if (details?.images?.logos?.[0]?.file_path) {
            return imageUrlOriginal(details.images.logos[0].file_path)
        }
        // Try Fanart logos
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

    const filteredEpisodes = episodes.filter(ep => ep.season_number === selectedSeason)

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
                                            onClick={handleAddToWatchlist}
                                            disabled={adding}
                                        >
                                            {adding ? 'Adding...' : 'Add to Watchlist'}
                                        </button>
                                        <button 
                                            className="detail-page__btn detail-page__btn--watched"
                                            onClick={() => {
                                                handleAddToWatchlist().then(() => {
                                                    if (watchlistId) {
                                                        supabase.from('watchlist').update({
                                                            status: 'completed',
                                                            completed_at: new Date().toISOString()
                                                        }).eq('id', watchlistId)
                                                    }
                                                })
                                            }}
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

                    <div className="detail-page__right">
                        <div className="detail-page__episodes-section">
                            <div className="detail-page__episodes-header">
                                <h2 className="detail-page__section-title">Episodes</h2>
                                {seasons.length > 1 && (
                                    <select 
                                        className="detail-page__season-select"
                                        value={selectedSeason}
                                        onChange={(e) => handleSeasonChange(Number(e.target.value))}
                                    >
                                        {seasons.map(s => (
                                            <option key={s} value={s}>Season {s}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            
                            <div className="detail-page__episode-list">
                                {filteredEpisodes.map((ep) => (
                                    <div 
                                        key={ep.id} 
                                        className={`detail-page__episode-card ${ep.watched ? 'watched' : ''} ${!isEpisodeReleased(ep) ? 'unreleased' : ''}`}
                                    >
                                        {ep.still_path && (
                                            <div className="detail-page__episode-still">
                                                <img src={imageUrl(ep.still_path) || ''} alt={ep.title || `Episode ${ep.episode_number}`} />
                                            </div>
                                        )}
                                        <div className="detail-page__episode-info">
                                            <div className="detail-page__episode-number">
                                                <div className={`detail-page__episode-check ${ep.watched ? 'checked' : ''}`}>
                                                    {ep.watched && <span>✓</span>}
                                                </div>
                                                <span>Episode {ep.episode_number}</span>
                                            </div>
                                            <div className="detail-page__episode-details">
                                                <strong>{ep.title || `Episode ${ep.episode_number}`}</strong>
                                                {ep.overview && <p>{ep.overview.slice(0, 120)}...</p>}
                                                <div className="detail-page__episode-meta">
                                                    {ep.air_date && <span>{ep.air_date}</span>}
                                                    {ep.runtime && <span>{ep.runtime} min</span>}
                                                    {isEpisodeReleased(ep) && ep.vote_average && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TVShowDetail

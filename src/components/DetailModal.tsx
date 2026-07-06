import React, { useEffect, useState } from 'react'
import { getMovieDetails, getTVDetails, getTVSeasonDetails, imageUrl } from '../services/tmdbService'
import { getAnilistImageUrl } from '../services/anilistService'
import type { TMDBResult, AnilistResult } from '../types'

interface DetailModalProps {
    item: TMDBResult | AnilistResult
    onClose: () => void
    onAdd: (item: TMDBResult | AnilistResult, status: string) => void
    isInWatchlist: boolean
}

interface Season {
    season_number: number
    episode_count?: number
}

interface Episode {
    id: string
    episode_number: number
    name?: string
    runtime?: number
    vote_average?: number
}

const DetailModal: React.FC<DetailModalProps> = ({ item, onClose, onAdd, isInWatchlist }) => {
    const [details, setDetails] = useState<TMDBResult | AnilistResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [seasonEpisodes, setSeasonEpisodes] = useState<Episode[]>([])

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true)
            try {
                if ('media_type' in item && item.media_type === 'anime') {
                    const animeItem = item as AnilistResult
                    setDetails({
                        ...animeItem,
                        overview: animeItem.description?.replace(/<[^>]*>/g, '') || '',
                        vote_average: animeItem.averageScore ? animeItem.averageScore / 10 : null,
                        release_date: animeItem.startDate?.year ? `${animeItem.startDate.year}` : null,
                        genres: animeItem.genres || []
                    } as TMDBResult | AnilistResult)
                } else if ('media_type' in item && item.media_type === 'movie') {
                    const data = await getMovieDetails(item.id)
                    setDetails(data)
                } else if ('media_type' in item && item.media_type === 'tv') {
                    const data = await getTVDetails(item.id)
                    setDetails(data)
                    if (data.seasons?.[0]) {
                        setSelectedSeason(data.seasons[0].season_number)
                    }
                } else {
                    setDetails(item)
                }
            } catch (err) {
                console.error('Failed to load details:', err)
                setDetails(item)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [item])

    useEffect(() => {
        if (!details || !('media_type' in item) || item.media_type !== 'tv') return
        const fetchEpisodes = async () => {
            try {
                const data = await getTVSeasonDetails(item.id, selectedSeason)
                setSeasonEpisodes((data.episodes || []) as Episode[])
            } catch {
                setSeasonEpisodes([])
            }
        }
        fetchEpisodes()
    }, [details, selectedSeason, item.id, item.media_type])

    const handleAdd = async (status: string) => {
        setAdding(true)
        await onAdd(item, status)
        setAdding(false)
    }

    const isAnime = 'media_type' in item && item.media_type === 'anime'
    const posterUrl = isAnime
        ? getAnilistImageUrl(item.poster_path ?? null)
        : imageUrl(item.poster_path ?? null)

    function getItemTitle(item: TMDBResult | AnilistResult, isAnime: boolean): string {
        if (isAnime && item.title && typeof item.title === 'object') {
            const animeTitle = item.title as { english: string | null; romaji: string }
            return animeTitle.english || animeTitle.romaji || 'Untitled'
        }
        const tmdbItem = item as TMDBResult
        return tmdbItem.title || tmdbItem.name || 'Untitled'
    }
    const title: string = getItemTitle(item, isAnime)
    const tmdbItem = item as TMDBResult
    const year = item.release_date?.slice(0, 4) || ('first_air_date' in item ? tmdbItem.first_air_date?.slice(0, 4) : undefined) || item.release_date || ''
    const rating = details?.vote_average?.toFixed(1) || item.vote_average?.toFixed(1)
    const overview = details?.overview || item.overview || 'No description available.'
    const genres = details?.genres || []
    const cast = details?.credits?.cast?.slice(0, 10) || details?.aggregate_credits?.cast?.slice(0, 10) || []
    const runtime = details?.runtime
    const totalEpisodes = details?.episodes || item.episodes || details?.number_of_episodes || 0
    const totalSeasons = details?.seasons?.length || details?.number_of_seasons || 0
    const mediaStatus = details?.status || item.status
    const seasons = details?.seasons || []

    const isTV = 'media_type' in item && (item.media_type === 'tv' || item.media_type === 'anime')

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                {loading ? (
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading details...</p></div>
                ) : (
                    <div className="modal-layout">
                        <div className="modal-poster">
                            {posterUrl ? (
                                <img src={posterUrl} alt={title} />
                            ) : (
                                <div className="discover-card__no-poster" style={{ height: '100%', minHeight: '300px' }}>
                                    <span>{title}</span>
                                </div>
                            )}
                        </div>

                        <div className="modal-info">
                            <h2 className="modal-title">{title}</h2>
                            <div className="modal-meta">
                                {year && <span>{year}</span>}
                                {rating && <span className="modal-rating">★ {rating}</span>}
                                {runtime && <span>{runtime} min</span>}
                                {totalEpisodes && <span>{totalEpisodes} episodes</span>}
                                {totalSeasons > 0 && <span>{totalSeasons} seasons</span>}
                                {mediaStatus && <span>{mediaStatus}</span>}
                            </div>

                            {genres.length > 0 && (
                                <div className="modal-genres">
                                    {genres.map((g: { id: number; name: string } | string) => (
                                        <span key={typeof g === 'object' ? g.id : g} className="modal-genre-tag">{typeof g === 'object' ? g.name : g}</span>
                                    ))}
                                </div>
                            )}

                            <p className="modal-overview">{overview}</p>

                            {cast.length > 0 && (
                                <div className="modal-cast">
                                    <h4>Cast</h4>
                                    <div className="modal-cast-list">
                                        {cast.map((c: { id: number; name: string; profile_path?: string }) => (
                                            <span key={c.id || c.name} className="modal-cast-item">
                                                {c.profile_path && (
                                                    <img src={imageUrl(c.profile_path) || ''} alt={c.name} />
                                                )}
                                                <span>{c.name}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Episodes for TV/Anime */}
                            {isTV && seasons.length > 0 && (
                                <div className="modal-episodes">
                                    <h4>Episodes</h4>
                                    <div className="modal-season-tabs">
                                        {seasons.filter((s: Season) => s.season_number > 0).map((s: Season) => (
                                            <button
                                                key={s.season_number}
                                                className={`modal-season-tab ${selectedSeason === s.season_number ? 'active' : ''}`}
                                                onClick={() => setSelectedSeason(s.season_number)}
                                            >
                                                S{s.season_number}
                                            </button>
                                        ))}
                                    </div>
                                    {'media_type' in item && item.media_type === 'tv' && seasonEpisodes.length > 0 && (
                                        <div className="modal-episode-list">
                                            {seasonEpisodes.map((ep: Episode) => (
                                                <div key={ep.id} className="modal-episode-item">
                                                    <div className="modal-episode-num">{ep.episode_number}</div>
                                                    <div className="modal-episode-info">
                                                        <strong>{ep.name}</strong>
                                                        {ep.runtime && <span> · {ep.runtime}min</span>}
                                                        {ep.vote_average && <span> · ★ {ep.vote_average.toFixed(1)}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {isAnime && (
                                        <div className="modal-episode-list">
                                            {Array.from({ length: Math.min(totalEpisodes || 0, 24) }, (_, i) => i + 1).map(ep => (
                                                <div key={ep} className="modal-episode-item">
                                                    <div className="modal-episode-num">{ep}</div>
                                                    <div className="modal-episode-info">
                                                        <strong>Episode {ep}</strong>
                                                    </div>
                                                </div>
                                            ))}
                                            {(totalEpisodes || 0) > 24 && (
                                                <p style={{ textAlign: 'center', opacity: 0.5, padding: '0.5rem', fontSize: '0.8rem' }}>
                                                    + {totalEpisodes - 24} more episodes
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!isInWatchlist && (
                                <div className="modal-actions">
                                    <button className="modal-btn modal-btn--plan" onClick={() => handleAdd('planning')} disabled={adding}>
                                        {adding ? 'Adding...' : 'Plan to Watch'}
                                    </button>
                                    <button className="modal-btn modal-btn--watch" onClick={() => handleAdd('watching')} disabled={adding}>
                                        Watching
                                    </button>
                                    {'media_type' in item && item.media_type === 'movie' && (
                                        <button className="modal-btn modal-btn--done" onClick={() => handleAdd('completed')} disabled={adding}>
                                            Watched
                                        </button>
                                    )}
                                </div>
                            )}
                            {isInWatchlist && (
                                <div className="modal-in-watchlist">✓ Already in your watchlist</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default DetailModal
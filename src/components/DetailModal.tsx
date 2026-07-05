import React, { useEffect, useState } from 'react'
import { getMovieDetails, getTVDetails, imageUrl } from '../services/tmdbService'
import { getAnilistImageUrl } from '../services/anilistService'

type ResultItem = any

interface DetailModalProps {
    item: ResultItem
    onClose: () => void
    onAdd: (item: ResultItem, status: string) => void
    isInWatchlist: boolean
}

const DetailModal: React.FC<DetailModalProps> = ({ item, onClose, onAdd, isInWatchlist }) => {
    const [details, setDetails] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true)
            try {
                if (item.media_type === 'anime') {
                    setDetails({
                        overview: item.overview,
                        vote_average: item.vote_average,
                        release_date: item.release_date,
                        episodes: item.episodes,
                        status: item.status,
                        genres: item.genres || []
                    })
                } else if (item.media_type === 'movie') {
                    const data = await getMovieDetails(item.id)
                    setDetails(data)
                } else if (item.media_type === 'tv') {
                    const data = await getTVDetails(item.id)
                    setDetails(data)
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

    const handleAdd = async (status: string) => {
        setAdding(true)
        await onAdd(item, status)
        setAdding(false)
    }

    const posterUrl = item.media_type === 'anime'
        ? getAnilistImageUrl(item.poster_path ?? null)
        : imageUrl(item.poster_path ?? null)

    const title = item.title || item.name || 'Untitled'
    const year = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || item.release_date || ''
    const rating = details?.vote_average?.toFixed(1) || item.vote_average?.toFixed(1)
    const overview = details?.overview || item.overview || 'No description available.'
    const genres = details?.genres || []
    const cast = details?.credits?.cast?.slice(0, 8) || []
    const runtime = details?.runtime
    const episodes = details?.episodes || item.episodes
    const mediaStatus = details?.status || item.status

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
                                {episodes && <span>{episodes} episodes</span>}
                                {mediaStatus && <span>{mediaStatus}</span>}
                            </div>

                            {genres.length > 0 && (
                                <div className="modal-genres">
                                    {genres.map((g: any) => (
                                        <span key={g.id || g} className="modal-genre-tag">{g.name || g}</span>
                                    ))}
                                </div>
                            )}

                            <p className="modal-overview">{overview}</p>

                            {cast.length > 0 && (
                                <div className="modal-cast">
                                    <h4>Cast</h4>
                                    <div className="modal-cast-list">
                                        {cast.map((c: any) => (
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

                            {!isInWatchlist && (
                                <div className="modal-actions">
                                    <button className="modal-btn modal-btn--plan" onClick={() => handleAdd('planning')} disabled={adding}>
                                        {adding ? 'Adding...' : 'Plan to Watch'}
                                    </button>
                                    <button className="modal-btn modal-btn--watch" onClick={() => handleAdd('watching')} disabled={adding}>
                                        Watching
                                    </button>
                                    <button className="modal-btn modal-btn--done" onClick={() => handleAdd('completed')} disabled={adding}>
                                        Watched
                                    </button>
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
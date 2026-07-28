import React from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../../services/tmdbService'
import type { TMDBResult } from '../../types'

type ResultItem = TMDBResult

interface MediaCardProps {
    item: ResultItem
    isInWatchlist?: boolean
    compact?: boolean
    onAdd?: (item: ResultItem) => void
    onMarkWatched?: (item: ResultItem) => void
    onMarkUnwatched?: (item: ResultItem) => void
    onAddToList?: (item: ResultItem) => void
}

const MediaCard: React.FC<MediaCardProps> = ({ 
    item, 
    isInWatchlist = false, 
    compact = false, 
    onAdd, 
    onMarkWatched, 
    onMarkUnwatched,
    onAddToList
}) => {
    const navigate = useNavigate()
    const isPerson = item.media_type === 'person'
    const imgUrl = isPerson 
        ? imageUrl(item.profile_path ?? null)
        : imageUrl(item.poster_path ?? null)

    const handleClick = () => {
        if (item.media_type === 'person') {
            navigate(`/person/${item.id}`)
        } else if (item.media_type === 'tv') {
            navigate(`/tv/${item.id}`)
        } else {
            navigate(`/movie/${item.id}`)
        }
    }

    const getItemTitle = (): string => {
        const tmdbItem = item as TMDBResult
        return tmdbItem.title || tmdbItem.name || 'Untitled'
    }

    const getDisplayType = (): string => {
        if (item.media_type === 'anime') return 'Anime'
        if (item.media_type === 'movie') return 'Movie'
        if (item.media_type === 'person') return 'Person'
        return 'TV Show'
    }

    const displayTitle = getItemTitle()

    return (
        <article className="media-card" key={`${item.media_type}-${item.id}`}>
            <div className="media-card__poster" onClick={handleClick}>
                {imgUrl ? (
                    <img src={imgUrl} alt={displayTitle} loading="lazy" />
                ) : (
                    <div className="media-card__no-poster">
                        <span>{displayTitle}</span>
                    </div>
                )}
                {!compact && onAdd && (
                    <button
                        className="media-card__icon-btn"
                        onClick={(e) => { e.stopPropagation(); onAdd(item); }}
                        title={isInWatchlist ? (isPerson ? "Following" : "In watchlist") : (isPerson ? "Follow" : "Add to watchlist")}
                    >
                        {isInWatchlist ? (
                            <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                        ) : (
                            <i className="fa-regular fa-bookmark"></i>
                        )}
                    </button>
                )}
                {!compact && onAddToList && !isPerson && (
                    <button
                        className="media-card__list-icon"
                        onClick={(e) => { e.stopPropagation(); onAddToList(item); }}
                        title="Add to list"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                            <path d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                )}
                {!compact && !isPerson && isInWatchlist && onMarkWatched && !onMarkUnwatched && (
                    <button
                        className="media-card__icon-btn media-card__icon-btn--second"
                        onClick={(e) => {
                            e.stopPropagation()
                            onMarkWatched(item)
                        }}
                        title="Mark as watched"
                    >
                        <i className="fa-solid fa-eye"></i>
                    </button>
                )}
                {!compact && !isPerson && isInWatchlist && onMarkUnwatched && (
                    <button
                        className="media-card__icon-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            onMarkUnwatched(item)
                        }}
                        title="Mark as unwatched"
                    >
                        <i className="fa-solid fa-eye-slash"></i>
                    </button>
                )}
                {!compact && !isPerson && isInWatchlist && !onMarkWatched && !onMarkUnwatched && (
                    <div className="media-card__icon-btn" title="In watchlist">
                        <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                    </div>
                )}
            </div>
            <div className="media-card__body">
                <h3 onClick={handleClick}>{displayTitle}</h3>
                <span className="media-card__type">{getDisplayType()}</span>
            </div>
        </article>
    )
}

export default MediaCard

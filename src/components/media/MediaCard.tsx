import React from 'react'
import { imageUrl } from '../../services/tmdbService'
import type { TMDBResult } from '../../types'

type ResultItem = TMDBResult

interface MediaCardProps {
    item: ResultItem
    isInWatchlist?: boolean
    compact?: boolean
    onDetail: (item: ResultItem) => void
    onAdd?: (item: ResultItem) => void
    onMarkWatched?: (item: ResultItem) => void
    onMarkUnwatched?: (item: ResultItem) => void
}

const MediaCard: React.FC<MediaCardProps> = ({ 
    item, 
    isInWatchlist = false, 
    compact = false, 
    onDetail, 
    onAdd, 
    onMarkWatched, 
    onMarkUnwatched 
}) => {
    const isPerson = item.media_type === 'person'
    const imgUrl = isPerson 
        ? imageUrl(item.profile_path ?? null)
        : imageUrl(item.poster_path ?? null)

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
            <div className="media-card__poster" onClick={() => onDetail(item)}>
                {imgUrl ? (
                    <img src={imgUrl} alt={displayTitle} loading="lazy" />
                ) : (
                    <div className="media-card__no-poster">
                        <span>{displayTitle}</span>
                    </div>
                )}
                {!compact && item.vote_average && (
                    <div className="media-card__rating">{item.vote_average.toFixed(1)}</div>
                )}
                {!compact && !isPerson && !isInWatchlist && onAdd && (
                    <button
                        className="media-card__add-icon"
                        onClick={(e) => { e.stopPropagation(); onAdd(item); }}
                        title="Add to watchlist"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    </button>
                )}
                {!compact && !isPerson && isInWatchlist && onMarkWatched && (
                    <button
                        className="media-card__check-icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onMarkWatched(item)
                        }}
                        title="Mark as watched"
                        style={{ cursor: 'pointer' }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="#68ffae" strokeWidth="2.5" width="16" height="16">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                    </button>
                )}
                {!compact && !isPerson && isInWatchlist && onMarkUnwatched && (
                    <button
                        className="media-card__unwatch-icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onMarkUnwatched(item)
                        }}
                        title="Move back to watchlist"
                        style={{ cursor: 'pointer' }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2.5" width="16" height="16">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                    </button>
                )}
                {!compact && !isPerson && isInWatchlist && !onMarkWatched && !onMarkUnwatched && (
                    <div className="media-card__check-icon" title="In watchlist">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#68ffae" strokeWidth="2.5" width="16" height="16">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                    </div>
                )}
            </div>
            <div className="media-card__body">
                <h3 onClick={() => onDetail(item)}>{displayTitle}</h3>
                <span className="media-card__type">{getDisplayType()}</span>
            </div>
        </article>
    )
}

export default MediaCard

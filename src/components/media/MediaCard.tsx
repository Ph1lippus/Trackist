import React, { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../../services/tmdbService'
import type { TMDBResult } from '../../types'

type ResultItem = TMDBResult

export interface MediaCardProps {
    item: ResultItem
    isInWatchlist?: boolean
    compact?: boolean
    onAdd?: (item: ResultItem) => void
    onMarkWatched?: (item: ResultItem) => void
    onMarkUnwatched?: (item: ResultItem) => void
    onAddToList?: (item: ResultItem) => void
    onDelete?: (item: ResultItem) => void
    listMode?: boolean
    episodesLeft?: number
}

/**
 * Stable, memoized media card.
 *
 * - Wrapped in React.memo so it only re-renders when its props change.
 * - All internal callbacks are stable (useCallback) so parent re-renders
 *   do not force child re-renders.
 * - Image space is reserved via aspect-ratio so there is zero layout shift
 *   when the poster loads.
 */
const MediaCard: React.FC<MediaCardProps> = ({
    item,
    isInWatchlist = false,
    compact = false,
    onAdd,
    onMarkWatched,
    onMarkUnwatched,
    onAddToList,
    onDelete,
    listMode = false,
    episodesLeft,
}) => {
    const navigate = useNavigate()
    const isPerson = item.media_type === 'person'

    const imgUrl = useMemo(
        () => (isPerson ? imageUrl(item.profile_path ?? null) : imageUrl(item.poster_path ?? null)),
        [isPerson, item.profile_path, item.poster_path],
    )

    const displayTitle = useMemo(
        () => item.title || item.name || 'Untitled',
        [item.title, item.name],
    )


    const handleClick = useCallback(() => {
        if (item.media_type === 'person') {
            navigate(`/person/${item.id}`)
        } else if (item.media_type === 'tv') {
            navigate(`/tv/${item.id}`)
        } else {
            navigate(`/movie/${item.id}`)
        }
    }, [item.media_type, item.id, navigate])

    const handleAddClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onAdd?.(item)
        },
        [onAdd, item],
    )

    const handleAddToListClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onAddToList?.(item)
        },
        [onAddToList, item],
    )

    const handleMarkWatchedClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onMarkWatched?.(item)
        },
        [onMarkWatched, item],
    )

    const handleMarkUnwatchedClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onMarkUnwatched?.(item)
        },
        [onMarkUnwatched, item],
    )

    const handleDeleteClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onDelete?.(item)
        },
        [onDelete, item],
    )

    const showAddButton = !compact && onAdd && !(isInWatchlist && (onMarkWatched || onMarkUnwatched)) && !listMode
    const showAddToListButton = !compact && onAddToList && !isPerson && !listMode
    const showMarkWatched = !compact && !isPerson && listMode && onMarkWatched && !onMarkUnwatched
    const showMarkUnwatched = !compact && !isPerson && listMode && onMarkUnwatched && !onMarkWatched
    const showDeleteButton = !compact && onDelete && !isPerson && listMode
    const showInWatchlistIndicator =
        !compact && !isPerson && isInWatchlist && !onMarkWatched && !onMarkUnwatched && !onAdd && !onDelete && !listMode && !onAddToList

    return (
        <article className="media-card">
            <div className="media-card__poster" onClick={handleClick}>
                {imgUrl && <img src={imgUrl} alt={displayTitle} loading="lazy" />}
                {!imgUrl && (
                    <div className="media-card__no-poster">
                        <span>{displayTitle}</span>
                    </div>
                )}
                {episodesLeft !== undefined && episodesLeft > 0 && (
                    <span className="media-card__episodes-left">{episodesLeft} left</span>
                )}
                {showAddButton && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleAddClick}
                        title={isInWatchlist ? (isPerson ? 'Following' : 'In watchlist') : (isPerson ? 'Follow' : 'Add to watchlist')}
                    >
                        {isInWatchlist ? (
                            <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                        ) : (
                            <i className="fa-regular fa-bookmark"></i>
                        )}
                    </button>
                )}
                {showAddToListButton && (
                    <button
                        className="media-card__list-icon"
                        onClick={handleAddToListClick}
                        title="Add to list"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                            <path d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                )}
                {showMarkWatched && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleMarkWatchedClick}
                        title="Mark as watched"
                    >
                        <i className="fa-solid fa-eye"></i>
                    </button>
                )}
                {showMarkUnwatched && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleMarkUnwatchedClick}
                        title="Mark as unwatched"
                    >
                        <i className="fa-solid fa-eye-slash"></i>
                    </button>
                )}
                {showDeleteButton && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleDeleteClick}
                        title="Remove from list"
                        style={{ color: '#ff6b6b' }}
                    >
                        <i className="fa-solid fa-trash"></i>
                    </button>
                )}
                {showInWatchlistIndicator && (
                    <div className="media-card__icon-btn" title="In watchlist">
                        <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                    </div>
                )}
            </div>
            <div className="media-card__body">
                <h3 onClick={handleClick}>{displayTitle}</h3>
            </div>
        </article>
    )
}

// Custom comparison: only re-render when the item identity, watchlist state, or
// action callbacks change. Because the store provides stable action references,
// the card will not re-render during scroll.
export default React.memo(MediaCard, (prev, next) => {
    return (
        prev.item === next.item &&
        prev.isInWatchlist === next.isInWatchlist &&
        prev.compact === next.compact &&
        prev.onAdd === next.onAdd &&
        prev.onMarkWatched === next.onMarkWatched &&
        prev.onMarkUnwatched === next.onMarkUnwatched &&
        prev.onAddToList === next.onAddToList &&
        prev.onDelete === next.onDelete &&
        prev.listMode === next.listMode &&
        prev.episodesLeft === next.episodesLeft
    )
})

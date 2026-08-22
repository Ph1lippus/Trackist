import React, { useMemo, useCallback } from 'react'
import { imageUrl } from '../../services/tmdbService'
import type { TMDBResult } from '../../types'
import { Link } from "react-router-dom"
import { useMobile } from '../../contexts/useMobile'

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
    priority?: boolean
    selected?: boolean
    selectable?: boolean
    onSelect?: (item: ResultItem) => void
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
    priority = false,
    selected = false,
    selectable = false,
    onSelect,
}) => {
    const { isMobile } = useMobile()
    const isPerson = item.media_type === 'person'
    
    const imgUrl = useMemo(
        () => {
            const imageSize = isMobile ? 'w342' : 'w342'
            return isPerson ? imageUrl(item.profile_path ?? null, imageSize) : imageUrl(item.poster_path ?? null, imageSize)
        },
        [isPerson, item.profile_path, item.poster_path, isMobile],
    )

    const displayTitle = useMemo(
        () => item.title || item.name || 'Untitled',
        [item.title, item.name],
    )


    const href =
    item.media_type === "person"
        ? `/person/${item.id}`
        : item.media_type === "tv"
        ? `/tv/${item.id}`
        : `/movie/${item.id}`

    const handleAddClick = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation()
            e.preventDefault()
            onAdd?.(item)
        },
        [onAdd, item],
    )

    const handleAddToListClick = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation()
            e.preventDefault()
            onAddToList?.(item)
        },
        [onAddToList, item],
    )

    const handleMarkWatchedClick = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation()
            e.preventDefault()
            onMarkWatched?.(item)
        },
        [onMarkWatched, item],
    )

    const handleMarkUnwatchedClick = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation()
            e.preventDefault()
            onMarkUnwatched?.(item)
        },
        [onMarkUnwatched, item],
    )

    const handleDeleteClick = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation()
            e.preventDefault()
            onDelete?.(item)
        },
        [onDelete, item],
    )
    const showAddButton = !compact && onAdd && !listMode
    const showAddToListButton = !compact && onAddToList && !isPerson && !listMode
    const showMarkWatched = !compact && !isPerson && onMarkWatched && !onMarkUnwatched
    const showMarkUnwatched = !compact && !isPerson && onMarkUnwatched && !onMarkWatched
    const showDeleteButton = !compact && onDelete && !isPerson && listMode
    const showInWatchlistIndicator =
        !compact && !isPerson && !onMarkWatched && !onMarkUnwatched && !onAdd && !onDelete && !listMode && !onAddToList && !selectable

    return (
        <article 
            className={`media-card${selected ? ' media-card--selected' : ''}`}
            onClick={() => {
                if (selectable && onSelect) {
                    onSelect(item)
                }
            }}
            style={{ cursor: selectable ? 'pointer' : undefined }}
        >
            <Link 
                to={href} 
                className="media-card__poster"
                onClick={(e) => {
                    if (selectable) {
                        e.preventDefault()
                        return
                    }
                    // Only prevent default if a button was clicked
                    if ((e.target as HTMLElement).closest('button')) {
                        e.preventDefault()
                    }
                }}
            >
                {imgUrl && <img src={imgUrl} alt={displayTitle} loading="lazy" fetchPriority={priority ? "high" : "auto"} decoding="async" />}
                {!imgUrl && (
                    <div className="media-card__no-poster" />
                )}
                {episodesLeft !== undefined && episodesLeft > 0 && (
                    <span className="media-card__episodes-left">+{episodesLeft}</span>
                )}
                {showAddButton && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleAddClick}
                        onTouchStart={(e) => {
                            // Prevent scroll only on the button itself
                            e.stopPropagation()
                        }}
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
                        onTouchStart={(e) => {
                            e.stopPropagation()
                        }}
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
                        onTouchStart={(e) => {
                            e.stopPropagation()
                        }}
                        title="Mark as watched"
                    >
                        <i className="fa-solid fa-eye"></i>
                    </button>
                )}
                {showMarkUnwatched && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleMarkUnwatchedClick}
                        onTouchStart={(e) => {
                            e.stopPropagation()
                        }}
                        title="Mark as unwatched"
                    >
                        <i className="fa-solid fa-eye-slash"></i>
                    </button>
                )}
                {showDeleteButton && (
                    <button
                        className="media-card__icon-btn"
                        onClick={handleDeleteClick}
                        onTouchStart={(e) => {
                            e.stopPropagation()
                        }}
                        title="Remove from list"
                        style={{ color: '#ff6b6b' }}
                    >
                        <i className="fa-solid fa-trash"></i>
                    </button>
                )}
                {showInWatchlistIndicator && (
                    <div
                        className="media-card__icon-btn"
                        title={isInWatchlist ? 'In watchlist' : 'Add to watchlist'}
                        onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                        }}
                    >
                        {isInWatchlist ? (
                            <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                        ) : (
                            <i className="fa-regular fa-bookmark"></i>
                        )}
                    </div>
                )}
            </Link>
            <div className="media-card__body">
                <h3>
                    <Link
                        to={href}
                        onClick={(e) => {
                            if (selectable) {
                                e.preventDefault()
                            }
                        }}
                        style={{ textDecoration: "none", color: "inherit" }}
                    >
                        {displayTitle}
                    </Link>
                </h3>
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
        prev.episodesLeft === next.episodesLeft &&
        prev.priority === next.priority &&
        prev.selected === next.selected &&
        prev.selectable === next.selectable &&
        prev.onSelect === next.onSelect
    )
})







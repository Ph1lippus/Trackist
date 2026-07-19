import React from 'react'
import { imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'

type ResultItem = TMDBResult

interface PersonCardProps {
    item: ResultItem
    onDetail: (item: ResultItem) => void
}

const PersonCard: React.FC<PersonCardProps> = ({ item, onDetail }) => {
    const imgUrl = imageUrl(item.profile_path ?? null)
    const name = item.name || 'Unknown'

    return (
        <article className="media-card" onClick={() => onDetail(item)}>
            <div className="media-card__poster">
                {imgUrl ? (
                    <img src={imgUrl} alt={name} loading="lazy" />
                ) : (
                    <div className="media-card__no-poster">
                        <span>{name}</span>
                    </div>
                )}
            </div>
            <div className="media-card__body">
                <h3 onClick={() => onDetail(item)}>{name}</h3>
                <span className="media-card__type">Person</span>
            </div>
        </article>
    )
}

export default PersonCard
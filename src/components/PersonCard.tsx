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
    const department = item.known_for_department || ''
    const popularity = item.popularity ? item.popularity.toFixed(1) : null
    const knownFor = (item.known_for || []).slice(0, 3)

    return (
        <article className="person-card" onClick={() => onDetail(item)}>
            <div className="person-card__photo">
                {imgUrl ? (
                    <img src={imgUrl} alt={name} loading="lazy" />
                ) : (
                    <div className="person-card__no-photo">
                        <span>{name[0].toUpperCase()}</span>
                    </div>
                )}
                {popularity && (
                    <div className="person-card__rating">★ {popularity}</div>
                )}
            </div>
            <div className="person-card__info">
                <h3 className="person-card__name">{name}</h3>
                {department && (
                    <span className="person-card__department">{department}</span>
                )}
                {knownFor.length > 0 && (
                    <p className="person-card__known">
                        Known for: {knownFor.map(k => k.title || k.name || '').filter(Boolean).join(', ')}
                    </p>
                )}
            </div>
        </article>
    )
}

export default PersonCard
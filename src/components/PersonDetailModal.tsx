import React, { useEffect, useState } from 'react'
import { getPersonDetails, imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'

interface PersonDetailModalProps {
    item: TMDBResult
    onClose: () => void
}

interface PersonDetails {
    id: number
    name: string
    profile_path?: string | null
    biography?: string
    birthday?: string
    place_of_birth?: string
    known_for_department?: string
    popularity?: number
    gender?: number
    known_for?: TMDBResult[]
}

const PersonDetailModal: React.FC<PersonDetailModalProps> = ({ item, onClose }) => {
    const [details, setDetails] = useState<PersonDetails | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true)
            try {
                const data = await getPersonDetails(item.id)
                setDetails(data)
            } catch (err) {
                console.error('Failed to load person details:', err)
                setDetails({
                    id: item.id,
                    name: item.name || 'Unknown',
                    profile_path: item.profile_path,
                    known_for: item.known_for
                })
            }
            setLoading(false)
        }
        fetchDetails()
    }, [item])

    const profileUrl = details?.profile_path ? imageUrl(details.profile_path) : null
    const title = details?.name || item.name || 'Unknown'
    const biography = details?.biography || 'No biography available.'
    const birthday = details?.birthday
    const placeOfBirth = details?.place_of_birth
    const knownForDepartment = details?.known_for_department
    const popularity = details?.popularity
    const knownFor = details?.known_for || []

    const getGender = (gender?: number): string => {
        if (gender === 1) return 'Female'
        if (gender === 2) return 'Male'
        return ''
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                {loading ? (
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading details...</p></div>
                ) : (
                    <div className="modal-layout">
                        <div className="modal-poster">
                            {profileUrl ? (
                                <img src={profileUrl} alt={title} />
                            ) : (
                                <div className="media-card__no-poster" style={{ height: '100%', minHeight: '300px' }}>
                                    <span>{title}</span>
                                </div>
                            )}
                        </div>

                        <div className="modal-info">
                            <h2 className="modal-title">{title}</h2>
                            
                            <div className="modal-meta">
                                {knownForDepartment && <span>{knownForDepartment}</span>}
                                {getGender(details?.gender) && <span>{getGender(details?.gender)}</span>}
                                {birthday && <span>🎂 {birthday}</span>}
                                {popularity && <span>⭐ {popularity.toFixed(1)}</span>}
                            </div>

                            {placeOfBirth && (
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                                    📍 {placeOfBirth}
                                </p>
                            )}

                            <p className="modal-overview">{biography}</p>

                            {knownFor.length > 0 && (
                                <div className="modal-cast" style={{ marginTop: '1rem' }}>
                                    <h4>Known For</h4>
                                    <div className="modal-cast-list">
                                        {knownFor.map((media: TMDBResult) => (
                                            <span key={media.id} className="modal-cast-item" style={{ cursor: 'default' }}>
                                                {media.poster_path && (
                                                    <img 
                                                        src={imageUrl(media.poster_path) || ''} 
                                                        alt={media.title || media.name || 'Media'} 
                                                        style={{ width: '40px', height: '60px' }}
                                                    />
                                                )}
                                                <span style={{ fontSize: '0.75rem' }}>
                                                    {media.title || media.name || 'Untitled'}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default PersonDetailModal
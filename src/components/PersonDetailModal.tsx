import React, { useEffect, useState } from 'react'
import { getPersonDetails, getPersonMovies, getPersonTV, imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'

interface PersonDetailModalProps {
    item: TMDBResult
    onClose: () => void
    onMediaClick?: (item: TMDBResult) => void
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

interface FilmographyItem extends TMDBResult {
    media_type: 'movie' | 'tv'
}

const PersonDetailModal: React.FC<PersonDetailModalProps> = ({ item, onClose, onMediaClick }) => {
    const [details, setDetails] = useState<PersonDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [movies, setMovies] = useState<FilmographyItem[]>([])
    const [tvShows, setTVShows] = useState<FilmographyItem[]>([])
    const [loadingCredits, setLoadingCredits] = useState(true)

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

    useEffect(() => {
        const fetchCredits = async () => {
            if (!item.id) return
            setLoadingCredits(true)
            try {
                const [moviesData, tvData] = await Promise.all([
                    getPersonMovies(item.id),
                    getPersonTV(item.id)
                ])
                const sortedMovies = ((moviesData as { cast?: TMDBResult[] }).cast || [])
                    .map((m: TMDBResult) => ({ ...m, media_type: 'movie' as const }))
                    .sort((a, b) => {
                        const dateA = (a as FilmographyItem).release_date || ''
                        const dateB = (b as FilmographyItem).release_date || ''
                        return dateB.localeCompare(dateA)
                    })
                const sortedTV = ((tvData as { cast?: TMDBResult[] }).cast || [])
                    .map((t: TMDBResult) => ({ ...t, media_type: 'tv' as const }))
                    .sort((a, b) => {
                        const dateA = (a as FilmographyItem).first_air_date || ''
                        const dateB = (b as FilmographyItem).first_air_date || ''
                        return dateB.localeCompare(dateA)
                    })
                setMovies(sortedMovies)
                setTVShows(sortedTV)
            } catch (err) {
                console.error('Failed to load credits:', err)
            }
            setLoadingCredits(false)
        }
        fetchCredits()
    }, [item.id])

    const profileUrl = details?.profile_path ? imageUrl(details.profile_path) : null
    const title = details?.name || item.name || 'Unknown'
    const biography = details?.biography || 'No biography available.'
    const birthday = details?.birthday
    const placeOfBirth = details?.place_of_birth
    const knownForDepartment = details?.known_for_department
    const popularity = details?.popularity

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

                            <div style={{ marginTop: '1.5rem' }}>
                                <h4 style={{ marginBottom: '0.75rem' }}>Movies</h4>
                                {loadingCredits ? (
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Loading filmography...</p>
                                ) : movies.length > 0 ? (
                                    <div className="modal-cast-list">
                                        {movies.slice(0, 20).map((movie) => (
                                            <span 
                                                key={movie.id} 
                                                className="modal-cast-item"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onMediaClick?.(movie)
                                                }}
                                            >
                                                {movie.poster_path && (
                                                    <img 
                                                        src={imageUrl(movie.poster_path) || ''} 
                                                        alt={movie.title || movie.name || 'Movie'} 
                                                    />
                                                )}
                                                <span>
                                                    {movie.title || movie.name || 'Untitled'}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>No movies found</p>
                                )}
                            </div>

                            <div style={{ marginTop: '1.5rem' }}>
                                <h4 style={{ marginBottom: '0.75rem' }}>TV Shows</h4>
                                {loadingCredits ? (
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Loading filmography...</p>
                                ) : tvShows.length > 0 ? (
                                    <div className="modal-cast-list">
                                        {tvShows.slice(0, 20).map((show) => (
                                            <span 
                                                key={show.id} 
                                                className="modal-cast-item"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onMediaClick?.(show)
                                                }}
                                            >
                                                {show.poster_path && (
                                                    <img 
                                                        src={imageUrl(show.poster_path) || ''} 
                                                        alt={show.title || show.name || 'TV Show'} 
                                                    />
                                                )}
                                                <span>
                                                    {show.title || show.name || 'Untitled'}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>No TV shows found</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default PersonDetailModal
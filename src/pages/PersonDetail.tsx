import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPersonDetails, getPersonMovies, getPersonTV, imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'

interface PersonDetails {
    id: number
    name: string
    profile_path?: string | null
    biography?: string
    birthday?: string
    place_of_birth?: string
    known_for_department?: string
    gender?: number
    known_for?: TMDBResult[]
}

interface FilmographyItem extends TMDBResult {
    media_type: 'movie' | 'tv'
}

const PersonDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [details, setDetails] = useState<PersonDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [movies, setMovies] = useState<FilmographyItem[]>([])
    const [tvShows, setTVShows] = useState<FilmographyItem[]>([])

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return
            setLoading(true)
            try {
                const data = await getPersonDetails(Number(id))
                setDetails(data)
            } catch (err) {
                console.error('Failed to load person details:', err)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [id])

    useEffect(() => {
        const fetchCredits = async () => {
            if (!id) return
            try {
                const [moviesData, tvData] = await Promise.all([
                    getPersonMovies(Number(id)),
                    getPersonTV(Number(id))
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
        }
        fetchCredits()
    }, [id])

    if (loading) {
        return (
            <div className="detail-page-loading">
                <div className="discover-spinner" />
                <p>Loading...</p>
            </div>
        )
    }

    if (!details) {
        return <div className="detail-page-error">Person not found</div>
    }

    const profileUrl = details.profile_path ? imageUrl(details.profile_path) : null
    const title = details.name || 'Unknown'
    const biography = details.biography || 'No biography available.'
    const birthday = details.birthday
    const placeOfBirth = details.place_of_birth
    const knownForDepartment = details.known_for_department

    const getGender = (gender?: number): string => {
        if (gender === 1) return 'Female'
        if (gender === 2) return 'Male'
        return ''
    }

    const handleMediaClick = (item: FilmographyItem) => {
        if (item.media_type === 'movie') {
            navigate(`/movie/${item.id}`)
        } else {
            navigate(`/tv/${item.id}`)
        }
    }

    return (
        <div className="detail-page detail-page--person">
            <div className="detail-page__content">
                <div className="detail-page__person-header">
                    <div className="detail-page__person-photo">
                        {profileUrl ? (
                            <img src={profileUrl} alt={title} />
                        ) : (
                            <div className="detail-page__person-no-photo">
                                <span>{title.charAt(0)}</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="detail-page__person-info">
                        <h1 className="detail-page__title">{title}</h1>
                        
                        <div className="detail-page__person-meta">
                            {knownForDepartment && <span>{knownForDepartment}</span>}
                            {getGender(details.gender) && <span>· {getGender(details.gender)}</span>}
                            {birthday && <span>· Born {birthday}</span>}
                        </div>

                        {placeOfBirth && (
                            <p className="detail-page__person-location">
                                📍 {placeOfBirth}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="detail-page__content">
                <div className="detail-page__main">
                    <div className="detail-page__biography-section">
                        <h2 className="detail-page__section-title">Biography</h2>
                        <p className="detail-page__overview">{biography}</p>
                    </div>

                    {movies.length > 0 && (
                        <div className="detail-page__filmography-section">
                            <h2 className="detail-page__section-title">Movies</h2>
                            <div className="detail-page__filmography-list">
                                {movies.slice(0, 20).map((movie) => (
                                    <div
                                        key={movie.id}
                                        className="detail-page__filmography-item"
                                        onClick={() => handleMediaClick(movie)}
                                    >
                                        {movie.poster_path && (
                                            <img
                                                src={imageUrl(movie.poster_path) || ''}
                                                alt={movie.title || 'Movie'}
                                                className="detail-page__filmography-poster"
                                            />
                                        )}
                                        <div className="detail-page__filmography-info">
                                            <span className="detail-page__filmography-title">
                                                {movie.title || 'Untitled'}
                                            </span>
                                            {movie.release_date && (
                                                <span className="detail-page__filmography-year">
                                                    {movie.release_date.slice(0, 4)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tvShows.length > 0 && (
                        <div className="detail-page__filmography-section">
                            <h2 className="detail-page__section-title">TV Shows</h2>
                            <div className="detail-page__filmography-list">
                                {tvShows.slice(0, 20).map((show) => (
                                    <div
                                        key={show.id}
                                        className="detail-page__filmography-item"
                                        onClick={() => handleMediaClick(show)}
                                    >
                                        {show.poster_path && (
                                            <img
                                                src={imageUrl(show.poster_path) || ''}
                                                alt={show.name || 'TV Show'}
                                                className="detail-page__filmography-poster"
                                            />
                                        )}
                                        <div className="detail-page__filmography-info">
                                            <span className="detail-page__filmography-title">
                                                {show.name || 'Untitled'}
                                            </span>
                                            {show.first_air_date && (
                                                <span className="detail-page__filmography-year">
                                                    {show.first_air_date.slice(0, 4)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PersonDetail

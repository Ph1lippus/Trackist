import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPersonDetails, getPersonMovies, getPersonTV, imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import MediaCard from '../components/media/MediaCard'

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
    usePageTitle('Trackist - Person Detail')
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
            <div className="detail-page">
                <div className="detail-page__content">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading person details...</p>
                    </div>
                </div>
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

    return (
        <div className="detail-page detail-page--no-scroll">
            {profileUrl && (
                <div className="detail-page__backdrop">
                    <img src={profileUrl} alt={title} loading="lazy" />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}

            <div className="detail-page__content detail-page__content--split">
                <div className="detail-page__main detail-page__main--person">
                    <div className="detail-page__left">
                        <div className="detail-page__title-section">
                            <div className="detail-page__logo-section">
                                {profileUrl ? (
                                    <img src={profileUrl} alt={title} className="detail-page__person-photo" />
                                ) : (
                                    <h1 className="detail-page__title">{title}</h1>
                                )}
                            </div>

                            <div className="detail-page__meta">
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

                        <div className="detail-page__overview-section">
                            <h2 className="detail-page__section-title">Biography</h2>
                            <p className="detail-page__overview">{biography}</p>
                        </div>
                    </div>

                    <div className="detail-page__right" style={{ display: 'none' }} />
                </div>
            </div>

            {(movies.length > 0 || tvShows.length > 0) && (
                <div className="detail-page__content">
                    <div className="detail-page__main">
                        {movies.length > 0 && (
                            <div className="detail-page__filmography-section">
                                <h2 className="detail-page__section-title">Movies</h2>
                                <div className="discover-grid">
                                    {movies.map((movie) => (
                                        <MediaCard
                                            key={movie.id}
                                            item={movie}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {tvShows.length > 0 && (
                            <div className="detail-page__filmography-section">
                                <h2 className="detail-page__section-title">TV Shows</h2>
                                <div className="discover-grid">
                                    {tvShows.map((show) => (
                                        <MediaCard
                                            key={show.id}
                                            item={show}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default PersonDetail

import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPersonDetails, getPersonMovies, getPersonTV, imageUrl } from '../services/tmdbService'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import MediaCard from '../components/media/MediaCard'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useAuthStore } from '../stores/useAuthStore'
import ConfirmModal from '../components/modals/ConfirmModal'

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
    const watchlistIds = useLibraryStore((state) => state.watchlistIds)
    const currentUser = useAuthStore((state) => state.user)
    const [removeConfirmItem, setRemoveConfirmItem] = useState<TMDBResult | null>(null)

    const handleAddToWatchlist = useCallback(
        async (item: TMDBResult) => {
            if (!currentUser) return

            if (watchlistIds.has(item.id)) {
                setRemoveConfirmItem(item)
                return
            }

            const newItem: WatchlistItem = {
                id: crypto.randomUUID(),
                user_id: currentUser.id,
                media_type: item.media_type === 'person' ? 'movie' : (item.media_type as 'movie' | 'tv' | 'anime'),
                tmdb_id: item.id,
                title: item.title || item.name || '',
                poster_path: item.poster_path || undefined,
                overview: item.overview || undefined,
                release_date: item.release_date || item.first_air_date || undefined,
                vote_average: item.vote_average || undefined,
                status: 'planning',
                added_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }

            await useLibraryStore.getState().addItem(newItem)
        },
        [currentUser, watchlistIds]
    )

    const handleConfirmRemove = useCallback(async () => {
        if (!removeConfirmItem) return

        const libraryItem = useLibraryStore.getState().allItems.find(i => i.tmdb_id === removeConfirmItem.id)
        if (libraryItem) {
            await useLibraryStore.getState().removeItem(libraryItem.id)
        }
        setRemoveConfirmItem(null)
    }, [removeConfirmItem])

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
                        const hasPosterA = !!a.poster_path ? 1 : 0
                        const hasPosterB = !!b.poster_path ? 1 : 0
                        if (hasPosterA !== hasPosterB) return hasPosterB - hasPosterA
                        const dateA = (a as FilmographyItem).release_date || ''
                        const dateB = (b as FilmographyItem).release_date || ''
                        return dateB.localeCompare(dateA)
                    })
                const sortedTV = ((tvData as { cast?: TMDBResult[] }).cast || [])
                    .map((t: TMDBResult) => ({ ...t, media_type: 'tv' as const }))
                    .sort((a, b) => {
                        const hasPosterA = !!a.poster_path ? 1 : 0
                        const hasPosterB = !!b.poster_path ? 1 : 0
                        if (hasPosterA !== hasPosterB) return hasPosterB - hasPosterA
                        const dateA = (a as FilmographyItem).first_air_date || ''
                        const dateB = (b as FilmographyItem).first_air_date || ''
                        return dateB.localeCompare(dateA)
                    })
                const seen = new Set<number>()
                const uniqueTV = sortedTV.filter((item) => {
                    if (seen.has(item.id)) return false
                    seen.add(item.id)
                    return true
                })
                setMovies(sortedMovies)
                setTVShows(uniqueTV)
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

    const profileUrl = details.profile_path ? imageUrl(details.profile_path, 'w185') : null
    const title = details.name || 'Unknown'
    const birthday = details.birthday
    const placeOfBirth = details.place_of_birth

    const getGender = (gender?: number): string => {
        if (gender === 1) return 'Female'
        if (gender === 2) return 'Male'
        return ''
    }

    const formatBirthday = (dateStr?: string): string => {
        if (!dateStr) return ''
        const date = new Date(dateStr + 'T00:00:00')
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
        const day = date.getDate()
        const month = months[date.getMonth()]
        const year = date.getFullYear()
        return `Born ${day} ${month} ${year}`
    }

    const formattedBirthday = formatBirthday(birthday)

    return (
        <div className="detail-page___person">
            <div className="detail-page__content">
                <div className="detail-page__main">
                    <div className="detail-page__person-header">
                        <div className="detail-page__person-photo">
                            {profileUrl ? (
                                <img src={profileUrl} alt={title} />
                            ) : (
                                <div className="detail-page__person-no-photo">
                                    <span className="detail-page__person-initial">{title.charAt(0)}</span>
                                </div>
                            )}
                        </div>
                        <div className="detail-page__person-info">
                            <h1 className="detail-page__person-name">{title}</h1>
                            <div className="detail-page__person-meta">
                                {getGender(details.gender) && <span>{getGender(details.gender)}</span>}
                                {formattedBirthday && <span>{formattedBirthday}</span>}
                            </div>
                            {placeOfBirth && (
                                <p className="detail-page__person-location">
                                    {placeOfBirth}
                                </p>
                            )}
                        </div>
                    </div>
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
                                            isInWatchlist={watchlistIds.has(movie.id)}
                                            onAdd={handleAddToWatchlist}
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
                                            isInWatchlist={watchlistIds.has(show.id)}
                                            onAdd={handleAddToWatchlist}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {removeConfirmItem && (
                <ConfirmModal
                    isOpen={true}
                    title="Remove from Watchlist"
                    message={`Are you sure you want to remove "${removeConfirmItem.title || removeConfirmItem.name}" from your watchlist?`}
                    onConfirm={handleConfirmRemove}
                    onCancel={() => setRemoveConfirmItem(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                />
            )}
        </div>
    )
}

export default PersonDetail


import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPersonDetails, getPersonMovies, getPersonTV, imageUrl } from '../services/tmdbService'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'
import { useDetailSidebar } from '../hooks/useDetailSidebar'
import MediaCard from '../components/media/MediaCard'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useAuthStore } from '../stores/useAuthStore'
import { getCachedOrFetch } from '../services/cacheService'
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

interface PersonDetailProps {
    itemId?: number
}

const PersonDetail: React.FC<PersonDetailProps> = ({ itemId: propId }) => {
    const { id: paramId } = useParams<{ id: string }>()
    const id = propId?.toString() ?? paramId
    const [details, setDetails] = useState<PersonDetails | null>(null)
    usePageTitle(details?.name ? `${details.name} - Track1st` : 'Track1st - Person Detail')
    const [detailsLoading, setDetailsLoading] = useState(true)
    const [movies, setMovies] = useState<FilmographyItem[]>([])
    const [tvShows, setTVShows] = useState<FilmographyItem[]>([])
    const [activeTab, setActiveTab] = useState<'movies' | 'tv'>('movies')
    const watchlistIds = useLibraryStore((state) => state.watchlistIds)
    const currentUser = useAuthStore((state) => state.user)
    const [removeConfirmItem, setRemoveConfirmItem] = useState<TMDBResult | null>(null)
    const { showIcons } = useMediaCardIcons()
    const { isOpen: isSidebarOpen } = useDetailSidebar()
    void isSidebarOpen

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
        let active = true
        const fetchDetails = async () => {
            setDetails(null)
            setDetailsLoading(true)
            if (!id) {
                setDetailsLoading(false)
                return
            }
            try {
                const data = await getCachedOrFetch(
                    'person-details',
                    Number(id),
                    () => getPersonDetails(Number(id)),
                    { ttl: 24 * 60 * 60 * 1000, staleWhileRevalidate: true }
                )
                if (active) setDetails(data)
            } catch (err) {
                console.error('Failed to load person details:', err)
            } finally {
                if (active) setDetailsLoading(false)
            }
        }
        void fetchDetails()
        return () => {
            active = false
        }
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
                        const hasPosterA = a.poster_path ? 1 : 0
                        const hasPosterB = b.poster_path ? 1 : 0
                        if (hasPosterA !== hasPosterB) return hasPosterB - hasPosterA
                        const dateA = (a as FilmographyItem).release_date || ''
                        const dateB = (b as FilmographyItem).release_date || ''
                        return dateB.localeCompare(dateA)
                    })
                const sortedTV = ((tvData as { cast?: TMDBResult[] }).cast || [])
                    .map((t: TMDBResult) => ({ ...t, media_type: 'tv' as const }))
                    .sort((a, b) => {
                        const hasPosterA = a.poster_path ? 1 : 0
                        const hasPosterB = b.poster_path ? 1 : 0
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

    if (detailsLoading) {
        return <div className="detail-page-loading" aria-live="polite">Loading person...</div>
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

    const gender = getGender(details.gender)
    const personStats = [
        { label: 'gender', value: gender || '—' },
        { label: 'born', value: formattedBirthday ? formattedBirthday.replace(/^Born\s+/, '') : '—' },
        { label: 'location', value: placeOfBirth || '—' }
    ]

    const renderGrid = (items: FilmographyItem[], type: 'movie' | 'tv') => {
        if (items.length === 0) {
            return (
                <div className="profile-empty">
                    <i className={`fa-solid ${type === 'movie' ? 'fa-film' : 'fa-tv'} profile-empty__icon`} />
                    <h3>{type === 'movie' ? 'No movies yet' : 'No TV shows yet'}</h3>
                </div>
            )
        }

        return (
            <div className="discover-grid">
                {items.map((item) => (
                    <MediaCard
                        key={item.id}
                        item={item}
                        isInWatchlist={watchlistIds.has(item.id)}
                        onAdd={handleAddToWatchlist}
                        showIcons={showIcons}
                    />
                ))}
            </div>
        )
    }

    return (
        <section className="detail-page detail-page--no-scroll detail-page--person">
            <div className="detail-page__content detail-page__content--split">
                <div className="detail-page__main detail-page__main--person">
                    <div className="detail-page__left">
                        <div className="dashboard-shell">
                <div className="profile-hero">
                    <div className="profile-hero__content">
                        <div className="profile-hero__top-row">
                            <div className="profile-hero__avatar-wrap">
                                {profileUrl ? (
                                    <img
                                        src={profileUrl}
                                        alt={title}
                                        className="profile-hero__avatar"
                                    />
                                ) : (
                                    <div className="profile-hero__avatar profile-hero__avatar--placeholder">
                                        {title.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="profile-hero__info">
                                <div className="profile-hero__identity">
                                    <h1 className="profile-hero__name">{title}</h1>
                                </div>

                                <div className="profile-hero__stats">
                                    {personStats.map((stat) => (
                                        <div className="profile-stat" key={stat.label}>
                                            <span className="profile-stat__label">{stat.label}</span>
                                            <span className="profile-stat__value">{stat.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {details.biography && (
                            <p className="profile-hero__bio">{details.biography}</p>
                        )}
                    </div>
                </div>

                <div className="profile-tabs">
                    <button
                        className={`profile-tab ${activeTab === 'movies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('movies')}
                    >
                        <span className="profile-tab__text">Movies</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'tv' ? 'active' : ''}`}
                        onClick={() => setActiveTab('tv')}
                    >
                        <span className="profile-tab__text">TV Shows</span>
                    </button>
                </div>

                <div className="profile-tab-content">
                    {activeTab === 'movies' ? renderGrid(movies, 'movie') : renderGrid(tvShows, 'tv')}
                </div>
            </div>
                        </div>
                    </div>
                    <div className="detail-page__right"></div>
                </div>

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
        </section>
    )
}

export default PersonDetail


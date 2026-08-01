import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTVDetails, getTVSeasonDetails, imageUrlOriginal, getFanartImages } from '../services/tmdbService'
import { markEpisodeWatched, unmarkEpisodeWatched, checkAndUpdateCompleted } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'

interface EpisodeData {
    id: number
    episode_number: number
    name: string
    overview: string
    still_path: string | null
    vote_average: number
    air_date: string
    runtime: number
}

const EpisodeDetail: React.FC = () => {
    const { id, season, episode } = useParams<{ id: string; season: string; episode: string }>()
    usePageTitle('Trackist - Episode Detail')
    const [tvDetails, setTvDetails] = useState<TMDBResult | null>(null)
    const [episodeData, setEpisodeData] = useState<EpisodeData | null>(null)
    const [loading, setLoading] = useState(true)
    const [fanartImages, setFanartImages] = useState<{ hdtvlogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [watched, setWatched] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean } | null>(null)

    // Use global store
    const libraryStore = useLibraryStore()

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [id, season, episode])

    useEffect(() => {
        const fetchData = async () => {
            if (!id || !season || !episode) return
            setLoading(true)
            try {
                const [tvData, seasonData, fanart] = await Promise.all([
                    getTVDetails(Number(id)),
                    getTVSeasonDetails(Number(id), Number(season)),
                    getFanartImages(Number(id), 'tv')
                ])
                setTvDetails(tvData)
                setFanartImages(fanart)

                const ep = seasonData.episodes?.find((e: EpisodeData) => e.episode_number === Number(episode))
                setEpisodeData(ep)

                // Check if in watchlist using global store
                const watchlistItem = libraryStore.allItems.find(item => item.tmdb_id === Number(id))
                if (watchlistItem) {
                    setIsInWatchlist(true)
                    setWatchlistId(watchlistItem.id)

                    // Check if episode is watched from the watchlist_episodes table
                    // Note: We still need to check this from DB as it's not in the main watchlist cache
                    const { data: episodeWatchData } = await supabase
                        .from('watchlist_episodes')
                        .select('*')
                        .eq('watchlist_id', watchlistItem.id)
                        .eq('season_number', Number(season))
                        .eq('episode_number', Number(episode))
                        .maybeSingle()
                    if (episodeWatchData) {
                        setWatched(true)
                    }
                }
            } catch (err) {
                console.error('Failed to load episode details:', err)
            }
            setLoading(false)
        }
        fetchData()
    }, [id, season, episode, libraryStore])

    const getLogoUrl = (): string | null => {
        if (tvDetails?.images?.logos) {
            const englishLogo = tvDetails.images.logos.find(
                (logo: { iso_639_1?: string | null; file_path: string }) => logo.iso_639_1 === 'en'
            )
            if (englishLogo) {
                return imageUrlOriginal(englishLogo.file_path)
            }
            const noLanguageLogo = tvDetails.images.logos.find(
                (logo: { iso_639_1?: string | null; file_path: string }) => logo.iso_639_1 === null || logo.iso_639_1 === ''
            )
            if (noLanguageLogo) {
                return imageUrlOriginal(noLanguageLogo.file_path)
            }
            if (tvDetails.images.logos.length > 0) {
                return imageUrlOriginal(tvDetails.images.logos[0].file_path)
            }
        }
        if (fanartImages?.hdtvlogo?.[0]?.url) {
            return fanartImages.hdtvlogo[0].url
        }
        return null
    }

    const handleToggleWatched = async () => {
        if (!watchlistId || !id || !season || !episode || !episodeData) return

        // If trying to unwatch, show confirmation modal
        if (watched) {
            setConfirmModal({ isOpen: true })
            return
        }

        // Mark as watched - optimistic update
        setWatched(true)

        try {
            const success = await markEpisodeWatched(watchlistId, Number(season), Number(episode), {
                tmdb_episode_id: episodeData.id,
                title: episodeData.name,
                still_path: episodeData.still_path,
                overview: episodeData.overview,
                vote_average: episodeData.vote_average,
                air_date: episodeData.air_date,
                runtime: episodeData.runtime
            })

            if (!success) {
                setWatched(false)
                console.error('Failed to mark episode as watched')
                return
            }

            // Update watchlist status
            await checkAndUpdateCompleted(watchlistId, Number(id))
        } catch (err) {
            setWatched(false)
            console.error('Failed to mark episode as watched:', err)
        }
    }

    const handleUnwatch = async () => {
        if (!watchlistId || !id || !season || !episode) return

        setWatched(false)
        setConfirmModal(null)

        try {
            const success = await unmarkEpisodeWatched(watchlistId, Number(season), Number(episode))
            if (!success) {
                setWatched(true)
                console.error('Failed to unmark episode')
                return
            }

            // Check if we need to reset status to planning (no episodes watched)
            await checkAndUpdateCompleted(watchlistId, Number(id))
        } catch (err) {
            setWatched(true)
            console.error('Failed to unwatch episode:', err)
        }
    }

    if (loading) {
        return (
            <div className="detail-page">
                <div className="detail-page__content">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading episode details...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!tvDetails || !episodeData) {
        return <div className="detail-page-error">Episode not found</div>
    }

    const backdropUrl = episodeData.still_path ? `https://image.tmdb.org/t/p/original${episodeData.still_path}` : null
    const logoUrl = getLogoUrl()
    const title = tvDetails.name || 'Untitled'
    const episodeTitle = episodeData.name || `Episode ${episodeData.episode_number}`
    const genres = tvDetails.genres || []


    return (
        <div className="detail-page detail-page--no-scroll">
            {backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={episodeTitle} />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}
            
            <div className="detail-page__content detail-page__content--split">
                <div className="detail-page__main detail-page__main--episode">
                    <div className="detail-page__left">
                        <div className="detail-page__title-section">
                            <div className="detail-page__logo-section">
                                {logoUrl ? (
                                    <img src={logoUrl} alt={title} className="detail-page__logo" />
                                ) : (
                                    <h1 className="detail-page__title">{title}</h1>
                                )}
                            </div>
                            
                            <div className="detail-page__meta">
                                {season != null && episode != null && (
                                    <span className="detail-page__year">
                                        S{season.toString().padStart(2, "0")}
                                        E{episode.toString().padStart(2, "0")}
                                    </span>
                                )}
                                {episodeData.air_date && <span className="detail-page__year">{episodeData.air_date}</span>}
                                {episodeData.runtime && <span className="detail-page__runtime">{episodeData.runtime} min</span>}
                                {episodeData.vote_average && <span className="detail-page__rating">★ {episodeData.vote_average.toFixed(1)}</span>}
                            </div>
                            {genres.length > 0 && (
                                <div className="detail-page__genres">
                                    {genres.map((g: { id: number; name: string }) => (
                                        <span key={g.id} className="detail-page__genre">{g.name}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                        

                        <div className="detail-page__overview-section">
                            <h2 className="detail-page__section-title">Overview</h2>
                            <p className="detail-page__overview">{episodeData.overview || 'No description available.'}</p>
                            
                            <div className="detail-page__actions">
                                {isInWatchlist && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={handleToggleWatched}
                                        title={watched ? 'Mark as Unwatched' : 'Mark as Watched'}
                                    >
                                        <i className={watched ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'}></i>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="detail-page__right" style={{ display: 'none' }}>
                    </div>
                </div>
            </div>

            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title="Mark as Unwatched"
                    message="Are you sure you want to mark this episode as unwatched?"
                    onConfirm={handleUnwatch}
                    onCancel={() => setConfirmModal(null)}
                    confirmText="Mark as Unwatched"
                    cancelText="Cancel"
                    confirmColor="danger"
                />
            )}
        </div>
    )
}

export default EpisodeDetail
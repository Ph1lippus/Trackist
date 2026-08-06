import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTVDetails, getTVSeasonDetails, imageUrl, imageUrlOriginal, getFanartImages, getBestBackdropPath } from '../services/tmdbService'
import { markEpisodeWatched, unmarkEpisodeWatched, getWatchedEpisodes, checkAndUpdateCompleted, markShowAsFullyWatched } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { supabase } from '../services/supabaseClient'
import { invalidateUserCache } from '../services/cacheService'
import ConfirmModal from '../components/modals/ConfirmModal'
import EpisodeChoiceModal from '../components/modals/EpisodeChoiceModal'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { createEpisodeDeepLink, openInStremio } from '../utils/stremioUtils'

interface LocalEpisode {
    id: string
    season_number: number
    episode_number: number
    tmdb_episode_id?: number
    title?: string
    still_path?: string
    overview?: string
    vote_average?: number
    air_date?: string
    runtime?: number
    watched: boolean // local only - true if in watchlist_episodes table
}

const TVShowDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    usePageTitle('Trackist - TV Show Detail')
    const navigate = useNavigate()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [fanartImages, setFanartImages] = useState<{ hdtvlogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [watchlistStatus, setWatchlistStatus] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<LocalEpisode[]>([])
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [showTrailer, setShowTrailer] = useState(false)
    const [trailerKey, setTrailerKey] = useState<string | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        episode: LocalEpisode
        markAll: boolean
        isUnwatch: boolean
    } | null>(null)
    const [removeEpisodeModal, setRemoveEpisodeModal] = useState<{
        isOpen: boolean
        episode: LocalEpisode
    } | null>(null)
    const [removeWatchlistModal, setRemoveWatchlistModal] = useState<{ isOpen: boolean } | null>(null)
    const [markWatchedModal, setMarkWatchedModal] = useState<{ isOpen: boolean; markAsWatched: boolean } | null>(null)
    const [addEpisodeModal, setAddEpisodeModal] = useState<{
        isOpen: boolean
        episode: LocalEpisode
    } | null>(null)
    const [showCast, setShowCast] = useState(false)
    const [modalLoading, setModalLoading] = useState(false)
    const [episodeModalLoading, setEpisodeModalLoading] = useState<'all' | 'one' | null>(null)
    const hasUserSelectedSeason = useRef(false)
    const hasAutoPositioned = useRef(false)
    const episodeToScrollRef = useRef<string | null>(null)
    const episodeRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
    const episodeListRef = useRef<HTMLDivElement>(null)

    const isEpisodeReleased = (episode: LocalEpisode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
    }

    useEffect(() => {
        window.scrollTo(0, 0)
        hasUserSelectedSeason.current = false
        hasAutoPositioned.current = false
        episodeToScrollRef.current = null
    }, [id])

    useEffect(() => {
        if (episodeToScrollRef.current && episodeRefs.current[episodeToScrollRef.current]) {
            const targetElement = episodeRefs.current[episodeToScrollRef.current]
            if (targetElement && episodeListRef.current) {
                const container = episodeListRef.current
                const targetTop = targetElement.offsetTop
                container.scrollTo({
                    top: targetTop - container.offsetTop,
                    behavior: 'smooth'
                })
            }
            episodeToScrollRef.current = null
        }
    }, [selectedSeason, episodes])

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return
            setLoading(true)
            try {
                const [data, fanart] = await Promise.all([
                    getTVDetails(Number(id)),
                    getFanartImages(Number(id), 'tv')
                ])
                setDetails(data)
                setFanartImages(fanart)
                
                if (data.seasons?.[0]) {
                    // Find the first valid season (not season 0, has episodes)
                    const firstValidSeason = data.seasons.find(
                        (s: { season_number: number; episode_count?: number }) => 
                            s.season_number > 0 && (s.episode_count === undefined || s.episode_count > 0)
                    )
                    if (firstValidSeason) {
                        setSelectedSeason(firstValidSeason.season_number)
                    }
                }

                // Find trailer from videos
                if (data.videos?.results) {
                    const trailer = data.videos.results.find(
                        (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
                    )
                    if (trailer) setTrailerKey(trailer.key)
                }

                // Check if in watchlist using global store
                const watchlistItem = useLibraryStore.getState().allItems.find(item => item.tmdb_id === Number(id))
                setIsInWatchlist(!!watchlistItem)
                if (watchlistItem) {
                    setWatchlistId(watchlistItem.id)
                    setWatchlistStatus(watchlistItem.status)
                } else {
                    setWatchlistId(null)
                    setWatchlistStatus(null)
                }
            } catch (err) {
                console.error('Failed to load TV show details:', err)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [id])

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!details || !id) return
            
            try {
                // Filter out seasons with 0 episodes (empty seasons)
                const seasonList = (details.seasons || [])
                    .filter((s: { season_number: number; episode_count?: number }) => 
                        s.season_number > 0 && (s.episode_count === undefined || s.episode_count > 0)
                    )
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

                // Get watched episodes from DB (these are episodes in watchlist_episodes table)
                let watchedEpisodeKeys = new Set<string>()
                if (isInWatchlist && watchlistId) {
                    const watchedEps = await getWatchedEpisodes(watchlistId)
                    watchedEpisodeKeys = new Set(
                        watchedEps.map(ep => `${ep.season_number}-${ep.episode_number}`)
                    )
                }

                // Fetch all seasons in parallel for better performance
                const seasonPromises = seasonList.map(season => getTVSeasonDetails(Number(id), season))
                const seasonDataArray = await Promise.all(seasonPromises)
                
                const allEpisodes: LocalEpisode[] = []
                seasonDataArray.forEach((sData, index) => {
                    const season = seasonList[index]
                    const sEpisodes = sData.episodes || []
                    for (const ep of sEpisodes) {
                        const key = `${season}-${ep.episode_number}`
                        allEpisodes.push({
                            id: `${id}-${season}-${ep.episode_number}`,
                            season_number: season,
                            episode_number: ep.episode_number,
                            tmdb_episode_id: ep.id,
                            title: ep.name,
                            still_path: ep.still_path,
                            overview: ep.overview,
                            vote_average: ep.vote_average,
                            air_date: ep.air_date,
                            runtime: ep.runtime,
                            watched: watchedEpisodeKeys.has(key)
                        })
                    }
                })
                setEpisodes(allEpisodes)

                // Find last watched episode and set season/scroll if user hasn't manually selected
                if (!hasUserSelectedSeason.current && !hasAutoPositioned.current && watchedEpisodeKeys.size > 0) {
                    hasAutoPositioned.current = true
                    // Find the last watched episode by looking at the highest season+episode
                    const watchedEps = allEpisodes.filter(ep => ep.watched)
                    if (watchedEps.length > 0) {
                        const lastWatched = watchedEps.reduce((max, ep) => {
                            if (ep.season_number > max.season_number) return ep
                            if (ep.season_number === max.season_number && ep.episode_number > max.episode_number) return ep
                            return max
                        }, watchedEps[0])
                        
                        if (lastWatched) {
                            // Check if all episodes in the last watched season are fully watched
                            const episodesInSeason = allEpisodes.filter(ep => ep.season_number === lastWatched.season_number)
                            const allReleasedInSeasonWatched = episodesInSeason.filter(ep => isEpisodeReleased(ep)).every(ep => ep.watched)
                            
                            let targetSeason = lastWatched.season_number
                            let targetEpisode = lastWatched.episode_number
                            
                            // If all released episodes in the season are watched, go to next season
                            if (allReleasedInSeasonWatched) {
                                const nextSeasonIndex = seasonList.indexOf(lastWatched.season_number) + 1
                                if (nextSeasonIndex < seasonList.length) {
                                    targetSeason = seasonList[nextSeasonIndex]
                                    const firstEpisodeOfNextSeason = allEpisodes.find(ep => ep.season_number === targetSeason)
                                    if (firstEpisodeOfNextSeason) {
                                        targetEpisode = firstEpisodeOfNextSeason.episode_number
                                    }
                                }
                            }
                            
                            setSelectedSeason(targetSeason)
                            episodeToScrollRef.current = `${id}-${targetSeason}-${targetEpisode}`
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
        }
        loadEpisodes()
    }, [details, id, isInWatchlist, watchlistId])

    const handleAddToWatchlist = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !details) {
            alert('Please log in')
            return null
        }

        setAdding(true)

        const totalEpisodes = details.number_of_episodes || 0
        const totalSeasons = details.number_of_seasons || 1

        const newItem: WatchlistItem = {
            id: crypto.randomUUID(),
            user_id: user.id,
            media_type: 'tv',
            tmdb_id: details.id,
            title: details.name || '',
            poster_path: details.poster_path || undefined,
            overview: details.overview,
            release_date: details.first_air_date,
            vote_average: details.vote_average,
            total_episodes: totalEpisodes,
            total_seasons: totalSeasons,
            current_episode: 0,
            current_season: 1,
            last_season_number: totalSeasons,
            last_season_check: new Date().toISOString(),
            status: 'planning',
            added_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }

        // Optimistic update
        await useLibraryStore.getState().addItem(newItem)
        
        setIsInWatchlist(true)
        setWatchlistId(newItem.id)
        setWatchlistStatus('planning')
        // Newly added shows have no watched episodes yet - update local state to stay in sync
        setEpisodes(prev => prev.map(ep => ({ ...ep, watched: false })))
        setAdding(false)
        return newItem.id
    }

    const handleRemoveFromWatchlist = async () => {
        if (!watchlistId) return

        setModalLoading(true)
        try {
            // Optimistic update via store
            await useLibraryStore.getState().removeItem(watchlistId)
            
            // Invalidate cache to ensure Finished page shows updated data immediately
            await invalidateUserCache()
            
            setIsInWatchlist(false)
            setWatchlistId(null)
            setWatchlistStatus(null)
            // Reset all episode watched states since the show is no longer in the watchlist
            setEpisodes(prev => prev.map(ep => ({ ...ep, watched: false })))
            setRemoveWatchlistModal(null)
        } finally {
            setModalLoading(false)
        }
    }
    const handleSeasonChange = (season: number) => {
        hasUserSelectedSeason.current = true
        setSelectedSeason(season)
    }

    const hasUnwatchedEpisodesBefore = (episode: LocalEpisode): boolean => {
        const episodesBefore = episodes.filter(ep => {
            if (ep.season_number < episode.season_number) return true
            if (ep.season_number === episode.season_number && ep.episode_number < episode.episode_number) return true
            return false
        })
        return episodesBefore.some(ep => !ep.watched)
    }

    const getLogoUrl = (): string | null => {
        if (details?.images?.logos) {
            const logos = details.images.logos as Array<{ file_path: string; iso_639_1?: string | null }>
            const englishLogo = logos.find(
                (logo) => logo.iso_639_1 === 'en'
            )
            if (englishLogo) {
                return imageUrlOriginal(englishLogo.file_path)
            }
            const noLanguageLogo = logos.find(
                (logo) => logo.iso_639_1 === null || logo.iso_639_1 === ''
            )
            if (noLanguageLogo) {
                return imageUrlOriginal(noLanguageLogo.file_path)
            }
            if (logos.length > 0) {
                return imageUrlOriginal(logos[0].file_path)
            }
        }
        if (fanartImages?.hdtvlogo?.[0]?.url) {
            return fanartImages.hdtvlogo[0].url
        }
    
        return null
    }  

    const getAgeRating = (): string => {
        if (!details?.content_ratings?.results) return ''
        const usRating = details.content_ratings.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US')
        if (usRating?.rating) {
            return usRating.rating
        }
        return ''
    }

    const getAgeRatingTooltip = (): string => {
        const rating = getAgeRating()
        const tooltips: { [key: string]: string } = {
            'G': 'General Audiences - All ages admitted',
            'PG': 'Parental Guidance Suggested',
            'PG-13': 'Parents Strongly Cautioned - Some material may be inappropriate for children under 13',
            'R': 'Restricted - Under 17 requires accompanying parent or adult guardian',
            'NC-17': 'Adults Only - No one 17 and under admitted',
            'TV-Y': 'All Children',
            'TV-Y7': 'Directed to Older Children - Ages 7+',
            'TV-G': 'General Audience',
            'TV-PG': 'Parental Guidance Suggested',
            'TV-14': 'Parents Strongly Cautioned - Ages 14+',
            'TV-MA': 'Mature Audience Only',
        }
        return tooltips[rating] || rating
    }

    const markEpisodeAsWatched = async (episode: LocalEpisode, markAll: boolean) => {
        if (!watchlistId || !details) return

        if (markAll) {
            // Mark all episodes up to and including this one
            const episodesToMark = episodes.filter(ep => {
                if (ep.season_number < episode.season_number) {
                    if (!isEpisodeReleased(ep)) return false
                    return true
                }
                if (ep.season_number === episode.season_number && ep.episode_number <= episode.episode_number) {
                    if (!isEpisodeReleased(ep)) return false
                    return true
                }
                return false
            })

            // Optimistically update local state
            setEpisodes(prev => prev.map(ep => {
                const shouldMark = isEpisodeReleased(ep) && (
                    ep.season_number < episode.season_number ||
                    (ep.season_number === episode.season_number && ep.episode_number <= episode.episode_number)
                )
                return shouldMark ? { ...ep, watched: true } : ep
            }))

            try {
                // Mark all episodes in parallel for better performance
                const markPromises = episodesToMark.map(ep => 
                    markEpisodeWatched(watchlistId, ep.season_number, ep.episode_number, {
                        tmdb_episode_id: ep.tmdb_episode_id,
                        title: ep.title,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        vote_average: ep.vote_average,
                        air_date: ep.air_date,
                        runtime: ep.runtime
                    })
                )
                await Promise.all(markPromises)
                
                // Check if all episodes are watched and update status to completed/caught_up
                await checkAndUpdateCompleted(watchlistId, details.id)
                
                // Recalculate progress to ensure current_episode and status are in sync
                await useLibraryStore.getState().refreshItem(watchlistId)
                
                // Check for milestone and celebrate
                await checkMilestoneAndCelebrate(watchlistStatus)
            } catch (err) {
                console.error('Failed to mark episodes:', err)
                // Revert on error
                setEpisodes(prev => prev.map(ep => {
                    const shouldMark = isEpisodeReleased(ep) && (
                        ep.season_number < episode.season_number ||
                        (ep.season_number === episode.season_number && ep.episode_number <= episode.episode_number)
                    )
                    return shouldMark ? { ...ep, watched: false } : ep
                }))
                return
            }
        } else {
            // Mark just this episode (toggle)
            const newWatchedState = !episode.watched

            // If unwatching, show confirmation modal
            if (!newWatchedState && episode.watched) {
                setRemoveEpisodeModal({ isOpen: true, episode })
                return
            }

            // Optimistically update local state
            setEpisodes(prev => prev.map(ep => 
                ep.id === episode.id ? { ...ep, watched: newWatchedState } : ep
            ))

            try {
                if (newWatchedState) {
                    // INSERT into watchlist_episodes
                    const success = await markEpisodeWatched(watchlistId, episode.season_number, episode.episode_number, {
                        tmdb_episode_id: episode.tmdb_episode_id,
                        title: episode.title,
                        still_path: episode.still_path,
                        overview: episode.overview,
                        vote_average: episode.vote_average,
                        air_date: episode.air_date,
                        runtime: episode.runtime
                    })
                    if (!success) {
                        setEpisodes(prev => prev.map(ep => 
                            ep.id === episode.id ? { ...ep, watched: false } : ep
                        ))
                        return
                    }
                    // Check if all episodes are watched and update status to completed/caught_up
                    await checkAndUpdateCompleted(watchlistId, details.id)
                } else {
                    // DELETE from watchlist_episodes
                    const success = await unmarkEpisodeWatched(watchlistId, episode.season_number, episode.episode_number)
                    if (!success) {
                        setEpisodes(prev => prev.map(ep => 
                            ep.id === episode.id ? { ...ep, watched: true } : ep
                        ))
                        return
                    }
                    // Recalculate status based on remaining watched episodes
                    await checkAndUpdateCompleted(watchlistId, details.id)
                }

                // Recalculate progress to ensure current_episode and status are in sync
                await useLibraryStore.getState().refreshItem(watchlistId)
                
                // Check for milestone and celebrate
                await checkMilestoneAndCelebrate(watchlistStatus)
            } catch (err) {
                setEpisodes(prev => prev.map(ep => 
                    ep.id === episode.id ? { ...ep, watched: !newWatchedState } : ep
                ))
                console.error('Failed to toggle episode:', err)
            }
        }
    }

    /**
     * Check if milestone was achieved and fire Cosmic Confetti.
     * Assumes the store has already been refreshed with the new status.
     */
    const checkMilestoneAndCelebrate = async (previousStatus: string | null, targetWatchlistId?: string) => {
        const wlId = targetWatchlistId || watchlistId
        if (!wlId) return
        try {
            // Read the FRESH store state (already refreshed by caller)
            const updatedItem = useLibraryStore.getState().allItems.find(item => item.id === wlId)
            if (updatedItem) {
                const newStatus = updatedItem.status
                // Update local state
                setWatchlistStatus(newStatus)
                // Fire confetti if just completed/caught_up
                if (
                    (newStatus === 'completed' || newStatus === 'caught_up') &&
                    previousStatus !== 'completed' && previousStatus !== 'caught_up'
                ) {
                    launchCosmicConfetti()
                }
            }
        } catch (err) {
            console.error('Failed to check milestone:', err)
        }
    }

    const handleRemoveEpisode = async () => {
        if (!removeEpisodeModal || !watchlistId || !details) return

        const episode = removeEpisodeModal.episode

        setModalLoading(true)
        try {
            // Optimistically update local state
            setEpisodes(prev => prev.map(ep => 
                ep.id === episode.id ? { ...ep, watched: false } : ep
            ))

            const success = await unmarkEpisodeWatched(watchlistId, episode.season_number, episode.episode_number)
            if (!success) {
                setEpisodes(prev => prev.map(ep => 
                    ep.id === episode.id ? { ...ep, watched: true } : ep
                ))
                return
            }

            // Recalculate status based on remaining watched episodes
            await checkAndUpdateCompleted(watchlistId, details.id)
            
            // Refresh the item from the store to get the updated status and recalculate progress
            await useLibraryStore.getState().refreshItem(watchlistId)
            
            // Invalidate cache to ensure Finished page shows updated data immediately
            await invalidateUserCache()
            
            // Update local state with the new status from the store
            const updatedItem = useLibraryStore.getState().allItems.find(item => item.id === watchlistId)
            if (updatedItem) {
                setWatchlistStatus(updatedItem.status)
            }
        } catch (err) {
            setEpisodes(prev => prev.map(ep => 
                ep.id === episode.id ? { ...ep, watched: true } : ep
            ))
            console.error('Failed to remove episode:', err)
        } finally {
            setModalLoading(false)
            setRemoveEpisodeModal(null)
        }
    }

    const filteredEpisodes = episodes.filter(ep => ep.season_number === selectedSeason)

    if (loading) {
        return (
            <div className="detail-page">
                <div className="detail-page__content">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading TV show details...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!details) {
        return <div className="detail-page-error">TV Show not found</div>
    }

    const backdropUrl = imageUrlOriginal(getBestBackdropPath(details.images?.backdrops) ?? details.backdrop_path ?? null)
    const logoUrl = getLogoUrl()
    const title = details.name || 'Untitled'
    const firstYear = details.first_air_date?.slice(0, 4) || ''
    const lastYear = details.last_air_date?.slice(0, 4) || ''
    const year = firstYear
    ? (details.status === 'Ended' || details.status === 'Canceled'
        ? (lastYear && lastYear !== firstYear ? `${firstYear}-${lastYear}` : firstYear)
        : `${firstYear}-`)
    : ''
    const rating = details.vote_average?.toFixed(1)
    const ageRating = getAgeRating()
    const overview = details.overview || 'No description available.'
    const genres = details.genres || []
    const cast = (details.credits?.cast || [])
        .slice(0, 10)
        .sort((a: { profile_path?: string | null }, b: { profile_path?: string | null }) => {
            if (a.profile_path && !b.profile_path) return -1
            if (!a.profile_path && b.profile_path) return 1
            return 0
        })
    // Count seasons that actually have episodes for display
    const displaySeasonCount = seasons.length

    return (
        <div className="detail-page detail-page--no-scroll">
            {backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}
            
            <div className="detail-page__content detail-page__content--split">
                <div className="detail-page__main detail-page__main--tv">
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
                            
                            {year && <span className="detail-page__year">{year}</span>}
                            {displaySeasonCount > 0 && <span className="detail-page__seasons">{displaySeasonCount} Seasons</span>}
                            {rating !== undefined && rating !== null && (
                                <span className="detail-page__rating" aria-label={`Rating: ${rating} out of 10`}>
                                    <span aria-hidden="true">★</span> {rating}
                                </span>
                            )}

                            {ageRating && (
                                <span className="detail-page__age-rating" data-tooltip={getAgeRatingTooltip()}>
                                    {ageRating}
                                </span>
                            )}

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
                            <p className="detail-page__overview">{overview}</p>
                            
                            <div className="detail-page__actions">
                                {trailerKey && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setShowTrailer(!showTrailer)}
                                        title={showTrailer ? 'Close Trailer' : 'Watch Trailer'}
                                    >
                                        <i className="fa-solid fa-clapperboard"></i>
                                    </button>
                                )}
                                {cast.length > 0 && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setShowCast(!showCast)}
                                        title={showCast ? 'Hide Cast' : 'Cast'}
                                    >
                                        <i className="fa-solid fa-users"></i>
                                    </button>
                                )}
                                <button
                                    className="detail-page__icon-btn"
                                    onClick={() => {
                                        const sharingLink = createEpisodeDeepLink(details.id, 1, 1, details.external_ids?.imdb_id)
                                        openInStremio(sharingLink)
                                    }}
                                    title="Open in Stremio"
                                >
                                    <i className="fa-solid fa-play"></i>
                                </button>
                                {!isInWatchlist ? (
                                    <>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={async () => {
                                                await handleAddToWatchlist()
                                            }}
                                            disabled={adding}
                                            title="Add to Watchlist"
                                        >
                                            <i className="fa-regular fa-bookmark"></i>
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={async () => {
                                                setIsUpdatingStatus(true)
                                                const newWatchlistId = await handleAddToWatchlist()
                                                if (newWatchlistId && details) {
                                                    // Gold standard: just set the status directly - no need to insert every episode
                                                    const newStatus = await markShowAsFullyWatched(newWatchlistId, details.id)
                                                    // Update local state with the new status
                                                    setWatchlistStatus(newStatus)
                                                    // Fire confetti if completed/caught_up
                                                    if (newStatus === 'completed' || newStatus === 'caught_up') {
                                                        launchCosmicConfetti()
                                                    }
                                                    // Refresh episodes
                                                    setEpisodes(prev => prev.map(ep => ({ ...ep, watched: true })))
                                                }
                                                setIsUpdatingStatus(false)
                                            }}
                                            disabled={adding || isUpdatingStatus}
                                            title="Mark as Watched"
                                        >
                                            <i className="fa-solid fa-eye"></i>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => setRemoveWatchlistModal({ isOpen: true })}
                                            title="Remove from Watchlist"
                                        >
                                            <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => {
                                                if (!watchlistId) return
                                                const markAsWatched = watchlistStatus !== 'completed'
                                                setMarkWatchedModal({ isOpen: true, markAsWatched })
                                            }}
                                            disabled={isUpdatingStatus || modalLoading}
                                            title={watchlistStatus === 'completed' ? 'Mark as Unwatched' : 'Mark as Watched'}
                                        >
                                            <i className={watchlistStatus === 'completed' ? 'fa-solid fa-eye-slash' :'fa-solid fa-eye'}></i>
                                        </button>
                                    </>
                                )}
                            </div>

                            {showTrailer && trailerKey && (
                                <div className="detail-page__trailer-overlay" onClick={() => setShowTrailer(false)}>
                                    <div className="detail-page__trailer-modal" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                            className="detail-page__trailer-close"
                                            onClick={() => setShowTrailer(false)}
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                        <iframe
                                            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&vq=hd1080`}
                                            title="Trailer"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                            className="detail-page__trailer-iframe"
                                        />
                                    </div>
                                </div>
                            )}

                        </div>

                        {showCast && cast.length > 0 && (
                            <div className="detail-page__cast-section">
                                {showCast && (
                                    <div className="detail-page__cast-list">
                                        {cast.map((c: { id: number; name: string; profile_path?: string; character?: string }) => (
                                            <div 
                                                key={c.id} 
                                                className="detail-page__cast-item"
                                                onClick={() => navigate(`/person/${c.id}`)}
                                            >
                                                <div className="detail-page__cast-info">
                                                    <span className="detail-page__cast-name">{c.name}</span>
                                                    {c.character && (
                                                        <span className="detail-page__cast-character">{c.character}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="detail-page__right">
                        <div className="detail-page__episodes-section">
                            {seasons.length > 1 && (
                                <div className="detail-page__episodes-header">
                                    <button 
                                        className="detail-page__season-nav"
                                        onClick={() => {
                                            const currentIndex = seasons.indexOf(selectedSeason)
                                            if (currentIndex > 0) {
                                                handleSeasonChange(seasons[currentIndex - 1])
                                            }
                                        }}
                                        disabled={seasons.indexOf(selectedSeason) === 0}
                                    >
                                        <i className="fa-solid fa-chevron-left"></i>
                                    </button>
                                    <select 
                                        className="detail-page__season-select"
                                        value={selectedSeason}
                                        onChange={(e) => handleSeasonChange(Number(e.target.value))}
                                    >
                                        {seasons.map(s => (
                                            <option key={s} value={s}>Season {s}</option>
                                        ))}
                                    </select>
                                    <button 
                                        className="detail-page__season-nav"
                                        onClick={() => {
                                            const currentIndex = seasons.indexOf(selectedSeason)
                                            if (currentIndex < seasons.length - 1) {
                                                handleSeasonChange(seasons[currentIndex + 1])
                                            }
                                        }}
                                        disabled={seasons.indexOf(selectedSeason) === seasons.length - 1}
                                    >
                                        <i className="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>
                            )}
                            
                            <div className="detail-page__episode-list" ref={episodeListRef}>
                                {filteredEpisodes.map((ep) => (
                                    <div 
                                        key={ep.id} 
                                        ref={(el) => { episodeRefs.current[ep.id] = el }}
                                        className={`detail-page__episode-card ${ep.watched ? 'watched' : ''} ${!isEpisodeReleased(ep) ? 'unreleased' : ''}`}
                                        style={{ cursor: isEpisodeReleased(ep) ? 'pointer' : 'default' }}
                                    >
                                        {ep.still_path && (
                                            <div className="detail-page__episode-still">
                                                <img src={imageUrl(ep.still_path) || ''} alt={ep.title || `Episode ${ep.episode_number}`} />
                                            </div>
                                        )}
                                        <div className="detail-page__episode-info" onClick={() => {
                                            if (isEpisodeReleased(ep)) {
                                                if (!ep.watched && hasUnwatchedEpisodesBefore(ep)) {
                                                    setAddEpisodeModal({ isOpen: true, episode: ep })
                                                } else if (!ep.watched) {
                                                    // Mark as watched
                                                    markEpisodeAsWatched(ep, false)
                                                } else {
                                                    // Toggle to unwatched
                                                    markEpisodeAsWatched(ep, false)
                                                }
                                            }
                                        }}>
                                            <div className="detail-page__episode-details">
                                                <strong>{ep.episode_number}{ep.title ? `. ${ep.title}` : ''}</strong>
                                                    <div className="detail-page__episode-meta">
                                                        {ep.air_date && <span>{ep.air_date}</span>}
                                                        {ep.runtime && <span>{ep.runtime} min</span>}
                                                        {isEpisodeReleased(ep) && ep.vote_average && ep.vote_average > 0 && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                    </div>
                                            </div>
                                        </div>
                                        <button 
                                            className="detail-page__episode-ellipsis-btn"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/tv/${id}/season/${ep.season_number}/episode/${ep.episode_number}`)
                                            }}
                                            title="View episode details"
                                        >
                                            <i className="fa-solid fa-ellipsis"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title={confirmModal.isUnwatch ? "Unmark Episode as Watched" : "Mark Episodes as Watched"}
                    message={confirmModal.isUnwatch 
                        ? `Are you sure you want to mark S${confirmModal.episode.season_number}E${confirmModal.episode.episode_number} as unwatched?`
                        : `There are unwatched episodes before S${confirmModal.episode.season_number}E${confirmModal.episode.episode_number}. Do you want to mark all episodes up to this one as watched?`
                    }
                    onConfirm={() => {
                        if (confirmModal.isUnwatch) {
                            markEpisodeAsWatched(confirmModal.episode, false)
                        } else {
                            markEpisodeAsWatched(confirmModal.episode, confirmModal.markAll)
                        }
                        setConfirmModal(null)
                    }}
                    onCancel={() => {
                        setConfirmModal(null)
                    }}
                    confirmText={confirmModal.isUnwatch ? "Unmark" : confirmModal.markAll ? "Mark All" : "Mark This One"}
                    cancelText="Cancel"
                    confirmColor={confirmModal.isUnwatch ? "danger" : "success"}
                    confirmLoading={episodeModalLoading !== null}
                />
            )}
            {removeEpisodeModal && (
                <ConfirmModal
                    isOpen={removeEpisodeModal.isOpen}
                    title="Remove Episode"
                    message={`Are you sure you want to remove S${removeEpisodeModal.episode.season_number}E${removeEpisodeModal.episode.episode_number} from your watched episodes?`}
                    onConfirm={handleRemoveEpisode}
                    onCancel={() => setRemoveEpisodeModal(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                    confirmLoading={modalLoading}
                />
            )}
            {removeWatchlistModal && (
                <ConfirmModal
                    isOpen={removeWatchlistModal.isOpen}
                    title="Remove from Watchlist"
                    message="Are you sure you want to remove this TV show from your watchlist?"
                    onConfirm={handleRemoveFromWatchlist}
                    onCancel={() => setRemoveWatchlistModal(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                    confirmLoading={modalLoading}
                />
            )}
            {markWatchedModal && (
                <ConfirmModal
                    isOpen={markWatchedModal.isOpen}
                    title={markWatchedModal.markAsWatched ? 'Mark as Watched' : 'Mark as Unwatched'}
                    message={markWatchedModal.markAsWatched ? 'Are you sure you want to mark all released episodes as watched?' : 'Are you sure you want to mark all episodes as unwatched?'}
                    onConfirm={async () => {
                        if (!watchlistId || !details) return
                        setModalLoading(true)
                        try {
                            const newWatchedState = markWatchedModal.markAsWatched
                            
                            // Mark/unmark all released episodes in parallel
                            const releasedEpisodes = episodes.filter(ep => isEpisodeReleased(ep))
                            const markPromises = releasedEpisodes.map(ep => {
                                if (newWatchedState) {
                                    return markEpisodeWatched(watchlistId, ep.season_number, ep.episode_number, {
                                        tmdb_episode_id: ep.tmdb_episode_id,
                                        title: ep.title,
                                        still_path: ep.still_path,
                                        overview: ep.overview,
                                        vote_average: ep.vote_average,
                                        air_date: ep.air_date,
                                        runtime: ep.runtime
                                    })
                                } else {
                                    return unmarkEpisodeWatched(watchlistId, ep.season_number, ep.episode_number)
                                }
                            })
                            await Promise.all(markPromises)
                            
                            // Check if all episodes are watched and update status properly
                            await checkAndUpdateCompleted(watchlistId, details.id)
                            
                            // Read the actual status from the store after the check
                            await useLibraryStore.getState().refreshItem(watchlistId)
                            const updatedItem = useLibraryStore.getState().allItems.find(item => item.id === watchlistId)
                            const newStatus = updatedItem?.status || (newWatchedState ? 'completed' : 'planning')
                            
                            // Update the store with the new status (this updates DB + cache + optimistic UI)
                            await useLibraryStore.getState().updateStatus(watchlistId, newStatus)
                            
                            // Update local state
                            setWatchlistStatus(newStatus)
                            
                            // Fire confetti if marking as watched
                            if (newWatchedState) {
                                launchCosmicConfetti()
                            }
                            
                            // Refresh episodes
                            setEpisodes(prev => prev.map(ep => 
                                isEpisodeReleased(ep) ? { ...ep, watched: newWatchedState } : ep
                            ))
                            setMarkWatchedModal(null)
                        } finally {
                            setModalLoading(false)
                        }
                    }}
                    onCancel={() => setMarkWatchedModal(null)}
                    confirmText={markWatchedModal.markAsWatched ? 'Mark as Watched' : 'Mark as Unwatched'}
                    cancelText="Cancel"
                    confirmColor="primary"
                    confirmLoading={modalLoading}
                />
            )}
            {addEpisodeModal && (
                <EpisodeChoiceModal
                    isOpen={addEpisodeModal.isOpen}
                    title="Mark Episode as Watched"
                    message={`There are unwatched episodes before S${addEpisodeModal.episode.season_number}E${addEpisodeModal.episode.episode_number}. Do you want to mark only this episode or all episodes up to this one as watched?`}
                    onMarkAll={async () => {
                        setEpisodeModalLoading('all')
                        try {
                            await markEpisodeAsWatched(addEpisodeModal.episode, true)
                        } finally {
                            setEpisodeModalLoading(null)
                            setAddEpisodeModal(null)
                        }
                    }}
                    onMarkOne={async () => {
                        setEpisodeModalLoading('one')
                        try {
                            await markEpisodeAsWatched(addEpisodeModal.episode, false)
                        } finally {
                            setEpisodeModalLoading(null)
                            setAddEpisodeModal(null)
                        }
                    }}
                    onCancel={() => {
                        setAddEpisodeModal(null)
                    }}
                    loadingAction={episodeModalLoading}
                />
            )}
        </div>
    )
}

export default TVShowDetail
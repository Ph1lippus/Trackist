import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTVDetails, getTVSeasonDetails, imageUrl, imageUrlOriginal, getBestBackdropPath } from '../services/tmdbService'
import { formatStatus } from '../utils/statusUtils'
import { markEpisodeWatched, unmarkEpisodeWatched, markEpisodesWatched, unmarkEpisodesWatched, getWatchedEpisodes, checkAndUpdateCompleted, markShowAsFullyWatched } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { invalidateUserCache, getCachedOrFetch } from '../services/cacheService'
import ConfirmModal from '../components/modals/ConfirmModal'
import EpisodeChoiceModal from '../components/modals/EpisodeChoiceModal'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { createEpisodeDeepLink, openInStremio, createTVDeepLink  } from '../utils/stremioUtils'
import { useShowStremioButton } from '../hooks/useShowStremioButton'
import { useMobile } from '../contexts/useMobile'
import { useAuthStore } from '../stores/useAuthStore'
import stremioIcon from '../assets/stremio-logo-icon-only-fullcolor.svg'

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
    const { showStremioButton, loading: stremioLoading } = useShowStremioButton()
    const { isMobile } = useMobile()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [loading, setLoading] = useState(true)
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
    const [statusChangeModal, setStatusChangeModal] = useState<{ isOpen: boolean } | null>(null)
    const [addEpisodeModal, setAddEpisodeModal] = useState<{
        isOpen: boolean
        episode: LocalEpisode
    } | null>(null)
    const [showCast, setShowCast] = useState(false)
    const [modalLoading, setModalLoading] = useState(false)
    const [episodeModalLoading, setEpisodeModalLoading] = useState<'all' | 'one' | null>(null)

    const watchlistItem = useLibraryStore((state) => state.allItems.find((item) => item.tmdb_id === Number(id)))
    const isInWatchlist = !!watchlistItem
    const watchlistId = watchlistItem?.id ?? null
    const watchlistStatus = watchlistItem?.status ?? null
    const hasUserSelectedSeason = useRef(false)
    const hasAutoPositioned = useRef(false)
    const episodeToScrollRef = useRef<string | null>(null)
    const episodeRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
    const episodeListRef = useRef<HTMLDivElement>(null)

    const isEpisodeReleased = (episode: LocalEpisode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
    }

    const getNextEpisodeToWatch = (): { season: number; episode: number } | null => {
        if (!episodes.length) return null

        const watchedEps = episodes.filter(ep => ep.watched && isEpisodeReleased(ep))
        if (watchedEps.length === 0) return null

        const lastWatched = watchedEps.reduce((max, ep) => {
            if (ep.season_number > max.season_number) return ep
            if (ep.season_number === max.season_number && ep.episode_number > max.episode_number) return ep
            return max
        }, watchedEps[0])

        const episodesInLastSeason = episodes.filter(ep => ep.season_number === lastWatched.season_number)
        const releasedInLastSeason = episodesInLastSeason.filter(ep => isEpisodeReleased(ep))
        const allReleasedWatched = releasedInLastSeason.length > 0 && releasedInLastSeason.every(ep => ep.watched)

        if (allReleasedWatched) {
            const nextSeason = seasons.find(s => s > lastWatched.season_number)
            if (nextSeason) {
                const firstEpOfNextSeason = episodes.find(ep => ep.season_number === nextSeason && isEpisodeReleased(ep))
                if (firstEpOfNextSeason) {
                    return { season: nextSeason, episode: firstEpOfNextSeason.episode_number }
                }
            }
            return null
        }

        const nextEp = episodes.find(ep =>
            ep.season_number === lastWatched.season_number &&
            ep.episode_number === lastWatched.episode_number + 1 &&
            isEpisodeReleased(ep)
        )
        if (nextEp) {
            return { season: nextEp.season_number, episode: nextEp.episode_number }
        }

        return null
    }

    useEffect(() => {
        window.scrollTo(0, 0)
        hasUserSelectedSeason.current = false
        hasAutoPositioned.current = false
        episodeToScrollRef.current = null
    }, [id])

    useEffect(() => {
        if (episodeToScrollRef.current && episodeRefs.current[episodeToScrollRef.current] && !isMobile) {
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
    }, [selectedSeason, episodes, isMobile])

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true)
            if (!id) {
                setLoading(false)
                return
            }
            try {
                const data = await getCachedOrFetch(
                    'tv-details',
                    Number(id),
                    () => getTVDetails(Number(id)),
                    { ttl: 24 * 60 * 60 * 1000, staleWhileRevalidate: true }
                )
                setDetails(data)
                
                // Find trailer from videos
                if (data.videos?.results) {
                    const trailer = data.videos.results.find(
                        (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
                    )
                    if (trailer) setTrailerKey(trailer.key)
                }
            } catch (err) {
                console.error('Failed to load TV show details:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchDetails()
    }, [id])

    // Cache for season data: season_number -> episodes array
    const seasonCache = useRef<Map<number, LocalEpisode[]>>(new Map())
    const watchedKeysCache = useRef<Set<string>>(new Set())

    // Precompute watched info for current season


    const loadSeason = async (seasonNumber: number) => {
        if (!id || !details) return
        
        // Return cached if available
        if (seasonCache.current.has(seasonNumber)) {
            setEpisodes(seasonCache.current.get(seasonNumber)!)
            return
        }

        try {
            const seasonData = await getTVSeasonDetails(Number(id), seasonNumber)
            const sEpisodes = seasonData.episodes || []
            const seasonEpisodes: LocalEpisode[] = []
            
            for (const ep of sEpisodes) {
                const key = `${seasonNumber}-${ep.episode_number}`
                seasonEpisodes.push({
                    id: `${id}-${seasonNumber}-${ep.episode_number}`,
                    season_number: seasonNumber,
                    episode_number: ep.episode_number,
                    tmdb_episode_id: ep.id,
                    title: ep.name,
                    still_path: ep.still_path ?? undefined,
                    overview: ep.overview,
                    vote_average: ep.vote_average,
                    air_date: ep.air_date,
                    runtime: ep.runtime,
                    watched: watchedKeysCache.current.has(key)
                })
            }
            
            seasonCache.current.set(seasonNumber, seasonEpisodes)
            setEpisodes(seasonEpisodes)
        } catch (err) {
            console.error('Failed to load season:', err)
        }
    }

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
                if (isInWatchlist && watchlistId) {
                    const watchedEps = await getWatchedEpisodes(watchlistId)
                    watchedKeysCache.current = new Set(
                        watchedEps.map(ep => `${ep.season_number}-${ep.episode_number}`)
                    )
                } else {
                    watchedKeysCache.current = new Set()
                }

                // Find last watched episode directly from watchedKeysCache
                let lastWatched: { season_number: number; episode_number: number } | null = null
                for (const key of watchedKeysCache.current) {
                    const parts = key.split('-')
                    const s = Number(parts[0])
                    const e = Number(parts[1])
                    if (lastWatched === null || s > lastWatched.season_number || (s === lastWatched.season_number && e > lastWatched.episode_number)) {
                        lastWatched = { season_number: s, episode_number: e }
                    }
                }

                let targetSeason = seasonList[0] || 1
                let targetEpisode = 1
                let scrollTarget: string | null = null

                if (lastWatched) {
                    targetSeason = lastWatched.season_number
                    targetEpisode = lastWatched.episode_number
                    scrollTarget = `${id}-${targetSeason}-${targetEpisode}`

                    // Load the last watched season to check if all released episodes are watched
                    await loadSeason(targetSeason)
                    const seasonEps = seasonCache.current.get(targetSeason) || []
                    const allReleasedInSeasonWatched = seasonEps.filter(ep => isEpisodeReleased(ep)).every(ep => ep.watched)

                    // If all released episodes in the season are watched, go to next season
                    if (allReleasedInSeasonWatched) {
                        const nextSeasonIndex = seasonList.indexOf(targetSeason) + 1
                        if (nextSeasonIndex < seasonList.length) {
                            targetSeason = seasonList[nextSeasonIndex]
                            await loadSeason(targetSeason)
                            const nextSeasonEps = seasonCache.current.get(targetSeason) || []
                            const firstReleasedEp = nextSeasonEps.find(ep => isEpisodeReleased(ep))
                            if (firstReleasedEp) {
                                targetEpisode = firstReleasedEp.episode_number
                                scrollTarget = `${id}-${targetSeason}-${targetEpisode}`
                            } else {
                                scrollTarget = null
                            }
                        }
                    }
                } else {
                    // No watched episodes, load first valid season
                    await loadSeason(targetSeason)
                }

                setSelectedSeason(targetSeason)
                episodeToScrollRef.current = scrollTarget
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
        }
        loadEpisodes()
    }, [details, id, isInWatchlist, watchlistId])

    const handleAddToWatchlist = async () => {
        const user = useAuthStore.getState().user
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
            
            // Reset all episode watched states since the show is no longer in the watchlist
            setEpisodes(prev => prev.map(ep => ({ ...ep, watched: false })))
            setRemoveWatchlistModal(null)
        } finally {
            setModalLoading(false)
        }
    }
    const handleSeasonChange = async (season: number) => {
        hasUserSelectedSeason.current = true
        setSelectedSeason(season)
        await loadSeason(season)
    }

    const hasUnwatchedEpisodesBefore = (episode: LocalEpisode): boolean => {
        // For current season only (lazy-loaded)
        if (episode.season_number === selectedSeason) {
            return episodes.some(ep => 
                ep.season_number === selectedSeason && 
                ep.episode_number < episode.episode_number && 
                !ep.watched
            )
        }
        // For other seasons, check if any earlier season has unwatched episodes
        const seasonIndex = seasons.indexOf(episode.season_number)
        if (seasonIndex > 0) {
            const earlierSeasons = seasons.slice(0, seasonIndex)
            return earlierSeasons.some(s => {
                const cached = seasonCache.current.get(s)
                return cached ? cached.some(ep => !ep.watched) : true // Assume unwatched if not cached
            })
        }
        return false
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
                const success = await markEpisodesWatched(watchlistId, episodesToMark)
                if (!success) throw new Error('Failed to mark episodes as watched')

                void (async () => {
                    try {
                        await checkAndUpdateCompleted(watchlistId, details.id)
                        await useLibraryStore.getState().refreshItem(watchlistId)
                        await checkMilestoneAndCelebrate(watchlistStatus)
                    } catch (syncError) {
                        console.error('Failed to synchronize progress after marking episodes:', syncError)
                    }
                })()
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

            const success = await unmarkEpisodesWatched(watchlistId, [episode])
            if (!success) {
                setEpisodes(prev => prev.map(ep => 
                    ep.id === episode.id ? { ...ep, watched: true } : ep
                ))
                return
            }

            // The row is removed, so finish the modal immediately. Progress/status
            // synchronization can continue without blocking the user's next action.
            setRemoveEpisodeModal(null)
            setModalLoading(false)

            void (async () => {
                try {
                    await checkAndUpdateCompleted(watchlistId, details.id)
                    await useLibraryStore.getState().refreshItem(watchlistId)
                    await invalidateUserCache()
                } catch (syncError) {
                    console.error('Failed to synchronize progress after removing episode:', syncError)
                }
            })()
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
        return <div className="detail-page-loading" aria-live="polite">Loading TV show...</div>
    }

    if (!details) {
        return <div className="detail-page-error">TV Show not found</div>
    }

    const backdropUrl = isMobile ? imageUrl(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null, "w1280") : imageUrlOriginal(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null)
    const logoUrl = getLogoUrl()
    const title = details?.name || ''
    const firstYear = details?.first_air_date?.slice(0, 4) || ''
    const lastYear = details?.last_air_date?.slice(0, 4) || ''
    const year = firstYear
    ? (details?.status === 'Ended' || details?.status === 'Canceled'
        ? (lastYear && lastYear !== firstYear ? `${firstYear}-${lastYear}` : firstYear)
        : `${firstYear}-`)
    : ''
    const rating = details?.vote_average?.toFixed(1)
    const ageRating = getAgeRating()
    const overview = details?.overview || 'No description available.'
    const genres = details?.genres || []
    const cast = (details?.credits?.cast || [])
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
                    <img src={backdropUrl} alt={title} loading="lazy" />
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
                            
                            {isInWatchlist && watchlistStatus && (
                                <div className="detail-page__status">
                                    <span className="detail-page__status-label">Status:</span>
                                    <span className="detail-page__status-value">{formatStatus(watchlistStatus || "").label}</span>
                                </div>
                            )}
                            
                            <div className={isMobile ? `detail-page__actions-mobile` : `detail-page__actions`}>
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
                                                const markAsWatched = watchlistStatus !== 'completed' && watchlistStatus !== 'caught_up'
                                                setMarkWatchedModal({ isOpen: true, markAsWatched })
                                            }}
                                            disabled={isUpdatingStatus || modalLoading}
                                            title={(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? 'Mark as Unwatched' : 'Mark as Watched'}
                                        >
                                            <i className={(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? 'fa-solid fa-eye-slash' :'fa-solid fa-eye'}></i>
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => setStatusChangeModal({ isOpen: true })}
                                            disabled={isUpdatingStatus || modalLoading}
                                            title="Change Status"
                                        >
                                            <i className="fa-solid fa-ellipsis"></i>
                                        </button>
                                    </>
                                )}
                                {trailerKey && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => {
                                            if (isMobile) {
                                                window.open(`https://www.youtube.com/watch?v=${trailerKey}`, '_blank')
                                            } else {
                                                setShowTrailer(!showTrailer)
                                            }
                                        }}
                                        title={showTrailer && !isMobile ? 'Close Trailer' : 'Watch Trailer'}
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
                                 {showStremioButton && !stremioLoading && (
                                     <button
                                         className="detail-page__icon-btn"
                                          onClick={async () => {
                                              if (!details) return
                                              let nextEp = getNextEpisodeToWatch()

                                             if (!nextEp && details) {
                                                 const watchedEps = episodes.filter(ep => ep.watched && isEpisodeReleased(ep))
                                                 if (watchedEps.length > 0) {
                                                     const lastWatched = watchedEps.reduce((max, ep) => {
                                                         if (ep.season_number > max.season_number) return ep
                                                         if (ep.season_number === max.season_number && ep.episode_number > max.episode_number) return ep
                                                         return max
                                                     }, watchedEps[0])

                                                     const nextSeason = seasons.find(s => s > lastWatched.season_number)
                                                     if (nextSeason) {
                                                         await loadSeason(nextSeason)
                                                         const nextSeasonEps = seasonCache.current.get(nextSeason) || []
                                                         const firstReleased = nextSeasonEps.find(ep => isEpisodeReleased(ep))
                                                         if (firstReleased) {
                                                             nextEp = { season: nextSeason, episode: firstReleased.episode_number }
                                                         }
                                                     }
                                                 } else if (seasons.length > 0) {
                                                     const firstSeason = seasons[0]
                                                     const firstSeasonEps = seasonCache.current.get(firstSeason) || []
                                                     if (firstSeasonEps.length === 0) {
                                                         await loadSeason(firstSeason)
                                                     }
                                                     const loadedEps = seasonCache.current.get(firstSeason) || []
                                                     const firstReleased = loadedEps.find(ep => isEpisodeReleased(ep))
                                                     if (firstReleased) {
                                                         nextEp = { season: firstSeason, episode: firstReleased.episode_number }
                                                     }
                                                 }
                                             }

                                             const sharingLink = nextEp
                                                 ? createEpisodeDeepLink(details.id, nextEp.season, nextEp.episode, details.external_ids?.imdb_id)
                                                 : createTVDeepLink(details.id, details.external_ids?.imdb_id)
                                             openInStremio(sharingLink)
                                         }}
                                         title="Open in Stremio"
                                     >
                                         <img src={stremioIcon} alt="Stremio" className="detail-page__stremio-logo" />
                                     </button>
                                 )}
                            </div>

                            {/* Action buttons (desktop inline / mobile fixed sidebar) */}
                            {!isMobile && showTrailer && trailerKey && (
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
                                        {cast.map((c: { id: number; name: string; profile_path?: string | null; character: string; order: number }) => (
                                            <div 
                                                key={c.id} 
                                                className="detail-page__cast-item"
                                                onClick={() => navigate(`/person/${c.id}`)}
                                            >
                                                {c.profile_path && (
                                                    <img 
                                                        className="detail-page__cast-photo" 
                                                        src={imageUrl(c.profile_path, 'w185') ?? ''} 
                                                        alt={c.name ?? ''}
                                                        loading="lazy"
                                                    />
                                                )}
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
                                                <img src={imageUrl(ep.still_path, 'w300') || ''} alt={ep.title || `Episode ${ep.episode_number}`} loading="lazy" />
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
                                                <strong>{!isMobile && <>{ep.episode_number}{ep.title ? '. ' : ''}</>}{ep.title}</strong>
                                                    <div className="detail-page__episode-meta">
                                                        {ep.air_date && <span>{ep.air_date}</span>}
                                                        {ep.runtime && <span>{ep.runtime} min</span>}
                                                        {!isMobile && isEpisodeReleased(ep) && ep.vote_average && ep.vote_average > 0 && <span>★ {ep.vote_average.toFixed(1)}</span>}
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
                            
                            // Mark/unmark all released episodes in batches
                            const releasedEpisodes = episodes.filter(ep => isEpisodeReleased(ep))
                            const success = newWatchedState
                                ? await markEpisodesWatched(watchlistId, releasedEpisodes)
                                : await unmarkEpisodesWatched(watchlistId, releasedEpisodes)
                            if (!success) throw new Error('Failed to update episodes')

                            setEpisodes(prev => prev.map(ep => 
                                isEpisodeReleased(ep) ? { ...ep, watched: newWatchedState } : ep
                            ))
                            setMarkWatchedModal(null)

                            void (async () => {
                                try {
                                    await checkAndUpdateCompleted(watchlistId, details.id)
                                    await useLibraryStore.getState().refreshItem(watchlistId)
                                    if (newWatchedState) {
                                        launchCosmicConfetti()
                                    }
                                } catch (syncError) {
                                    console.error('Failed to synchronize progress after updating episodes:', syncError)
                                }
                            })()
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
            {statusChangeModal && (
                <ConfirmModal
                    isOpen={statusChangeModal.isOpen}
                    title="Change Status"
                    message="Choose a new status for this TV show. Watching and paused shows will appear in your TV shows list, while dropped shows will appear in your finished list."
                    onConfirm={() => {}}
                    onCancel={() => setStatusChangeModal(null)}
                    confirmText=""
                    cancelText=""
                    confirmColor="success"
                    customContent={
                        <div className="confirm-modal-actions" style={{ gap: '0.5rem' }}>
                            {watchlistStatus !== 'watching' && (
                                <button
                                    onClick={async () => {
                                        if (!watchlistId) return
                                        setModalLoading(true)
                                        try {
                                            await useLibraryStore.getState().updateStatus(watchlistId, 'watching')
                                            setStatusChangeModal(null)
                                        } catch (err) {
                                            console.error('Failed to update status:', err)
                                        } finally {
                                            setModalLoading(false)
                                        }
                                    }}
                                    disabled={modalLoading}
                                    className="confirm-modal-btn"
                                    style={{
                                        borderColor: 'rgba(104, 255, 174, 0.3)',
                                        color: '#68ffae',
                                        opacity: modalLoading ? 0.5 : 1,
                                        cursor: modalLoading ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {modalLoading ? 'Updating...' : 'Watching'}
                                </button>
                            )}
                            {watchlistStatus !== 'paused' && (
                            <button
                                onClick={async () => {
                                    if (!watchlistId) return
                                    setModalLoading(true)
                                    try {
                                        await useLibraryStore.getState().updateStatus(watchlistId, 'paused')
                                        setStatusChangeModal(null)
                                    } catch (err) {
                                        console.error('Failed to update status:', err)
                                    } finally {
                                        setModalLoading(false)
                                    }
                                }}
                                disabled={modalLoading}
                                className="confirm-modal-btn"
                                style={{
                                    borderColor: 'rgba(245, 158, 11, 0.3)',
                                    color: '#f59e0b',
                                    opacity: modalLoading ? 0.5 : 1,
                                    cursor: modalLoading ? 'not-allowed' : 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    if (!modalLoading) {
                                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)'
                                        e.currentTarget.style.borderColor = '#f59e0b'
                                        e.currentTarget.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.3)'
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!modalLoading) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                        e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)'
                                        e.currentTarget.style.boxShadow = 'none'
                                    }
                                }}
                            >
                                {modalLoading ? 'Updating...' : 'Paused'}
                            </button>
                            )}
                            {watchlistStatus !== 'dropped' && (
                            <button
                                onClick={async () => {
                                    if (!watchlistId) return
                                    setModalLoading(true)
                                    try {
                                        await useLibraryStore.getState().updateStatus(watchlistId, 'dropped')
                                        setStatusChangeModal(null)
                                    } catch (err) {
                                        console.error('Failed to update status:', err)
                                    } finally {
                                        setModalLoading(false)
                                    }
                                }}
                                disabled={modalLoading}
                                className="confirm-modal-btn"
                                style={{
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    color: '#ef4444',
                                    opacity: modalLoading ? 0.5 : 1,
                                    cursor: modalLoading ? 'not-allowed' : 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    if (!modalLoading) {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
                                        e.currentTarget.style.borderColor = '#ef4444'
                                        e.currentTarget.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.3)'
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!modalLoading) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                                        e.currentTarget.style.boxShadow = 'none'
                                    }
                                }}
                            >
                                {modalLoading ? 'Updating...' : 'Dropped'}
                            </button>
                            )}
                        </div>
                    }
                />
            )}
        </div>
    )
}

export default TVShowDetail





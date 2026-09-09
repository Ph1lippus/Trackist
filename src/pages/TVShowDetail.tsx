import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { getTVDetails, getTVSeasonDetails, getTVSeasonCredits, imageUrl, imageUrlOriginal, getBestBackdropPath, getBestPoster, isNoLanguageCode } from '../services/tmdbService'
import { formatStatus } from '../utils/statusUtils'

import { getReleaseIndex, getShowAirSchedule, isEpisodeAired } from '../services/tvmazeService'
import { getUTCTodayString } from '../utils/dateUtils'
import { markEpisodeWatched, unmarkEpisodeWatched, markEpisodesWatched, unmarkEpisodesWatched, recomputeDenormalizedFields, getWatchedEpisodes, checkAndUpdateCompleted, markShowAsFullyWatched, removeAllWatchedEpisodes } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { invalidateUserCache, getCachedOrFetch } from '../services/cacheService'
import ConfirmModal from '../components/modals/ConfirmModal'
import EpisodeChoiceModal from '../components/modals/EpisodeChoiceModal'
import type { TMDBResult, WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { launchCosmicConfetti } from '../utils/cosmicConfetti'
import { createEpisodeDeepLink, openInStremio, createTVDeepLink  } from '../utils/stremioUtils'
import { curateCast } from '../utils/castUtils'
import { useShowStremioButton } from '../hooks/useShowStremioButton'
import { useShowTmdbButton } from '../hooks/useShowTmdbButton'
import { useMobile } from '../contexts/useMobile'
import { useAuthStore } from '../stores/useAuthStore'
import { AlignLeft, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Ellipsis, Eye, EyeOff, Users, X } from 'lucide-react'
import stremioIcon from '../assets/stremio-logo-icon-only-fullcolor.svg'
import tmdbLogo from '../assets/CompactTMDB.svg'
import ShareButton from '../components/media/ShareButton'
import CastList, { type CastMember } from '../components/CastList'
import { useDetailSidebar } from '../hooks/useDetailSidebar'
import { useIsActiveDetail } from '../hooks/useActiveDetail'
import useDetailModalStore from '../stores/detailModalStore'

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

interface TVShowDetailProps {
    itemId?: number
    onLoaded?: () => void
}

const normalizeEpisodeScore = (value?: number | null): number | undefined => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return undefined
    return value
}

const TVShowDetail: React.FC<TVShowDetailProps> = ({ itemId: propId, onLoaded }) => {
    const { id: paramId } = useParams<{ id: string }>()
    const id = propId?.toString() ?? paramId
    const navigate = useNavigate()
    const isInModal = useDetailModalStore((s) => s.isOpen)
    const { showStremioButton, loading: stremioLoading } = useShowStremioButton()
    const { showTmdbButton, loading: tmdbLoading } = useShowTmdbButton()
    const { isMobile } = useMobile()
    const { isOpen: isSidebarOpen } = useDetailSidebar()
    const isActiveDetail = useIsActiveDetail('tv', id)
    const [details, setDetails] = useState<TMDBResult | null>(null)
    usePageTitle(details?.name ? `${details.name} - Track1st` : 'Track1st - TV Show Detail')
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<LocalEpisode[]>([])
    // Seed synchronously so the very first render already lands correctly: the
    // remembered season when returning from an episode modal, otherwise the
    // watchlist's stored current_season ("where we are") instead of a season-1
    // flash. Falls back to 0 (spinner) when the show isn't in the watchlist yet.
    const [selectedSeason, setSelectedSeason] = useState<number>(() => {
        const numId = Number(id)
        if (!Number.isFinite(numId) || numId <= 0) return 0
        const item = useLibraryStore.getState().allItems.find((i) => i.tmdb_id === numId)
        // Paused / dropped shows should always open at the user's last-watched
        // season (current_season), not wherever they happened to be browsing.
        if (item && (item.status === 'paused' || item.status === 'dropped')) {
            return item.current_season ?? 0
        }
        const remembered = useDetailModalStore.getState().getRememberedSeason(numId)
        if (remembered != null) return remembered
        return item?.current_season ?? 0
    })
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
    const [showDescription, setShowDescription] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [modalLoading, setModalLoading] = useState(false)
    const [backdropPainted, setBackdropPainted] = useState(false)
    const [episodeModalLoading, setEpisodeModalLoading] = useState<'all' | 'one' | null>(null)

    const openExternal = (url: string) => {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    const watchlistItem = useLibraryStore((state) => state.allItems.find((item) => item.tmdb_id === Number(id)))
    const isLibraryInitialized = useLibraryStore((state) => state.isInitialized)
    const isInWatchlist = !!watchlistItem
    const watchlistId = watchlistItem?.id ?? null
    const watchlistStatus = watchlistItem?.status ?? null
    const hasStarted = (watchlistItem?.watched_episodes_count ?? 0) > 0
    const hasUserSelectedSeason = useRef(false)
    const [scrollTarget, setScrollTarget] = useState<string | null>(null)
    const episodeRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
    const episodeListRef = useRef<HTMLDivElement>(null)
    const seasonDropdownRef = useRef<HTMLDivElement>(null)
    const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false)
    const fetchActiveRef = useRef(true)

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(e.target as Node)) {
                setSeasonDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Exact air-time index ("${season}-${episode}" -> release ms) from TVmaze,
    // so today's episodes aren't watchable until they really air. Null while
    // resolving -> isEpisodeReleased falls back to the date-only rule.
    const [releaseIndex, setReleaseIndex] = useState<Map<string, number> | null>(null)

    useEffect(() => {
        if (!id) return
        let cancelled = false
        void getShowAirSchedule(Number(id))
            .then(schedule => {
                if (!cancelled) setReleaseIndex(getReleaseIndex(schedule))
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [id])

    const isEpisodeReleased = (episode: LocalEpisode): boolean => {
        if (!releaseIndex) {
            // TVmaze data still resolving (or unavailable): date-only fallback.
            if (!episode.air_date) return false
            return episode.air_date <= getUTCTodayString()
        }
        return isEpisodeAired(releaseIndex, episode.season_number, episode.episode_number, episode.air_date)
    }

    const getEpisodeLocalAirDate = (ep: LocalEpisode): string => {
        if (releaseIndex) {
            const ts = releaseIndex.get(`${ep.season_number}-${ep.episode_number}`)
            if (ts !== undefined) {
                const date = new Date(ts)
                if (!Number.isNaN(date.getTime())) {
                    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                }
            }
        }
        return ep.air_date || ''
    }

    const getResumeEpisodeToWatch = async (): Promise<{ season: number; episode: number } | null> => {
        const watchedKeys = watchedKeysCache.current

        // No progress at all -> fall back to first released episode of first season (S1E1)
        if (watchedKeys.size === 0) {
            if (!seasons.length) return null
            const first = seasons[0]
            const eps = await ensureSeasonLoaded(first)
            const released = eps.find(isEpisodeReleased)
            return released ? { season: first, episode: released.episode_number } : null
        }

        // Last watched episode across the whole show
        let last: { season: number; episode: number } | null = null
        for (const key of watchedKeys) {
            const [s, e] = key.split('-').map(Number)
            if (!last || s > last.season || (s === last.season && e > last.episode)) last = { season: s, episode: e }
        }
        if (!last) return null

        const sEps = await ensureSeasonLoaded(last.season)
        const releasedInSeason = sEps.filter(isEpisodeReleased)

        // Next released episode in the same season (e.g. S2E4 watched -> S2E5)
        const nextInSeason = releasedInSeason.find(ep => ep.episode_number === last!.episode + 1)
        if (nextInSeason) return { season: last.season, episode: nextInSeason.episode_number }

        // Current season still has (unreleased) later episodes -> nothing to resume now
        const hasLaterInSeason = sEps.some(ep => ep.episode_number > last!.episode)
        if (hasLaterInSeason) return null

        // Current season complete -> advance to next season's first released episode
        const idx = seasons.indexOf(last.season)
        for (let i = idx + 1; i < seasons.length; i++) {
            const neps = await ensureSeasonLoaded(seasons[i])
            const firstReleased = neps.find(isEpisodeReleased)
            if (firstReleased) return { season: seasons[i], episode: firstReleased.episode_number }
        }
        return null
    }

    

    useEffect(() => {
        if (!scrollTarget || isMobile) return
        const parts = scrollTarget.split('-')
        const scrollSeason = parts[1] ? Number(parts[1]) : NaN
        if (Number.isNaN(scrollSeason) || scrollSeason !== selectedSeason) {
            setScrollTarget(null)
            return
        }

        // The target season's episodes may not be in the DOM yet on the very
        // first pass (they load async and the refs attach in a later commit),
        // so retry across frames until the target row exists instead of letting
        // the attempt silently drop. Bound it so a never-matching target can't
        // spin forever.
        let attempts = 0
        let rafId = 0

        const tryScroll = () => {
            const targetElement = episodeRefs.current[scrollTarget]
            const container = episodeListRef.current
            if (targetElement && container) {
                const containerRect = container.getBoundingClientRect()
                const targetRect = targetElement.getBoundingClientRect()
                container.scrollTo({
                    top: container.scrollTop + (targetRect.top - containerRect.top),
                    behavior: 'auto'
                })
                setScrollTarget(null)
                return
            }
            attempts += 1
            if (attempts >= 30) {
                setScrollTarget(null)
                return
            }
            rafId = requestAnimationFrame(tryScroll)
        }

        rafId = requestAnimationFrame(tryScroll)
        return () => cancelAnimationFrame(rafId)
    }, [scrollTarget, selectedSeason, episodes, isMobile])

    const fetchDetails = useCallback(async () => {
        setLoading(true)
        setError(null)
        if (!id) {
            setLoading(false)
            return
        }
        const numericId = Number(id)
        if (!Number.isFinite(numericId) || numericId <= 0) {
            console.warn('[TVShowDetail] invalid id from route:', id)
            setLoading(false)
            return
        }
        try {
            const data = await getCachedOrFetch(
                'tv-details-v3',
                numericId,
                () => getTVDetails(numericId),
                { ttl: 30 * 60 * 1000, staleWhileRevalidate: true }
            )
            if (!fetchActiveRef.current) return
            setDetails(data)

            const videos = (data.videos?.results || []).filter((v: { type?: string; site?: string; key?: string }) => v && typeof v === 'object')
            const trailer = videos.find(
                (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
            )
            if (trailer) setTrailerKey(trailer.key)
        } catch (err) {
            if (!fetchActiveRef.current) return
            console.error('[TVShowDetail] failed to load TV show details:', id, err)
            setError('Failed to load TV show details. Please try again.')
        } finally {
            if (fetchActiveRef.current) setLoading(false)
        }
    }, [id])

    useEffect(() => {
        fetchActiveRef.current = true
        void fetchDetails()
        return () => {
            fetchActiveRef.current = false
        }
    }, [fetchDetails])

    // Signal the overlay that the page content is ready so its reveal curtain
    // can lift. In modal mode this fires once data is loaded. In routed mode
    // the full-screen cover also waits for the backdrop image to paint, so the
    // reveal shows the backdrop across the whole screen (navbar + page) at once.
    useEffect(() => {
        if (isInModal) {
            if (!loading) onLoaded?.()
            return
        }
        if (loading) return
        const heroPoster = isMobile ? getBestPoster(details?.images?.posters) : null
        const url = heroPoster
            ? imageUrlOriginal(heroPoster)
            : imageUrlOriginal(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null)
        if (!url || backdropPainted) onLoaded?.()
    }, [loading, isInModal, isMobile, details, backdropPainted, onLoaded])

    // Push backdrop URL to the overlay store when in modal so it renders outside the scroll container
    useEffect(() => {
        if (!isInModal || !details) return
        const heroPoster = isMobile ? getBestPoster(details?.images?.posters) : null
        const url = heroPoster
            ? imageUrlOriginal(heroPoster)
            : imageUrlOriginal(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null)
        useDetailModalStore.getState().setBackdropUrl(url)
        return () => { useDetailModalStore.getState().setBackdropUrl(null) }
    }, [isInModal, details, isMobile])
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
                    vote_average: normalizeEpisodeScore(ep.vote_average),
                    air_date: ep.air_date,
                    runtime: ep.runtime,
                    watched: watchedKeysCache.current.has(key)
                })
            }
            
            // Check if this season has any released episodes using TVmaze airstamps.
            const hasReleased = releaseIndex && releaseIndex.size > 0
                ? seasonEpisodes.some(ep => isEpisodeAired(releaseIndex, seasonNumber, ep.episode_number, ep.air_date))
                : seasonEpisodes.some(ep => !!ep.air_date && ep.air_date <= getUTCTodayString())
            if (!hasReleased && seasonEpisodes.length > 0) {
                // Hide not-yet-started seasons (resume UX), but never leave the
                // page empty: a brand-new show whose first episode airs soon must
                // keep its season so the unreleased episode list is visible.
                let keepSeason = false
                setSeasons(prev => {
                    if (prev.length <= 1) {
                        keepSeason = true
                        return prev
                    }
                    const updated = prev.filter(s => s !== seasonNumber)
                    // Auto-select another season if the removed one was selected
                    if (updated.length > 0 && selectedSeason === seasonNumber) {
                        const idx = prev.indexOf(seasonNumber)
                        const fallback = updated[Math.min(idx, updated.length - 1)]
                        setSelectedSeason(fallback)
                        // Load the fallback season
                        loadSeason(fallback)
                    }
                    return updated
                })
                if (!keepSeason) return
            }
            
            seasonCache.current.set(seasonNumber, seasonEpisodes)
            setEpisodes(seasonEpisodes)
        } catch (err) {
            console.error('Failed to load season:', err)
        }
    }

    const ensureSeasonLoaded = async (seasonNumber: number): Promise<LocalEpisode[]> => {
        if (seasonCache.current.has(seasonNumber)) return seasonCache.current.get(seasonNumber)!
        if (!id || !details) return []
        try {
            const seasonData = await getTVSeasonDetails(Number(id), seasonNumber)
            const sEpisodes = seasonData.episodes || []
            const seasonEpisodes: LocalEpisode[] = sEpisodes.map(ep => ({
                id: `${id}-${seasonNumber}-${ep.episode_number}`,
                season_number: seasonNumber,
                episode_number: ep.episode_number,
                tmdb_episode_id: ep.id,
                title: ep.name,
                still_path: ep.still_path ?? undefined,
                overview: ep.overview,
                vote_average: normalizeEpisodeScore(ep.vote_average),
                air_date: ep.air_date,
                runtime: ep.runtime,
                watched: watchedKeysCache.current.has(`${seasonNumber}-${ep.episode_number}`),
            }))
            seasonCache.current.set(seasonNumber, seasonEpisodes)
            return seasonEpisodes
        } catch (err) {
            console.error('Failed to load season:', err)
            return []
        }
    }

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!details || !id || !isLibraryInitialized) return
            
            try {
                // Filter out seasons with 0 episodes.
                const seasonList = (details.seasons || [])
                    .filter((s: { season_number: number; episode_count?: number }) => 
                        s.season_number > 0 &&
                        (s.episode_count === undefined || s.episode_count > 0)
                    )
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

                // Get watched episodes from DB (these are episodes in watchlist_episodes table).
                // This must run before any season is loaded so episodes show the correct
                // watched state, including when restoring a remembered season below.
                if (isInWatchlist && watchlistId) {
                    const watchedEps = await getWatchedEpisodes(watchlistId)
                    watchedKeysCache.current = new Set(
                        watchedEps.map(ep => `${ep.season_number}-${ep.episode_number}`)
                    )
                } else {
                    watchedKeysCache.current = new Set()
                }

                // Restore the season the user was on (remembered across any navigations
                // within this session) instead of re-computing from progress. This keeps
                // them exactly where they were when they left the detail.
                // Paused / dropped shows skip the remembered season so they always
                // open at the user's last-watched position (current_season).
                const rememberedSeason = useDetailModalStore.getState().getRememberedSeason(Number(id))
                const isPausedOrDropped = watchlistStatus === 'paused' || watchlistStatus === 'dropped'
                if (!isPausedOrDropped && rememberedSeason != null && seasonList.includes(rememberedSeason)) {
                    setSelectedSeason(rememberedSeason)
                    await loadSeason(rememberedSeason)

                    // Compute scroll target for the remembered season: last watched
                    // released episode, or first unwatched released episode.
                    const seasonEps = seasonCache.current.get(rememberedSeason) || []
                    const lastWatchedInSeason = [...seasonEps]
                        .filter(ep => ep.watched && isEpisodeReleased(ep))
                        .sort((a, b) => b.episode_number - a.episode_number)[0]
                    const firstUnwatchedReleased = seasonEps
                        .filter(ep => !ep.watched && isEpisodeReleased(ep))
                        .sort((a, b) => a.episode_number - b.episode_number)[0]
                    const targetEp = lastWatchedInSeason || firstUnwatchedReleased
                    if (targetEp) {
                        setScrollTarget(`${id}-${rememberedSeason}-${targetEp.episode_number}`)
                    }

                    return
                }

                // Use stored progress before querying watched episodes so Season 1
                // is never rendered for shows the user has already started. "The
                // season we are in" is the watchlist's current_season.
                const storedSeason = watchlistItem?.current_season
                const initialSeason = storedSeason && seasonList.includes(storedSeason)
                    ? storedSeason
                    : seasonList[0] || 1
                setSelectedSeason(initialSeason)

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

                let targetSeason = storedSeason && seasonList.includes(storedSeason)
                    ? storedSeason
                    : seasonList[0] || 1
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
                useDetailModalStore.getState().setRememberedSeason(Number(id), targetSeason)
                setScrollTarget(scrollTarget)
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
        }
        loadEpisodes()
    }, [details, id, isInWatchlist, watchlistId, isLibraryInitialized])

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
        if (id) useDetailModalStore.getState().setRememberedSeason(Number(id), season)
        await loadSeason(season)
    }

    // Open the episode detail sub-modal while ensuring the currently selected
    // season is remembered, so returning from the episode restores it.
    const openEpisodeModal = (rowSeason: number, rowEpisode: number) => {
        if (!id) return
        const numId = Number(id)
        useDetailModalStore.getState().setRememberedSeason(numId, selectedSeason || rowSeason)
        useDetailModalStore.getState().open('episode', numId, rowSeason, rowEpisode)
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
            const logos = details.images.logos as Array<{ file_path: string; width?: number; height?: number; vote_average?: number; vote_count?: number; iso_639_1?: string | null }>
            const sorted = [...logos].sort((a, b) => {
                const aRes = (a.width ?? 0) * (a.height ?? 0)
                const bRes = (b.width ?? 0) * (b.height ?? 0)
                if (bRes !== aRes) return bRes - aRes
                const aVote = a.vote_average ?? 0
                const bVote = b.vote_average ?? 0
                if (bVote !== aVote) return bVote - aVote
                const aCount = a.vote_count ?? 0
                const bCount = b.vote_count ?? 0
                if (bCount !== aCount) return bCount - aCount
                return 0
            })
            const english = sorted.find(l => l.iso_639_1 === 'en')
            if (english) return imageUrlOriginal(english.file_path)
            const noLang = sorted.find(l => isNoLanguageCode(l.iso_639_1))
            if (noLang) return imageUrlOriginal(noLang.file_path)
            if (sorted[0]) return imageUrlOriginal(sorted[0].file_path)
            return null
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

    /**
     * Compute the next episode to watch using season data already cached in the
     * component (seasonCache / watchedKeysCache), so we avoid the TMDB-heavy
     * getNextEpisodeToWatch lookup on the hot path. `extraWatched` contains keys
     * that are about to be marked by the current operation (so they aren't
     * treated as gaps). Seasons that aren't cached are loaded on demand (at most
     * the single next season), which is still cheaper than the old full scan.
     */
    const computeNextEpisodeForMutation = async (
        afterSeason: number,
        afterEpisode: number,
        extraWatched: Set<string> = new Set()
    ): Promise<{ season_number: number; episode_number: number } | null | undefined> => {
        const isWatched = (s: number, e: number) =>
            watchedKeysCache.current.has(`${s}-${e}`) || extraWatched.has(`${s}-${e}`)
        const ordered = [...seasons].sort((a, b) => a - b)
        const startIdx = ordered.indexOf(afterSeason)

        // Use ONLY seasons already cached in seasonCache. Never call TMDB (e.g.
        // ensureSeasonLoaded) on this critical path, or the modal spinner would
        // block on a network round-trip. If a required season isn't cached we
        // return undefined so the caller can defer the next-episode lookup.
        const same = seasonCache.current.get(afterSeason)
        if (same) {
            const nextInSame = same
                .filter(ep => ep.episode_number > afterEpisode && isEpisodeReleased(ep) && !isWatched(afterSeason, ep.episode_number))
                .sort((a, b) => a.episode_number - b.episode_number)[0]
            if (nextInSame) return { season_number: afterSeason, episode_number: nextInSame.episode_number }
        } else if (startIdx !== -1) {
            // The anchored season exists in the show but isn't cached -> defer.
            return undefined
        }

        for (let i = (startIdx === -1 ? 0 : startIdx + 1); i < ordered.length; i++) {
            const s = ordered[i]
            const eps = seasonCache.current.get(s)
            if (!eps) return undefined
            const first = eps
                .filter(ep => isEpisodeReleased(ep) && !isWatched(s, ep.episode_number))
                .sort((a, b) => a.episode_number - b.episode_number)[0]
            if (first) return { season_number: s, episode_number: first.episode_number }
        }
        return null
    }

    /**
     * Highest watched (season, episode) after excluding one key (used when an
     * episode is being removed). Returns null when nothing remains watched.
     */
    const computeMaxWatchedExcluding = (excludeKey?: string): { season: number; episode: number } | null => {
        let max: { season: number; episode: number } | null = null
        for (const key of watchedKeysCache.current) {
            if (key === excludeKey) continue
            const [s, e] = key.split('-').map(Number)
            if (!max || s > max.season || (s === max.season && e > max.episode)) max = { season: s, episode: e }
        }
        return max
    }

    const markEpisodeAsWatched = async (episode: LocalEpisode, markAll: boolean) => {
        if (!watchlistId || !details) return

        if (markAll) {
            const episodesToMark: LocalEpisode[] = []

            // Current (selected) season: mark every released episode up to and
            // including the clicked one.
            for (const ep of episodes) {
                if (ep.episode_number <= episode.episode_number && isEpisodeReleased(ep)) {
                    episodesToMark.push(ep)
                }
            }

            // Earlier seasons: mark every released episode, using season data
            // already in seasonCache when available and fetching the rest from
            // TMDB. Only iterating the `episodes` state would miss cached
            // earlier seasons, since that state only holds the selected season.
            await Promise.all(seasons
                .filter(s => s < episode.season_number)
                .map(async s => {
                    let seasonEps = seasonCache.current.get(s)
                    if (!seasonEps) {
                        const data = await getTVSeasonDetails(Number(id), s)
                        seasonEps = (data.episodes || []).map((ep): LocalEpisode => ({
                            id: `${id}-${s}-${ep.episode_number}`,
                            season_number: s,
                            episode_number: ep.episode_number,
                            tmdb_episode_id: ep.id,
                            title: ep.name,
                            still_path: ep.still_path ?? undefined,
                            overview: ep.overview,
                            vote_average: normalizeEpisodeScore(ep.vote_average),
                            air_date: ep.air_date,
                            runtime: ep.runtime,
                            watched: false
                        }))
                    }
                    for (const localEp of seasonEps) {
                        if (isEpisodeReleased(localEp)) {
                            episodesToMark.push(localEp)
                        }
                    }
                }))

            try {
                const extraWatched = new Set(
                    episodesToMark.map(ep => `${ep.season_number}-${ep.episode_number}`)
                )
                const nextEp = await computeNextEpisodeForMutation(
                    episode.season_number,
                    episode.episode_number,
                    extraWatched
                )
                const success = await markEpisodesWatched(watchlistId, episodesToMark, nextEp)
                if (!success) throw new Error('Failed to mark episodes as watched')

                const newCurrentSeason = episode.season_number
                const newCurrentEpisode = episode.episode_number
                const newStatus = 'watching'

                useLibraryStore.setState(state => ({
                    allItems: state.allItems.map(item =>
                        item.id === watchlistId ? { ...item, current_season: newCurrentSeason, current_episode: newCurrentEpisode, status: newStatus, updated_at: new Date().toISOString() } : item
                    ),
                    tvShows: state.tvShows.map(item =>
                        item.id === watchlistId ? { ...item, current_season: newCurrentSeason, current_episode: newCurrentEpisode, status: newStatus, updated_at: new Date().toISOString() } : item
                    ),
                    movies: state.movies.map(item =>
                        item.id === watchlistId ? { ...item, current_season: newCurrentSeason, current_episode: newCurrentEpisode, status: newStatus, updated_at: new Date().toISOString() } : item
                    ),
                    finished: state.finished.filter(item => item.id !== watchlistId)
                }))

                for (const ep of episodesToMark) {
                    const key = `${ep.season_number}-${ep.episode_number}`
                    watchedKeysCache.current.add(key)
                    const cached = seasonCache.current.get(ep.season_number)
                    if (cached) {
                        const idx = cached.findIndex(c => c.season_number === ep.season_number && c.episode_number === ep.episode_number)
                        if (idx !== -1) {
                            cached[idx] = { ...cached[idx], watched: true }
                        }
                    }
                }

                setEpisodes(prev => prev.map(ep => {
                    const shouldMark = isEpisodeReleased(ep) && (
                        ep.season_number < episode.season_number ||
                        (ep.season_number === episode.season_number && ep.episode_number <= episode.episode_number)
                    )
                    return shouldMark ? { ...ep, watched: true } : ep
                }))

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
                    const extraWatched = new Set([`${episode.season_number}-${episode.episode_number}`])
                    const nextEp = await computeNextEpisodeForMutation(
                        episode.season_number,
                        episode.episode_number,
                        extraWatched
                    )
                    const success = await markEpisodeWatched(watchlistId, episode.season_number, episode.episode_number, {
                        tmdb_episode_id: episode.tmdb_episode_id,
                        title: episode.title,
                        still_path: episode.still_path,
                        overview: episode.overview,
                        vote_average: normalizeEpisodeScore(episode.vote_average),
                        air_date: episode.air_date,
                        runtime: episode.runtime
                    }, nextEp)
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
                    const key = `${episode.season_number}-${episode.episode_number}`
                    const maxWatched = computeMaxWatchedExcluding(key)
                    const nextEp = maxWatched
                        ? await computeNextEpisodeForMutation(maxWatched.season, maxWatched.episode)
                        : null
                    const success = await unmarkEpisodeWatched(watchlistId, episode.season_number, episode.episode_number, nextEp)
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
     * Mark the entire show as fully watched and reflect it in local state.
     * Awaits the full episode save (awaitPersist) so every episode row exists
     * in watchlist_episodes before we read them back — otherwise the read
     * races the background save and episodes can transiently show as unwatched
     * (and earlier seasons can be left un-marked).
     */
    const markWatchlistFullyWatched = async (wlId: string): Promise<void> => {
        if (!details) return
        await markShowAsFullyWatched(wlId, details.id, { awaitPersist: true })
        const watchedEps = await getWatchedEpisodes(wlId)
        watchedKeysCache.current.clear()
        for (const ep of watchedEps) {
            watchedKeysCache.current.add(`${ep.season_number}-${ep.episode_number}`)
        }
        Array.from(seasonCache.current.entries()).forEach(([seasonNum, seasonEps]) => {
            seasonCache.current.set(seasonNum, seasonEps.map(ep => ({
                ...ep,
                watched: true,
            })))
        })
        setEpisodes(prev => prev.map(ep => ({ ...ep, watched: true })))
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

            // Close modal immediately so the user can continue
            setRemoveEpisodeModal(null)
            setModalLoading(false)

            const key = `${episode.season_number}-${episode.episode_number}`
            const maxWatched = computeMaxWatchedExcluding(key)
            const nextEp = maxWatched
                ? await computeNextEpisodeForMutation(maxWatched.season, maxWatched.episode)
                : null
            // nextEp: {s,e} = definite next, null = no next, undefined = needed
            // season not cached. On a cache miss we skip the TMDB next-episode
            // lookup on this critical path and recompute it in the background below.
            const success = await unmarkEpisodesWatched(
                watchlistId,
                [episode],
                nextEp ?? undefined,
                nextEp === undefined
            )
            if (!success) {
                setEpisodes(prev => prev.map(ep => 
                    ep.id === episode.id ? { ...ep, watched: true } : ep
                ))
                return
            }

            void (async () => {
                try {
                    await checkAndUpdateCompleted(watchlistId, details.id)
                    await recomputeDenormalizedFields(watchlistId)
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
        }
    }

    const filteredEpisodes = useMemo(() => episodes.filter(ep => ep.season_number === selectedSeason && !!ep.air_date), [episodes, selectedSeason])
    // TMDB's series-level cast only reflects the most recent season's billing.
    // Fetch and merge every season's cast so anthology shows (e.g. The Terror)
    // still show the actors from earlier seasons. Each season's list is cached.
    const [seasonCastState, setSeasonCastState] = useState<{ showId: number; cast: CastMember[] } | null>(null)
    const fetchedSeasonCastRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        if (!showCast) return
        const showId = details?.id
        const seasons = details?.seasons
        const seasonNumbers = (Array.isArray(seasons) ? seasons : [])
            .map((s) => (s && typeof s === 'object' ? (s as { season_number?: number }).season_number : undefined))
            .filter((n): n is number => typeof n === 'number' && n > 0)
        if (!showId || seasonNumbers.length === 0) return

        // Fetch season casts only on first open for a show; the result
        // persists in seasonCastState so reopening the panel doesn't refetch.
        const cacheKey = `seasonCast:${showId}`
        if (seasonCastState?.showId === showId) return
        const fetched = fetchedSeasonCastRef.current
        if (fetched.has(cacheKey)) return
        fetched.add(cacheKey)

        let active = true
        const load = async () => {
            try {
                const entries = await Promise.all(
                    seasonNumbers.map((n) =>
                        getCachedOrFetch(
                            'tv-season-cast-v3',
                            `${showId}-${n}`,
                            () => getTVSeasonCredits(showId, n),
                            { ttl: 7 * 24 * 60 * 60 * 1000, staleWhileRevalidate: true }
                        )
                    )
                )
                if (!active) return
                const seen = new Set<number>()
                const merged: CastMember[] = []
                for (const entry of entries) {
                    const list = (entry as { cast?: unknown }).cast
                    if (!Array.isArray(list)) continue
                    for (const c of list) {
                        if (!c || typeof c !== 'object') continue
                        const member = c as { id?: number; name?: string; character?: string | null; profile_path?: string | null }
                        const numId = Number(member.id)
                        if (!Number.isFinite(numId) || seen.has(numId)) continue
                        seen.add(numId)
                        merged.push({
                            id: numId,
                            name: member.name ?? 'Unknown',
                            character: member.character ?? null,
                            profile_path: member.profile_path ?? null,
                        })
                    }
                }
                setSeasonCastState({ showId, cast: merged })
            } catch (err) {
                fetched.delete(cacheKey)
                console.error('Failed to load season cast:', err)
            }
        }
        void load()
        return () => {
            active = false
            // If the fetch was aborted before completing (e.g. the panel was
            // closed mid-flight), allow a retry on the next open. When it did
            // complete, the seasonCastState guard above makes a refetch a no-op.
            fetched.delete(cacheKey)
        }
    }, [details, showCast, seasonCastState?.showId])

    const cast = useMemo<CastMember[]>(() => {
        const base = (details?.credits?.cast || [])
            .filter((c: unknown): c is CastMember => !!c && typeof c === 'object')
        const seasonSource = seasonCastState && seasonCastState.showId === details?.id ? seasonCastState.cast : []
        return curateCast(base, seasonSource)
    }, [details, seasonCastState])

    if (loading) {
        return <div className="detail-page-loading" aria-live="polite">Loading TV show...</div>
    }

    if (error && !details) {
        return (
            <div className="detail-page-error" role="alert">
                <div className="error-boundary__card">
                    <p>{error}</p>
                    <button className="detail-page__retry-btn" onClick={() => void fetchDetails()}>
                        Try again
                    </button>
                </div>
            </div>
        )
    }

    if (!details) {
        return <div className="detail-page-error">TV Show not found</div>
    }

    const heroPoster = isMobile ? getBestPoster(details?.images?.posters) : null
    const backdropUrl = heroPoster
        ? imageUrlOriginal(heroPoster)
        : imageUrlOriginal(getBestBackdropPath(details?.images?.backdrops) ?? details?.backdrop_path ?? null)
    const logoUrl = getLogoUrl()
    const title = details?.name || ''
    const firstYear = details?.first_air_date?.slice(0, 4) || ''
    const lastYear = details?.last_air_date?.slice(0, 4) || ''
    const year = firstYear
    ? (details?.status === 'Ended' || details?.status === 'Canceled'
        ? (lastYear && lastYear !== firstYear ? `${firstYear}-${lastYear}` : firstYear)
        : `${firstYear}-`)
    : ''
    const tvVoteAverage = details?.vote_average
    const hasRating = typeof tvVoteAverage === 'number' && tvVoteAverage > 0
    const rating = hasRating ? tvVoteAverage.toFixed(1) : null
    const ageRating = getAgeRating()
    const overview = details?.overview || 'No description available.'
    const genres = details?.genres || []
    // Count seasons that actually have episodes for display
    const displaySeasonCount = seasons.length
    const shareUrl = id ? new URL(`/tv/${id}`, window.location.origin).toString() : window.location.href

    return (
        <div className="detail-page detail-page--no-scroll">
            {!isInModal && backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} loading="eager" fetchPriority="high" onLoad={() => setBackdropPainted(true)} />
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
                            {rating && (
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
                            {(!isMobile || showDescription) && <>
                                <h2 className="detail-page__section-title">Description</h2>
                                <p className="detail-page__overview">{overview}</p>
                            </>}
                            
                            {isInWatchlist && (watchlistStatus === 'paused' || watchlistStatus === 'dropped') && (
                                <div className="detail-page__status">
                                    <span className="detail-page__status-label">Status:</span>
                                    <span className="detail-page__status-value">{formatStatus(watchlistStatus || "").label}</span>
                                </div>
                            )}
                            
                            {!isMobile ? (
                            <div className="detail-page__actions">
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
                                            <Bookmark size={18} color="#fff" />
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={async () => {
                                                setIsUpdatingStatus(true)
                                                const newWatchlistId = await handleAddToWatchlist()
                                                if (newWatchlistId && details) {
                                                    // The show was just added (planning), so this explicit mark-as-watched
                                                    // action always completes it — celebrate right away instead of waiting
                                                    // on the status persist + background episode-saving.
                                                    launchCosmicConfetti()
                                                    // Gold standard: just set the status directly - no need to insert every episode
                                                    await markWatchlistFullyWatched(newWatchlistId)
                                                }
                                                setIsUpdatingStatus(false)
                                            }}
                                            disabled={adding || isUpdatingStatus}
                                            title="Mark as Watched"
                                        >
                                            <Eye size={18} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => setRemoveWatchlistModal({ isOpen: true })}
                                            title="Remove from Watchlist"
                                        >
                                            <Bookmark size={18} color="#68ffae" fill="#68ffae" />
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
                                            {(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                        {hasStarted && (
                                            <button 
                                                className="detail-page__icon-btn"
                                                onClick={() => setStatusChangeModal({ isOpen: true })}
                                                disabled={isUpdatingStatus || modalLoading}
                                                title="Change Status"
                                            >
                                                <Ellipsis size={18} />
                                            </button>
                                        )}
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
                                        <Clapperboard size={18} />
                                    </button>
                                )}
                                {cast.length > 0 && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setShowCast(!showCast)}
                                        title={showCast ? 'Hide Cast' : 'Cast'}
                                    >
                                        <Users size={18} />
                                    </button>
                                )}
                                <ShareButton
                                    url={shareUrl}
                                    title={`${title} on Track1st`}
                                    text={`I found ${title} on Track1st. This one might deserve a place on your next binge list.`}
                                />
                                <div className="detail-page__actions-spacer" />
                                {showStremioButton && !stremioLoading && (
                                     <button
                                         className="detail-page__icon-btn"
                                         onClick={async () => {
                                            if (!details) return
                                            const nextEp = await getResumeEpisodeToWatch()
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
                                {showTmdbButton && !tmdbLoading && (
                                    <button
                                        className="detail-page__icon-btn detail-page__icon-btn--tmdb"
                                        onClick={() => {
                                            if (!details) return
                                            openExternal(`https://www.themoviedb.org/tv/${details.id}`)
                                        }}
                                        title="Open on TMDB"
                                    >
                                        <img src={tmdbLogo} alt="TMDB" className="detail-page__tmdb-logo" />
                                    </button>
                                )}
                            </div>
                            ) : (
                            isActiveDetail && createPortal(
                            <div className={`detail-page__actions-mobile${isSidebarOpen ? ' detail-page__actions-mobile--open' : ''}`}>
                                <button className="detail-page__icon-btn" onClick={() => setShowDescription(!showDescription)} title={showDescription ? 'Hide Description' : 'Show Description'} aria-label={showDescription ? 'Hide Description' : 'Show Description'}>
                                    <AlignLeft size={18} />
                                </button>
                                <ShareButton
                                    url={shareUrl}
                                    title={`${title} on Track1st`}
                                    text={`I found ${title} on Track1st. This one might deserve a place on your next binge list.`}
                                />
                                {showStremioButton && !stremioLoading && (
                                     <button
                                         className="detail-page__icon-btn"
                                         onClick={async () => {
                                            if (!details) return
                                            const nextEp = await getResumeEpisodeToWatch()
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
                                {cast.length > 0 && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setShowCast(!showCast)}
                                        title={showCast ? 'Hide Cast' : 'Cast'}
                                    >
                                        <Users size={18} />
                                    </button>
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
                                        <Clapperboard size={18} />
                                    </button>
                                )}
                                {!isInWatchlist ? (
                                    <>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={async () => {
                                                setIsUpdatingStatus(true)
                                                const newWatchlistId = await handleAddToWatchlist()
                                                if (newWatchlistId && details) {
                                                    // The show was just added (planning), so this explicit mark-as-watched
                                                    // action always completes it — celebrate right away instead of waiting
                                                    // on the status persist + background episode-saving.
                                                    launchCosmicConfetti()
                                                    // Gold standard: just set the status directly - no need to insert every episode
                                                    await markWatchlistFullyWatched(newWatchlistId)
                                                }
                                                setIsUpdatingStatus(false)
                                            }}
                                            disabled={adding || isUpdatingStatus}
                                            title="Mark as Watched"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={async () => {
                                                await handleAddToWatchlist()
                                            }}
                                            disabled={adding}
                                            title="Add to Watchlist"
                                        >
                                            <Bookmark size={18} color="#fff" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {hasStarted && (
                                            <button 
                                                className="detail-page__icon-btn"
                                                onClick={() => setStatusChangeModal({ isOpen: true })}
                                                disabled={isUpdatingStatus || modalLoading}
                                                title="Change Status"
                                            >
                                                <Ellipsis size={18} />
                                            </button>
                                        )}
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
                                            {(watchlistStatus === 'completed' || watchlistStatus === 'caught_up') ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => setRemoveWatchlistModal({ isOpen: true })}
                                            title="Remove from Watchlist"
                                        >
                                            <Bookmark size={18} color="#68ffae" fill="#68ffae" />
                                        </button>
                                    </>
                                )}
                            </div>,
                            document.body
                            ))}

                            {/* Action buttons (desktop inline / mobile fixed sidebar) */}
                            {!isMobile && showTrailer && trailerKey && (
                                <div className="detail-page__trailer-overlay" onClick={() => setShowTrailer(false)}>
                                    <div className="detail-page__trailer-modal" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                            className="detail-page__trailer-close"
                                            onClick={() => setShowTrailer(false)}
                                        >
                                            <X size={18} />
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
                            <CastList cast={cast} isInModal={isInModal} maxItems={isMobile ? 8 : 16} />
                        )}
                    </div>

                    {/* Mobile: Episodes section inside left column, scrollable */}
                    {isMobile && (
                        <div className="detail-page__episodes-container">
                            <div className="detail-page__episodes-section">
                                {selectedSeason === 0 ? (
                                    <div className="detail-page__episodes-loading">
                                        <div className="discover-spinner" />
                                    </div>
                                ) : null}
                                {selectedSeason > 0 && seasons.length > 1 && (
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
                                            <ChevronLeft size={18} />
                                        </button>
                                        <div className="detail-page__season-dropdown" ref={seasonDropdownRef}>
                                            <button
                                                className="detail-page__season-dropdown-trigger"
                                                onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                                            >
                                                <span>Season {selectedSeason}</span>
                                                <ChevronDown size={18} className={seasonDropdownOpen ? 'rotated' : ''} />
                                            </button>
                                            {seasonDropdownOpen && (
                                                <div className="detail-page__season-dropdown-menu">
                                                    {seasons.map(s => (
                                                        <button
                                                            key={s}
                                                            className={`detail-page__season-dropdown-option ${s === selectedSeason ? 'selected' : ''}`}
                                                            onClick={() => {
                                                                handleSeasonChange(s)
                                                                setSeasonDropdownOpen(false)
                                                            }}
                                                        >
                                                            Season {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
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
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                )}
                                
                                <div className="detail-page__episode-list" ref={episodeListRef}>
                                    {filteredEpisodes.map((ep) => (
                                        <div 
                                            key={ep.id} 
                                            ref={(el) => { episodeRefs.current[ep.id] = el }}
                                             className={`detail-page__episode-card ${ep.watched ? 'watched' : ''} ${!isEpisodeReleased(ep) ? 'unreleased' : ''} ${!ep.still_path ? 'no-poster' : ''}`}
                                             onClick={(e) => {
                                                if (isMobile && (e.target as HTMLElement).closest('.detail-page__episode-still')) {
                                                    if (isInModal && id) {
                                                        openEpisodeModal(ep.season_number, ep.episode_number)
                                                    } else {
                                                        navigate(`/tv/${id}/season/${ep.season_number}/episode/${ep.episode_number}`)
                                                    }
                                                    return
                                                }
                                                if (isEpisodeReleased(ep)) {
                                                    if (!ep.watched && hasUnwatchedEpisodesBefore(ep)) {
                                                        setAddEpisodeModal({ isOpen: true, episode: ep })
                                                    } else if (!ep.watched) {
                                                        markEpisodeAsWatched(ep, false)
                                                    } else {
                                                        markEpisodeAsWatched(ep, false)
                                                    }
                                                }
                                            }}
                                        >
                                            {ep.still_path && (
                                                <div className="detail-page__episode-still">
                                                    <img src={imageUrl(ep.still_path, 'w300') || ''} alt={ep.title || `Episode ${ep.episode_number}`} loading="lazy" width="160" height="90" />
                                                </div>
                                            )}
                                            <div className="detail-page__episode-info">
                                                    <div className="detail-page__episode-details">
                                                        <strong>
                                                            {!isMobile && <>{ep.episode_number}{ep.title ? '. ' : ''}</>}
                                                            <span className={ep.watched ? 'detail-page__episode-title watched' : 'detail-page__episode-title'}>
                                                                {ep.title}
                                                            </span>
                                                            {ep.watched && (
                                                                <span className="detail-page__episode-inline-check" aria-label="Watched episode">
                                                                    <Check size={12} strokeWidth={2.5} />
                                                                </span>
                                                            )}
                                                        </strong>
                                                        <div className="detail-page__episode-meta">
                                                            {getEpisodeLocalAirDate(ep) && <span>{getEpisodeLocalAirDate(ep)}</span>}
                                                            {ep.runtime && <span>{ep.runtime} min</span>}
                                                            {!isMobile && isEpisodeReleased(ep) && typeof ep.vote_average === 'number' && ep.vote_average > 0 && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                        </div>
                                                    </div>
                                            </div>
                                            <button 
                                                className="detail-page__episode-ellipsis-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (isInModal && id) {
                                                        openEpisodeModal(ep.season_number, ep.episode_number)
                                                    } else {
                                                        navigate(`/tv/${id}/season/${ep.season_number}/episode/${ep.episode_number}`)
                                                    }
                                                }}
                                                title="View episode details"
                                            >
                                                <Ellipsis size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Desktop: Episodes section in right column */}
                    {!isMobile && (
                        <div className="detail-page__right">
                            <div className="detail-page__episodes-section">
                                {selectedSeason === 0 ? (
                                    <div className="detail-page__episodes-loading">
                                        <div className="discover-spinner" />
                                    </div>
                                ) : seasons.length > 1 && (
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
                                            <ChevronLeft size={18} />
                                        </button>
                                        <div className="detail-page__season-dropdown" ref={seasonDropdownRef}>
                                            <button
                                                className="detail-page__season-dropdown-trigger"
                                                onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                                            >
                                                <span>Season {selectedSeason}</span>
                                                <ChevronDown size={18} className={seasonDropdownOpen ? 'rotated' : ''} />
                                            </button>
                                            {seasonDropdownOpen && (
                                                <div className="detail-page__season-dropdown-menu">
                                                    {seasons.map(s => (
                                                        <button
                                                            key={s}
                                                            className={`detail-page__season-dropdown-option ${s === selectedSeason ? 'selected' : ''}`}
                                                            onClick={() => {
                                                                handleSeasonChange(s)
                                                                setSeasonDropdownOpen(false)
                                                            }}
                                                        >
                                                            Season {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
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
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                )}
                                
                                <div className="detail-page__episode-list" ref={episodeListRef}>
                                    {filteredEpisodes.map((ep) => (
                                        <div 
                                            key={ep.id} 
                                            ref={(el) => { episodeRefs.current[ep.id] = el }}
                                             className={`detail-page__episode-card ${ep.watched ? 'watched' : ''} ${!isEpisodeReleased(ep) ? 'unreleased' : ''} ${!ep.still_path ? 'no-poster' : ''}`}
                                             onClick={() => {
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
                                            }}
                                        >
                                            {ep.still_path && (
                                                <div className="detail-page__episode-still">
                                                    <img src={imageUrl(ep.still_path, 'w300') || ''} alt={ep.title || `Episode ${ep.episode_number}`} loading="lazy" width="160" height="90" />
                                                </div>
                                            )}
                                                <div className="detail-page__episode-info">
                                                    <div className="detail-page__episode-details">
                                                        <strong>
                                                            {!isMobile && <>{ep.episode_number}{ep.title ? '. ' : ''}</>}
                                                            <span className={ep.watched ? 'detail-page__episode-title watched' : 'detail-page__episode-title'}>
                                                                {ep.title}
                                                            </span>
                                                            {ep.watched && (
                                                                <span className="detail-page__episode-inline-check" aria-label="Watched episode">
                                                                    <Check size={12} strokeWidth={2.5} />
                                                                </span>
                                                            )}
                                                        </strong>
                                                        <div className="detail-page__episode-meta">
                                                            {getEpisodeLocalAirDate(ep) && <span>{getEpisodeLocalAirDate(ep)}</span>}
                                                            {ep.runtime && <span>{ep.runtime} min</span>}
                                                            {!isMobile && isEpisodeReleased(ep) && typeof ep.vote_average === 'number' && ep.vote_average > 0 && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button 
                                                    className="detail-page__episode-ellipsis-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (isInModal && id) {
                                                            openEpisodeModal(ep.season_number, ep.episode_number)
                                                        } else {
                                                            navigate(`/tv/${id}/season/${ep.season_number}/episode/${ep.episode_number}`)
                                                        }
                                                    }}
                                                    title="View episode details"
                                                >
                                                    <Ellipsis size={18} />
                                                </button>
                                            </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
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
                    message={markWatchedModal.markAsWatched ? 'Are you sure you want to mark the entire show as watched?' : 'Are you sure you want to mark all episodes as unwatched?'}
                    onConfirm={async () => {
                        if (!watchlistId || !details) return
                        setModalLoading(true)
                        try {
                            const newWatchedState = markWatchedModal.markAsWatched

                            if (newWatchedState) {
                                // This modal only opens with markAsWatched=true for shows that aren't
                                // finished yet, so celebrate the intent immediately instead of waiting
                                // on the status persist + background episode-saving.
                                launchCosmicConfetti()
                                await markWatchlistFullyWatched(watchlistId)
                            } else {
                                const success = await removeAllWatchedEpisodes(watchlistId)
                                if (!success) throw new Error('Failed to unmark all episodes')
                                watchedKeysCache.current = new Set()
                            }

                            const refreshCached = () => {
                                Array.from(seasonCache.current.entries()).forEach(([seasonNum, seasonEps]) => {
                                    seasonCache.current.set(seasonNum, seasonEps.map(ep => ({
                                        ...ep,
                                        watched: watchedKeysCache.current.has(`${ep.season_number}-${ep.episode_number}`)
                                    })))
                                })
                                setEpisodes(prev => prev.map(ep => ({
                                    ...ep,
                                    watched: watchedKeysCache.current.has(`${ep.season_number}-${ep.episode_number}`)
                                })))
                            }
                            refreshCached()

                            setMarkWatchedModal(null)

                            void (async () => {
                                try {
                                    await useLibraryStore.getState().refreshItem(watchlistId)
                                } catch (syncError) {
                                    console.error('Failed to synchronize watchlist after eye toggle:', syncError)
                                }
                            })()
                        } catch (err) {
                            console.error('Failed to toggle whole-show watched state via eye icon:', err)
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
                            {watchlistStatus !== 'paused' && watchlistStatus !== 'completed' && watchlistStatus !== 'caught_up' && (
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
                            {watchlistStatus !== 'dropped' && watchlistStatus !== 'completed' && watchlistStatus !== 'caught_up' && (
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

export default React.memo(TVShowDetail)





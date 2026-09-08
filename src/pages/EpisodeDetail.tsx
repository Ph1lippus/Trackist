import React, { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { getTVDetails, getTVSeasonDetails, imageUrlOriginal, getBestBackdropPath } from '../services/tmdbService'
import { markEpisodeWatched, unmarkEpisodeWatched, checkAndUpdateCompleted } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import { supabase } from '../services/supabaseClient'
import { getCachedOrFetch } from '../services/cacheService'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { TMDBResult } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'

import { getEpisodeReleaseTimestamp } from '../services/tvmazeService'
import { useMobile } from '../contexts/useMobile'
import ShareButton from '../components/media/ShareButton'
import { useDetailSidebar } from '../hooks/useDetailSidebar'
import { useIsActiveDetail } from '../hooks/useActiveDetail'
import useDetailModalStore from '../stores/detailModalStore'
import { Eye, EyeOff } from 'lucide-react'

interface EpisodeData {
    id: number
    episode_number: number
    name: string
    overview?: string
    still_path?: string | null
    vote_average?: number
    air_date?: string
    runtime?: number
}

interface EpisodeDetailProps {
    itemId?: number
    seasonNumber?: number
    episodeNumber?: number
    onLoaded?: () => void
}

const normalizeEpisodeScore = (value?: number | null): number | undefined => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return undefined
    return value
}

const EpisodeDetail = React.memo<EpisodeDetailProps>(({ itemId, seasonNumber, episodeNumber, onLoaded }) => {
    const { id: paramId, season: paramSeason, episode: paramEpisode } = useParams<{ id: string; season: string; episode: string }>()
    const id = itemId?.toString() ?? paramId
    const season = seasonNumber?.toString() ?? paramSeason
    const episode = episodeNumber?.toString() ?? paramEpisode
    const { isMobile } = useMobile()
    const { isOpen: isSidebarOpen } = useDetailSidebar()
    const isInModal = useDetailModalStore((s) => s.isOpen)
    const isActiveDetail = useIsActiveDetail('episode', id, season, episode)
    const [tvDetails, setTvDetails] = useState<TMDBResult | null>(null)
    const [episodeData, setEpisodeData] = useState<EpisodeData | null>(null)
    const episodeSlug = season && episode ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : ''
    const pageTitleEpisode = tvDetails?.name ? `${episodeSlug}${episodeData?.name ? ` - ${episodeData.name}` : ''}` : ''
    usePageTitle(tvDetails?.name ? `${tvDetails.name} - ${pageTitleEpisode} - Track1st` : 'Track1st - Episode Detail')
    const [loading, setLoading] = useState(true)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [watched, setWatched] = useState(false)
    const [backdropPainted, setBackdropPainted] = useState(false)
    const [showDescription] = useState(true)
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean } | null>(null)

    // Exact air-time gating: null while resolving (falls back to date-only),
    // true once the episode's TVmaze airstamp has passed, false while locked.
    const [preciseReleased, setPreciseReleased] = useState<boolean | null>(null)
    const [releaseTimestamp, setReleaseTimestamp] = useState<number | null>(null)

    // Resolve the real air time so a user can't mark today's episode watched
    // before it actually airs. Falls back to the date-only rule while resolving.
    useEffect(() => {
        if (!id || !season || !episode) return
        let cancelled = false
        void (async () => {
            const ts = await getEpisodeReleaseTimestamp(Number(id), Number(season), Number(episode))
            if (cancelled) return
            if (ts) {
                setReleaseTimestamp(ts.getTime())
                setPreciseReleased(Date.now() >= ts.getTime())
            } else {
                setReleaseTimestamp(null)
                setPreciseReleased(null)
            }
        })()
        return () => { cancelled = true }
    }, [id, season, episode])

    // Unlock the watched button automatically once the airstamp passes while
    // the modal/page is still open (episode releases mid-viewing).
    useEffect(() => {
        if (preciseReleased !== false || releaseTimestamp === null) return
        const delay = Math.max(releaseTimestamp - Date.now(), 0)
        const t = window.setTimeout(() => setPreciseReleased(true), Math.min(delay + 1000, 2_147_483_647))
        return () => window.clearTimeout(t)
    }, [preciseReleased, releaseTimestamp])

    

    useEffect(() => {
        let active = true
        const fetchData = async () => {
            setLoading(true)
            if (!id || !season || !episode) {
                setLoading(false)
                return
            }
            try {
                const [tvData, seasonData] = await Promise.all([
                    getCachedOrFetch(
                        'tv-details',
                        Number(id),
                        () => getTVDetails(Number(id)),
                        { ttl: 24 * 60 * 60 * 1000, staleWhileRevalidate: true }
                    ),
                    getCachedOrFetch(
                        `tv-season-details:${id}-${season}`,
                        `${id}-${season}`,
                        () => getTVSeasonDetails(Number(id), Number(season)),
                        { ttl: 24 * 60 * 60 * 1000, staleWhileRevalidate: true }
                    )
                ])
                if (!active) return
                setTvDetails(tvData)

                const ep = seasonData.episodes?.find((e) => e.episode_number === Number(episode)) ?? null
                setEpisodeData(ep)

                // Check if in watchlist using global store
                const watchlistItem = useLibraryStore.getState().allItems.find(item => item.tmdb_id === Number(id))
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
                    if (!active) return
                    if (episodeWatchData) {
                        setWatched(true)
                    }
                }
            } catch (err) {
                if (!active) return
                console.error('Failed to load episode details:', err)
            } finally {
                if (active) setLoading(false)
            }
        }
        void fetchData()
        return () => {
            active = false
        }
    }, [id, season, episode])

    // Signal the overlay that the page content is ready so its reveal
    // curtain can lift. In modal mode this fires once data is loaded. In routed
    // mode the full-screen cover also waits for the backdrop image to paint, so
    // the reveal shows the backdrop across the whole screen at once.
    useEffect(() => {
        if (isInModal) {
            if (!loading) onLoaded?.()
            return
        }
        if (loading) return
        const useStill = !isMobile && !!episodeData?.still_path
        const url = useStill
            ? imageUrlOriginal(episodeData.still_path)
            : !isMobile
                ? imageUrlOriginal(getBestBackdropPath(tvDetails?.images?.backdrops) ?? tvDetails?.backdrop_path ?? null)
                : null
        if (!url || backdropPainted) onLoaded?.()
    }, [loading, isInModal, isMobile, episodeData, tvDetails, backdropPainted, onLoaded])

    const stillUrl = episodeData?.still_path ? imageUrlOriginal(episodeData.still_path) : null

    const useStillAsBackdrop = !isMobile && !!episodeData?.still_path
    const backdropUrl = useStillAsBackdrop
        ? imageUrlOriginal(episodeData.still_path)
        : !isMobile
            ? imageUrlOriginal(getBestBackdropPath(tvDetails?.images?.backdrops) ?? tvDetails?.backdrop_path ?? null)
            : null

    // Blur the backdrop only when the source image is actually below 1080p. An
    // episode still carries no resolution metadata (and is served as `original`),
    // so we can't verify it is low-res — only the show's regular backdrops have
    // a `height` we can check. Still backdrops therefore aren't blurred.
    const isLowResBackdrop = useStillAsBackdrop
        ? false
        : (() => {
            if (!backdropUrl || !tvDetails?.images?.backdrops) return false
            const bestPath = getBestBackdropPath(tvDetails.images.backdrops) ?? tvDetails.backdrop_path
            if (!bestPath) return false
            const matched = tvDetails.images.backdrops.find(b => b.file_path === bestPath)
            return typeof matched?.height === 'number' && matched.height < 1080
        })()

    // Push episode backdrop URL to the overlay store so it renders outside the scroll container.
    useEffect(() => {
        if (!isInModal) return
        useDetailModalStore.getState().setBackdropUrl(backdropUrl)
        useDetailModalStore.getState().setBackdropClassName(isLowResBackdrop ? 'detail-page__backdrop-image--low-resolution' : null)
        return () => {
            const modalOpen = useDetailModalStore.getState().isOpen
            if (!modalOpen) {
                useDetailModalStore.getState().setBackdropUrl(null)
                useDetailModalStore.getState().setBackdropClassName(null)
            }
        }
    }, [isInModal, backdropUrl, isLowResBackdrop])

    const logoUrl = useMemo(() => {
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
        return null
    }, [tvDetails?.images?.logos])

    const title = tvDetails?.name || 'Untitled'
    const episodeTitle = episodeData?.name || 'Episode ' + (episode ?? '')
    const episodeScore = useMemo(() => (episodeData ? normalizeEpisodeScore(episodeData.vote_average) : undefined), [episodeData])
    const released = preciseReleased ?? false

    const handleToggleWatched = async () => {
        if (!watchlistId || !id || !season || !episode || !episodeData) return

        // Prevent marking unreleased episodes as watched.
        if (!released) return

        // If trying to unwatch, show confirmation modal
        if (watched) {
            setConfirmModal({ isOpen: true })
            return
        }

        // Mark as watched - optimistic update
        setWatched(true)

        try {
            const success = await markEpisodeWatched(watchlistId, Number(season), Number(episode), {
                tmdb_episode_id: episodeData.id || undefined,
                title: episodeData.name,
                still_path: episodeData.still_path || undefined,
                overview: episodeData.overview,
                vote_average: normalizeEpisodeScore(episodeData.vote_average),
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

    const episodeActions = (
        <>
            <ShareButton
                url={id && season && episode ? new URL(`/tv/${id}/season/${season}/episode/${episode}`, window.location.origin).toString() : window.location.href}
                title={`${title} S${season}E${episode} on Track1st`}
                text={`I am watching ${title}, season ${season}, episode ${episode}: ${episodeTitle}. Join me on Track1st.`}
            />
            {isInWatchlist && released && (
                <button
                    className="detail-page__icon-btn"
                    onClick={handleToggleWatched}
                    title={watched ? 'Mark as Unwatched' : 'Mark as Watched'}
                >
                    {watched ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            )}
        </>
    )

return (
        <div className="detail-page detail-page--no-scroll">
            {!isInModal && backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} loading="eager" fetchPriority="high" onLoad={() => setBackdropPainted(true)} className={isLowResBackdrop ? 'detail-page__backdrop-image--low-resolution' : ''} />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}
            {loading && (
                <div className="detail-page__loading-skeleton">
                    <div className="detail-page__content detail-page__content--split">
                        <div className="detail-page__main detail-page__main--episode">
                            <div className="detail-page__left">
                                <div className="detail-page__title-section">
                                    <div className="detail-page__logo-section">
                                        <h1 className="detail-page__title loading-placeholder" />
                                    </div>
                                    <div className="detail-page__meta">
                                        <span className="detail-page__year loading-placeholder" />
                                    </div>
                                </div>
                                <div className="detail-page__overview-section">
                                    <div className="detail-page__episode-hero">
                                        <div className="detail-page__episode-image-placeholder loading-placeholder" />
                                    </div>
                                    <h2 className="detail-page__section-title">Description</h2>
                                    <p className="detail-page__overview loading-placeholder" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {!loading && !tvDetails && !episodeData && (
                <div className="detail-page-error">Episode not found</div>
            )}
            {!loading && tvDetails && episodeData && (
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
                            </div>
                        </div>

                        <div className="detail-page__overview-section">
                            {stillUrl && (
                                <div className="detail-page__episode-hero">
                                    <img
                                        src={stillUrl}
                                        alt={episodeTitle}
                                        loading="lazy"
                                    />
                                    {episodeScore && (
                                        <span className="detail-page__episode-score">
                                            <span aria-hidden="true">★</span> {episodeScore}
                                        </span>
                                    )}
                                </div>
                            )}

                            {showDescription && <>
                                <h2 className="detail-page__section-title">Description</h2>
                                <p className="detail-page__overview">{episodeData.overview || 'No description available.'}</p>
                            </>}
                            
                            {isMobile && isActiveDetail ? createPortal(
                                <div className={`detail-page__actions-mobile${isSidebarOpen ? ' detail-page__actions-mobile--open' : ''}`}>
                                    {episodeActions}
                                </div>,
                                document.body
                            ) : (
                                <div className="detail-page__actions">
                                    {episodeActions}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="detail-page__right" style={{ display: 'none' }}>
                    </div>
                </div>
            </div>
            )}

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
})

export default EpisodeDetail
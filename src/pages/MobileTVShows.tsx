import React, { useEffect, useMemo, useCallback, useState } from 'react'
import { getTVEpisodeDetails, imageUrl } from '../services/tmdbService'
import { markEpisodesWatched, checkAndUpdateCompleted } from '../services/watchlistService'

import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMobile } from '../contexts/useMobile'
import { useSearch } from '../hooks/useSearch'
import { useMissingPosters } from '../hooks/useMissingPosters'
import ConfirmModal from '../components/modals/ConfirmModal'
import ViewToggleButton from '../components/layout/ViewToggleButton'
import { getCachedOrFetch } from '../services/cacheService'
import useDetailModalStore from '../stores/detailModalStore'

const MobileTVShows: React.FC = () => {
    const { isMobile } = useMobile()
    usePageTitle('Track1st - TV Shows')
    const { committedQuery } = useSearch()
    const tvShows = useLibraryStore((state) => state.tvShows)
    const isInitialized = useLibraryStore((state) => state.isInitialized)
    const missingPosters = useMissingPosters(tvShows)
    const [addingEpisode, setAddingEpisode] = useState<string | null>(null)
    const [completedEpisode, setCompletedEpisode] = useState<string | null>(null)
    const [episodeTitles, setEpisodeTitles] = useState<Record<string, string>>({})
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'resume' | null
        item: WatchlistItem | null
    } | null>(null)

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const watching = useMemo(() => {
        const filtered = committedQuery
            ? tvShows.filter(s => s.status === 'watching' && s.title.toLowerCase().includes(committedQuery.toLowerCase()))
            : tvShows.filter(s => s.status === 'watching')
        return filtered.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })
    }, [tvShows, committedQuery])

    const toWatch = useMemo(() => {
        const filtered = committedQuery
            ? tvShows.filter(s => s.status === 'planning' && s.title.toLowerCase().includes(committedQuery.toLowerCase()))
            : tvShows.filter(s => s.status === 'planning')
        return filtered.sort((a, b) => {
            const dateA = new Date(a.added_at || 0)
            const dateB = new Date(b.added_at || 0)
            return dateA.getTime() - dateB.getTime()
        })
    }, [tvShows, committedQuery])

    const paused = useMemo(() => {
        const filtered = committedQuery
            ? tvShows.filter(s => s.status === 'paused' && s.title.toLowerCase().includes(committedQuery.toLowerCase()))
            : tvShows.filter(s => s.status === 'paused')
        return filtered.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })
    }, [tvShows, committedQuery])

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    useEffect(() => {
        let active = true
        const shows = [...watching, ...toWatch, ...paused].slice(0, 12)
        const loadEpisodeTitles = async () => {
            const titleEntries = await Promise.all(shows.map(async (show) => {
                if (!show.tmdb_id) return null
                const season = show.next_season_number || (show.status === 'planning' ? 1 : show.current_season)
                const episode = show.next_episode_number || (show.status === 'planning' ? 1 : show.current_episode)
                if (!season || !episode) return null

                try {
                    const data = await getCachedOrFetch(
                        'tv-episode-details',
                        `${show.tmdb_id}-${season}-${episode}`,
                        () => getTVEpisodeDetails(show.tmdb_id!, season, episode),
                        { ttl: 24 * 60 * 60 * 1000, staleWhileRevalidate: true }
                    )
                    return data.name ? [`${show.id}:${season}:${episode}`, data.name] as const : null
                } catch {
                    return null
                }
            }))

            if (active) {
                const validTitleEntries = titleEntries.filter(entry => entry !== null)
                setEpisodeTitles(previous => ({
                    ...previous,
                    ...Object.fromEntries(validTitleEntries)
                }))
            }
        }
        void loadEpisodeTitles()
        return () => {
            active = false
        }
    }, [watching, toWatch, paused])

    const getEpisodesLeft = (show: WatchlistItem): number | undefined => {
        if (show.total_episodes === undefined) return undefined
        const watched = show.watched_episodes_count ?? 0
        return Math.max(0, show.total_episodes - watched)
    }

    const getEpisodeInfo = (show: WatchlistItem): string | null => {
        if (show.status === 'planning') {
            return 'S1 E1'
        }
        if (show.next_season_number && show.next_episode_number) {
            return `S${show.next_season_number} E${show.next_episode_number}`
        }
        if (show.current_season && show.current_episode) {
            return 'S' + show.current_season + ' E' + show.current_episode
        }
        return null
    }

    const handleAddEpisode = async (show: WatchlistItem) => {
        if (!show.id || !show.tmdb_id || addingEpisode) return

        // Check if show is dropped or paused
        if (show.status === 'dropped' || show.status === 'paused') {
            setConfirmModal({
                isOpen: true,
                action: 'resume',
                item: show
            })
            return
        }

        setAddingEpisode(show.id)
        try {
            await handleAddEpisodeInternal(show)
        } catch (err) {
            console.error('Failed to add episode:', err)
        } finally {
            setAddingEpisode(null)
        }
    }

    const handleAddEpisodeInternal = async (show: WatchlistItem) => {
        // Use the cached next episode from store if available, otherwise fetch from TMDB
        let nextEp: { season_number: number; episode_number: number; tmdb_episode_id?: number; title?: string; still_path?: string | null; overview?: string; air_date?: string; runtime?: number } | null = null
        let followingNext: { season_number: number; episode_number: number } | undefined
        if (show.next_season_number && show.next_episode_number && show.tmdb_id) {
            const { getTVSeasonDetails } = await import('../services/tmdbService')
            const seasonData = await getTVSeasonDetails(show.tmdb_id, show.next_season_number)
            const ep = seasonData.episodes?.find((e: { episode_number: number; id?: number; name?: string; still_path?: string | null; overview?: string; air_date?: string; runtime?: number }) => e.episode_number === show.next_episode_number)
            if (ep) {
                nextEp = {
                    season_number: show.next_season_number,
                    episode_number: show.next_episode_number,
                    tmdb_episode_id: ep.id,
                    title: ep.name,
                    still_path: ep.still_path ?? undefined,
                    overview: ep.overview,
                    air_date: ep.air_date,
                    runtime: ep.runtime
                }
                // Compute the episode after the one we're about to mark from the
                // season data we already fetched, so the service layer can skip
                // the TMDB-heavy next-episode lookup (keeps "add episode" fast).
                const released = (seasonData.episodes || []).filter(
                    (e: { air_date?: string }) => e.air_date && new Date(e.air_date) <= new Date()
                )
                const nextSame = released.find(
                    (e: { episode_number: number }) => e.episode_number === ep.episode_number + 1
                )
                if (nextSame) {
                    followingNext = { season_number: show.next_season_number, episode_number: nextSame.episode_number }
                }
            }
        }
        if (!nextEp) {
            const { getNextEpisodeToWatch } = await import('../services/watchlistService')
            nextEp = await getNextEpisodeToWatch(show.id)
        }

        if (!nextEp) {
            return
        }

        const success = await markEpisodesWatched(show.id, [{
            ...nextEp,
            still_path: nextEp.still_path ?? undefined
        }], followingNext)

        if (!success) {
            return
        }

        const nextEpisodeNumber = nextEp.episode_number + 1
        void useLibraryStore.getState().updateItem(show.id, {
            current_season: nextEp.season_number,
            current_episode: nextEp.episode_number,
            watched_episodes_count: (show.watched_episodes_count ?? 0) + 1,
            next_season_number: nextEp.season_number,
            next_episode_number: nextEpisodeNumber,
            status: 'watching'
        })
        setCompletedEpisode(show.id)

        setTimeout(async () => {
            // Update data behind the sweep
            if (show.tmdb_id) {
                await checkAndUpdateCompleted(show.id, show.tmdb_id)
            }
            await useLibraryStore.getState().refreshItem(show.id)
        }, 200)
    }

    const handleConfirmResume = async () => {
        if (!confirmModal?.item?.id) return

        setAddingEpisode(confirmModal.item.id)
        try {
            // First update status to watching
            await useLibraryStore.getState().updateStatus(confirmModal.item.id, 'watching')

            // Then proceed with episode addition logic (reuse the same logic)
            const show = confirmModal.item
            let nextEp: { season_number: number; episode_number: number; tmdb_episode_id?: number; title?: string; still_path?: string | null; overview?: string; air_date?: string; runtime?: number } | null = null
            let followingNext: { season_number: number; episode_number: number } | undefined
            if (show.next_season_number && show.next_episode_number && show.tmdb_id) {
                const { getTVSeasonDetails } = await import('../services/tmdbService')
                const seasonData = await getTVSeasonDetails(show.tmdb_id, show.next_season_number)
                const ep = seasonData.episodes?.find((e: { episode_number: number; id?: number; name?: string; still_path?: string | null; overview?: string; air_date?: string; runtime?: number }) => e.episode_number === show.next_episode_number)
                if (ep) {
                    nextEp = {
                        season_number: show.next_season_number,
                        episode_number: show.next_episode_number,
                        tmdb_episode_id: ep.id,
                        title: ep.name,
                        still_path: ep.still_path ?? undefined,
                        overview: ep.overview,
                        air_date: ep.air_date,
                        runtime: ep.runtime
                    }
                    const released = (seasonData.episodes || []).filter(
                        (e: { air_date?: string }) => e.air_date && new Date(e.air_date) <= new Date()
                    )
                    const nextSame = released.find(
                        (e: { episode_number: number }) => e.episode_number === ep.episode_number + 1
                    )
                    if (nextSame) {
                        followingNext = { season_number: show.next_season_number, episode_number: nextSame.episode_number }
                    }
                }
            }
            if (!nextEp) {
                const { getNextEpisodeToWatch } = await import('../services/watchlistService')
                nextEp = await getNextEpisodeToWatch(show.id)
            }

            if (!nextEp) {
                setAddingEpisode(null)
                return
            }

            const success = await markEpisodesWatched(show.id, [{
                ...nextEp,
                still_path: nextEp.still_path ?? undefined
            }], followingNext)

            if (success) {
                    void useLibraryStore.getState().updateItem(show.id, {
                    current_season: nextEp.season_number,
                    current_episode: nextEp.episode_number,
                    watched_episodes_count: (show.watched_episodes_count ?? 0) + 1,
                    next_season_number: nextEp.season_number,
                    next_episode_number: nextEp.episode_number + 1,
                    status: 'watching'
                })
                setCompletedEpisode(show.id)
                setTimeout(async () => {
                    if (show.tmdb_id) {
                        await checkAndUpdateCompleted(show.id, show.tmdb_id)
                    }
                    await useLibraryStore.getState().refreshItem(show.id)
                }, 200)
            }
        } catch (err) {
            console.error('Failed to resume show:', err)
        } finally {
            setAddingEpisode(null)
            setConfirmModal(null)
        }
    }

    const renderShowCard = useCallback((show: WatchlistItem) => {
        const isAdding = addingEpisode === show.id
        const isDone = completedEpisode === show.id
        const isCompleted = show.status === 'completed' || show.status === 'caught_up'
        const isDroppedOrPaused = show.status === 'dropped' || show.status === 'paused'
        const episodesLeft = getEpisodesLeft(show)
        const episodeInfo = getEpisodeInfo(show)
        const episodeTitleKey = episodeInfo
            ? `${show.id}:${show.next_season_number || (show.status === 'planning' ? 1 : show.current_season)}:${show.next_episode_number || (show.status === 'planning' ? 1 : show.current_episode)}`
            : null
        const episodeTitle = episodeTitleKey ? episodeTitles[episodeTitleKey] : undefined
        const posterPath = show.poster_path || (show.tmdb_id ? (missingPosters[show.tmdb_id] || null) : null)

        return (
            <div
                key={show.id}
                className="mobile-tvshow-card"
                onClick={() => { if (show.tmdb_id) useDetailModalStore.getState().open('tv', show.tmdb_id) }}
            >
                <div className="mobile-tvshow-card-poster">
                    {posterPath ? (
                        <img src={imageUrl(posterPath, isMobile ? 'w342' : 'w342') || ''} alt={show.title} loading="lazy" />
                    ) : (
                        <div className="mobile-tvshow-card-no-poster">
                            <span>{show.title}</span>
                        </div>
                    )}
                </div>
                <div className="mobile-tvshow-card-body">
                    <h3 className="mobile-tvshow-card-title">{show.title}</h3>
                    {episodesLeft !== undefined && episodesLeft > 0 && (
                        <span className="mobile-tvshow-card-episode">+{episodesLeft}</span>
                    )}
                    {(!isCompleted || isDroppedOrPaused) && episodeInfo && (
                        <span className="mobile-tvshow-card-episode-info">Next: {episodeInfo}</span>
                    )}
                    {episodeTitle && (
                        <span className="mobile-tvshow-card-episode-title">&quot;{episodeTitle}&quot;</span>
                    )}
                </div>
                {(!isCompleted || isDroppedOrPaused) && (
                    <button
                        className="mobile-tvshow-card-add-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleAddEpisode(show)
                        }}
                        disabled={isAdding}
                        title="Add one episode"
                    >
                        {isAdding ? (
                            <div className="mobile-tvshow-card-spinner" />
                        ) : isDone ? (
                            <i className="fa-solid fa-check"></i>
                        ) : (
                            <i className={`fa-solid fa-check`}></i>
                        )}
                    </button>
                )}
            </div>
        )
    }, [addingEpisode, completedEpisode, episodeTitles, handleAddEpisode, getEpisodesLeft, getEpisodeInfo, isMobile, missingPosters])

    return (
        <section className="dashboard-page mobile-tvshows-page">
<div className="dashboard-shell mobile-tvshows-shell">
                {!isInitialized ? (
                    <div className="discover-loading" aria-live="polite">
                        <div className="discover-spinner" />
                        <p>Loading TV shows...</p>
                    </div>
                ) : watching.length === 0 && toWatch.length === 0 && paused.length === 0 ? (
                    <div className="mobile-tvshows-empty">
                        <i className="fa-solid fa-tv"></i>
                        <h3>No TV shows yet</h3>
                        <p>Add TV shows to your watchlist to see them here</p>
                    </div>
                ) : (
                    <div className="mobile-tvshows-list">
                        {watching.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <div className="mobile-tvshows-section-header">
                                    <h2 className="mobile-tvshows-section-title">Currently Watching</h2>
                                    <ViewToggleButton />
                                </div>
                                <div className="mobile-tvshows-cards">
                                    {watching.map(show => renderShowCard(show))}
                                </div>
                            </div>
                        )}

                        {paused.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">Paused</h2>
                                <div className="mobile-tvshows-cards">
                                    {paused.map(show => renderShowCard(show))}
                                </div>
                            </div>
                        )}

                        {toWatch.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">Watchlist (Not Started)</h2>
                                <div className="mobile-tvshows-cards">
                                    {toWatch.map(show => renderShowCard(show))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <button className="upcoming-new-scroll-top" onClick={scrollToTop} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>

            <ConfirmModal
                isOpen={Boolean(confirmModal?.isOpen && confirmModal.action === 'resume')}
                title="Resume Watching"
                message={`This show is currently ${confirmModal?.item?.status || 'dropped/paused'}. Adding an episode will move it back to "Watching". Continue?`}
                onConfirm={handleConfirmResume}
                onCancel={() => setConfirmModal(null)}
                confirmText="Resume"
                confirmColor="success"
            />
        </section>
    )
}

export default MobileTVShows









import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTVDetails, getTVSeasonDetails, imageUrl } from '../services/tmdbService'
import { markEpisodeWatched, checkAndUpdateCompleted } from '../services/watchlistService'

import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSearch } from '../hooks/useSearch'
import { supabase } from '../services/supabaseClient'
import ConfirmModal from '../components/modals/ConfirmModal'

const MobileTVShows: React.FC = () => {
    usePageTitle('Trackist - TV Shows')
    const navigate = useNavigate()
    const { committedQuery } = useSearch()
    const tvShows = useLibraryStore((state) => state.tvShows)
    const isInitialized = useLibraryStore((state) => state.isInitialized)
    const [addingEpisode, setAddingEpisode] = useState<string | null>(null)
    const [sweepId, setSweepId] = useState<string | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        action: 'resume' | null
        item: WatchlistItem | null
    } | null>(null)

    const handleSwitchToNormal = () => {
        navigate('/Tvshows')
    }

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

    // Check for new episodes on completed/caught_up shows so they move back to "watching"
    useEffect(() => {
        const checkForNewEpisodes = async () => {
            const currentStore = useLibraryStore.getState()
            const currentTvShows = currentStore.tvShows

            if (!isInitialized || currentTvShows.length === 0) return

            const completedShows = currentTvShows.filter(
                item => (item.status === 'completed' || item.status === 'caught_up' || (
                    item.status === 'watching' &&
                    item.total_episodes !== undefined &&
                    item.total_episodes > 0 &&
                    (item.watched_episodes_count ?? 0) >= item.total_episodes
                )) &&
                (item.watched_episodes_count ?? 0) > 0 &&
                item.total_episodes !== undefined
            )

            if (completedShows.length === 0) return

            for (const show of completedShows) {
                if (!show.tmdb_id) continue

                try {
                    const details = await getTVDetails(show.tmdb_id)
                    const currentTotalEpisodes = details.number_of_episodes || 0
                    const storedTotalEpisodes = show.total_episodes || 0

                    if (currentTotalEpisodes > storedTotalEpisodes) {
                        const latestSeasonNumber = details.number_of_seasons || 1
                        const seasonData = await getTVSeasonDetails(show.tmdb_id, latestSeasonNumber)
                        const newEpisodes = seasonData.episodes?.filter((ep: { episode_number: number; air_date?: string }) => ep.episode_number > storedTotalEpisodes) || []

                        const hasReleasedEpisodes = newEpisodes.some((ep: { episode_number: number; air_date?: string }) => {
                            if (!ep.air_date) return true
                            return new Date(ep.air_date) <= new Date()
                        })

                        if (hasReleasedEpisodes) {
                            await supabase
                                .from('watchlist')
                                .update({
                                    status: 'watching',
                                    total_episodes: currentTotalEpisodes,
                                    total_seasons: details.number_of_seasons || show.total_seasons
                                })
                                .eq('id', show.id)

                            await useLibraryStore.getState().refreshItem(show.id)
                        }
                    }
                } catch (err) {
                    console.error(`Failed to check for new episodes for ${show.title}:`, err)
                }
            }
        }

        checkForNewEpisodes()

        const interval = setInterval(() => {
            checkForNewEpisodes()
        }, 5 * 60 * 1000)

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkForNewEpisodes()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [isInitialized])

    const getEpisodesLeft = (show: WatchlistItem): number | undefined => {
        if (show.total_episodes === undefined) return undefined
        const watched = show.watched_episodes_count ?? 0
        return Math.max(0, show.total_episodes - watched)
    }

    const getEpisodeInfo = (show: WatchlistItem): string | null => {
        if (show.status === 'planning' || show.status === 'paused') {
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
        await handleAddEpisodeInternal(show)
    }

    const handleAddEpisodeInternal = async (show: WatchlistItem) => {
        try {
            // Use the cached next episode from store if available, otherwise fetch from TMDB
            let nextEp: { season_number: number; episode_number: number; tmdb_episode_id?: number; title?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number } | null = null
            if (show.next_season_number && show.next_episode_number && show.tmdb_id) {
                const { getTVSeasonDetails } = await import('../services/tmdbService')
                const seasonData = await getTVSeasonDetails(show.tmdb_id, show.next_season_number)
                const ep = seasonData.episodes?.find((e: { episode_number: number; id?: number; name?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number }) => e.episode_number === show.next_episode_number)
                if (ep) {
                    nextEp = {
                        season_number: show.next_season_number,
                        episode_number: show.next_episode_number,
                        tmdb_episode_id: ep.id,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        air_date: ep.air_date,
                        runtime: ep.runtime
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

            const success = await markEpisodeWatched(
                show.id,
                nextEp.season_number,
                nextEp.episode_number,
                {
                    tmdb_episode_id: nextEp.tmdb_episode_id,
                    title: nextEp.title,
                    still_path: nextEp.still_path,
                    overview: nextEp.overview,
                    air_date: nextEp.air_date,
                    runtime: nextEp.runtime
                }
            )

            if (success) {
                // Start sweep immediately to cover all data transitions
                setSweepId(show.id)
                setTimeout(async () => {
                    // Update data behind the sweep
                    if (show.tmdb_id) {
                        await checkAndUpdateCompleted(show.id, show.tmdb_id)
                    }
                    await useLibraryStore.getState().refreshItem(show.id)

                    // Clear sweep — all data is now correct
                    setSweepId(null)
                }, 10)
            }
        } catch (err) {
            console.error('Failed to add episode:', err)
        } finally {
            setAddingEpisode(null)
        }
    }

    const handleConfirmResume = async () => {
        if (!confirmModal?.item?.id) return

        setAddingEpisode(confirmModal.item.id)
        try {
            // First update status to watching
            await useLibraryStore.getState().updateStatus(confirmModal.item.id, 'watching')

            // Then proceed with episode addition logic (reuse the same logic)
            const show = confirmModal.item
            let nextEp: { season_number: number; episode_number: number; tmdb_episode_id?: number; title?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number } | null = null
            if (show.next_season_number && show.next_episode_number && show.tmdb_id) {
                const { getTVSeasonDetails } = await import('../services/tmdbService')
                const seasonData = await getTVSeasonDetails(show.tmdb_id, show.next_season_number)
                const ep = seasonData.episodes?.find((e: { episode_number: number; id?: number; name?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number }) => e.episode_number === show.next_episode_number)
                if (ep) {
                    nextEp = {
                        season_number: show.next_season_number,
                        episode_number: show.next_episode_number,
                        tmdb_episode_id: ep.id,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        air_date: ep.air_date,
                        runtime: ep.runtime
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

            const success = await markEpisodeWatched(
                show.id,
                nextEp.season_number,
                nextEp.episode_number,
                {
                    tmdb_episode_id: nextEp.tmdb_episode_id,
                    title: nextEp.title,
                    still_path: nextEp.still_path,
                    overview: nextEp.overview,
                    air_date: nextEp.air_date,
                    runtime: nextEp.runtime
                }
            )

            if (success) {
                setSweepId(show.id)
                setTimeout(async () => {
                    if (show.tmdb_id) {
                        await checkAndUpdateCompleted(show.id, show.tmdb_id)
                    }
                    await useLibraryStore.getState().refreshItem(show.id)
                    setSweepId(null)
                }, 10)
            }
        } catch (err) {
            console.error('Failed to resume show:', err)
        } finally {
            setAddingEpisode(null)
            setConfirmModal(null)
        }
    }

    const renderShowCard = (show: WatchlistItem) => {
        const isAdding = addingEpisode === show.id
        const isCompleted = show.status === 'completed' || show.status === 'caught_up'
        const isDroppedOrPaused = show.status === 'dropped' || show.status === 'paused'
        const hasSweep = sweepId === show.id
        const episodesLeft = getEpisodesLeft(show)
        const episodeInfo = getEpisodeInfo(show)

        return (
            <div
                key={show.id}
                className="mobile-tvshow-card"
                onClick={() => { if (show.tmdb_id) navigate(`/tv/${show.tmdb_id}`) }}
            >
                {hasSweep && <div className="mobile-tvshow-card-sweep" />}
                <div className="mobile-tvshow-card-poster">
                    {show.poster_path ? (
                        <img src={imageUrl(show.poster_path) || ''} alt={show.title} loading="lazy" />
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
                        <span className="mobile-tvshow-card-episode-info">{episodeInfo}</span>
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
                        <i className={`fa-solid ${isAdding ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                    </button>
                )}
            </div>
        )
    }

    return (
        <section className="dashboard-page mobile-tvshows-page">
            <button
                className="mobile-view-toggle-fixed"
                onClick={handleSwitchToNormal}
                title="Switch to Normal View"
            >
                <i className="fa-solid fa-desktop"></i>
            </button>
<div className="dashboard-shell mobile-tvshows-shell">
                {watching.length === 0 && toWatch.length === 0 && paused.length === 0 ? (
                    <div className="mobile-tvshows-empty">
                        <i className="fa-solid fa-tv"></i>
                        <h3>No TV shows yet</h3>
                        <p>Add shows to your watchlist to see them here</p>
                    </div>
                ) : (
                    <div className="mobile-tvshows-list">
                        {watching.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">Watching</h2>
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
                                <h2 className="mobile-tvshows-section-title">To Watch</h2>
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

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../services/tmdbService'
import { markEpisodeWatched, getNextEpisodeToWatch } from '../services/watchlistService'

import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSearch } from '../hooks/useSearch'

const MobileTVShows: React.FC = () => {
    usePageTitle('Trackist - TV Shows')
    const navigate = useNavigate()
    const { committedQuery } = useSearch()
    const tvShows = useLibraryStore((state) => state.tvShows)
    const [addingEpisode, setAddingEpisode] = useState<string | null>(null)
    const [nextEpisodes, setNextEpisodes] = useState<Record<string, { season_number: number; episode_number: number }>>({})

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

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    useEffect(() => {
        const fetchNextEpisodes = async () => {
            if (watching.length === 0) return
            const results: Record<string, { season_number: number; episode_number: number }> = {}
            for (const show of watching) {
                if (!show.id || !show.tmdb_id) continue
                try {
                    const nextEp = await getNextEpisodeToWatch(show.id)
                    if (nextEp) {
                        results[show.id] = { season_number: nextEp.season_number, episode_number: nextEp.episode_number }
                    }
                } catch (err) {
                    console.error(`Failed to fetch next episode for ${show.title}:`, err)
                }
            }
            setNextEpisodes(results)
        }

        fetchNextEpisodes()
    }, [watching])

    // Fetch actual next episodes from the episode catalog (watchlist_episodes)
    // This correctly handles season transitions, unlike the old current_episode + 1 logic
    const getEpisodeLabel = (show: WatchlistItem): string => {
        if (show.status === 'planning') {
            return 'S1 E1'
        }

        const cached = nextEpisodes[show.id]
        if (cached) {
            return `S${cached.season_number} E${cached.episode_number}`
        }
        const currentSeason = show.current_season || 1
        const currentEpisode = show.current_episode || 0
        const nextEpisode = currentEpisode + 1
        return `S${currentSeason} E${nextEpisode}`
        
    }

    const getEpisodeSubtitle = (show: WatchlistItem): string => {
        if (show.status === 'planning') {
            return 'First episode'
        }
        return 'Next episode'
    }

    const handleAddEpisode = async (show: WatchlistItem) => {
        if (!show.id || !show.tmdb_id || addingEpisode) return

        setAddingEpisode(show.id)
        try {
            // Use the cached next episode if available, otherwise fetch from TMDB
            const cached = nextEpisodes[show.id]
            let nextEp: { season_number: number; episode_number: number; tmdb_episode_id?: number; title?: string; still_path?: string; overview?: string; air_date?: string; runtime?: number } | null = null
            if (cached) {
                const { getTVSeasonDetails } = await import('../services/tmdbService')
                const seasonData = await getTVSeasonDetails(show.tmdb_id, cached.season_number)
                const ep = seasonData.episodes?.find(e => e.episode_number === cached.episode_number)
                if (ep) {
                    nextEp = {
                        season_number: cached.season_number,
                        episode_number: cached.episode_number,
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
                await useLibraryStore.getState().refreshItem(show.id)
            }
        } catch (err) {
            console.error('Failed to add episode:', err)
        } finally {
            setAddingEpisode(null)
        }
    }

    const renderShowCard = (show: WatchlistItem, showFirstEpisode: boolean = false) => {
        const isAdding = addingEpisode === show.id
        const isCompleted = show.status === 'completed' || show.status === 'caught_up'

        return (
            <div
                key={show.id}
                className="mobile-tvshow-card"
                onClick={() => { if (show.tmdb_id) navigate(`/tv/${show.tmdb_id}`) }}
            >
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
                    <div className="mobile-tvshow-card-episode">
                        <span>{showFirstEpisode ? 'S1 E1' : getEpisodeLabel(show)}</span>
                    </div>
                    <p className="mobile-tvshow-card-episode-title">{showFirstEpisode ? 'First episode' : getEpisodeSubtitle(show)}</p>
                </div>
                {!showFirstEpisode && !isCompleted && (
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
            <div className="dashboard-shell mobile-tvshows-shell">
                <div className="mobile-page-tabs">
                    <button className="mobile-page-tab active">Mobile</button>
                    <button className="mobile-page-tab" onClick={() => navigate('/Tvshows')}>Normal</button>
                </div>

                {watching.length === 0 && toWatch.length === 0 ? (
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
                                    {watching.map(show => renderShowCard(show, false))}
                                </div>
                            </div>
                        )}

                        {toWatch.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">To Watch</h2>
                                <div className="mobile-tvshows-cards">
                                    {toWatch.map(show => renderShowCard(show, true))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    )
}

export default MobileTVShows
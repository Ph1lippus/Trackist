import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { imageUrl, getTVSeasonDetails } from '../services/tmdbService'
import { markEpisodeWatched } from '../services/watchlistService'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSearch } from '../hooks/useSearch'

interface EpisodeInfo {
    season_number: number
    episode_number: number
    tmdb_episode_id?: number
    title?: string
    still_path?: string
    overview?: string
    air_date?: string
    runtime?: number
}

const MobileTVShows: React.FC = () => {
    usePageTitle('Trackist - TV Shows')
    const navigate = useNavigate()
    const { committedQuery } = useSearch()
    const tvShows = useLibraryStore((state) => state.tvShows)
    const [addingEpisode, setAddingEpisode] = useState<string | null>(null)
    const [episodesMap, setEpisodesMap] = useState<Map<string, EpisodeInfo[]>>(new Map())
    const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set())

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    useEffect(() => {
        const loadEpisodes = async () => {
            const watching = tvShows.filter(s => s.status === 'watching' && s.tmdb_id)
            if (watching.length === 0) return

            const newEpisodesMap = new Map<string, EpisodeInfo[]>()
            const newWatchedSet = new Set<string>()

            for (const show of watching) {
                if (!show.id || !show.tmdb_id) continue

                try {
                    const seasonData = await getTVSeasonDetails(show.tmdb_id, show.current_season || 1)
                    const eps: EpisodeInfo[] = (seasonData.episodes || []).map((ep: {
                        episode_number: number
                        id?: number
                        name?: string
                        still_path?: string
                        overview?: string
                        air_date?: string
                        runtime?: number
                    }) => ({
                        season_number: show.current_season || 1,
                        episode_number: ep.episode_number,
                        tmdb_episode_id: ep.id,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        air_date: ep.air_date,
                        runtime: ep.runtime
                    }))
                    newEpisodesMap.set(show.id, eps)

                    const { data: watchedData } = await supabase
                        .from('watchlist_episodes')
                        .select('season_number, episode_number')
                        .eq('watchlist_id', show.id)

                    if (watchedData) {
                        watchedData.forEach(ep => {
                            newWatchedSet.add(`${show.id}-${ep.season_number}-${ep.episode_number}`)
                        })
                    }
                } catch (err) {
                    console.error(`Failed to load episodes for ${show.title}:`, err)
                }
            }

            setEpisodesMap(newEpisodesMap)
            setWatchedSet(newWatchedSet)
        }

        loadEpisodes()
    }, [tvShows])

    const handleAddEpisode = async (show: WatchlistItem) => {
        if (!show.id || !show.tmdb_id) return

        setAddingEpisode(show.id)
        try {
            const showEpisodes = episodesMap.get(show.id) || []
            const nextEpisode = showEpisodes.find(ep => !watchedSet.has(`${show.id}-${ep.season_number}-${ep.episode_number}`))

            if (!nextEpisode) {
                setAddingEpisode(null)
                return
            }

            const success = await markEpisodeWatched(
                show.id,
                nextEpisode.season_number,
                nextEpisode.episode_number,
                {
                    tmdb_episode_id: nextEpisode.tmdb_episode_id,
                    title: nextEpisode.title,
                    still_path: nextEpisode.still_path,
                    overview: nextEpisode.overview,
                    air_date: nextEpisode.air_date,
                    runtime: nextEpisode.runtime
                }
            )

            if (success) {
                setWatchedSet(prev => new Set([...prev, `${show.id}-${nextEpisode.season_number}-${nextEpisode.episode_number}`]))
                await useLibraryStore.getState().refreshItem(show.id)
            }
        } catch (err) {
            console.error('Failed to add episode:', err)
        } finally {
            setAddingEpisode(null)
        }
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

    const getEpisodeLabel = (show: WatchlistItem): string => {
        const showEpisodes = episodesMap.get(show.id) || []
        const nextEpisode = showEpisodes.find(ep => !watchedSet.has(`${show.id}-${ep.season_number}-${ep.episode_number}`))

        if (nextEpisode) {
            return `S${nextEpisode.season_number} E${nextEpisode.episode_number}`
        }

        // If all episodes in the currently loaded season are watched, show the next season
        if (showEpisodes.length > 0) {
            const allWatchedInSeason = showEpisodes.every(ep => watchedSet.has(`${show.id}-${ep.season_number}-${ep.episode_number}`))
            if (allWatchedInSeason) {
                const season = (show.current_season || 1) + 1
                return `S${season} E1`
            }
        }

        const season = show.current_season || 1
        const episode = show.current_episode || 1
        return `S${season} E${episode}`
    }

    const getEpisodeSubtitle = (show: WatchlistItem): string => {
        const showEpisodes = episodesMap.get(show.id) || []
        const watchedCount = showEpisodes.filter(ep => watchedSet.has(`${show.id}-${ep.season_number}-${ep.episode_number}`)).length
        const totalEpisodes = showEpisodes.length

        if (show.status === 'planning') {
            return 'First episode'
        }

        if (totalEpisodes > 0 && watchedCount >= totalEpisodes) {
            return 'Final episode'
        }

        const nextEpisode = showEpisodes.find(ep => !watchedSet.has(`${show.id}-${ep.season_number}-${ep.episode_number}`))
        return nextEpisode?.title || `Episode ${watchedCount + 1}`
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

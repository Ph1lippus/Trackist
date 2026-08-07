import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'

const MobileTVShows: React.FC = () => {
    usePageTitle('Trackist - TV Shows')
    const tvShows = useLibraryStore((state) => state.tvShows)
    const [addingEpisode, setAddingEpisode] = useState<string | null>(null)

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const handleAddEpisode = async (show: WatchlistItem) => {
        if (!show.id || !show.tmdb_id) return

        setAddingEpisode(show.id)
        try {
            const newEpisode = (show.current_episode || 0) + 1
            const updates: Record<string, unknown> = {
                current_episode: newEpisode,
                updated_at: new Date().toISOString()
            }

            if (show.status === 'planning') {
                updates.status = 'watching'
            }

            const { error } = await supabase
                .from('watchlist')
                .update(updates)
                .eq('id', show.id)

            if (error) {
                console.error('Failed to add episode:', error)
                return
            }

            await useLibraryStore.getState().refreshItem(show.id)
        } catch (err) {
            console.error('Failed to add episode:', err)
        } finally {
            setAddingEpisode(null)
        }
    }

    const recentlyUpdated = useMemo(() => {
        return tvShows
            .filter(show => show.status !== 'planning')
            .sort((a, b) => {
                const dateA = new Date(a.updated_at || 0)
                const dateB = new Date(b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })
    }, [tvShows])

    const toWatch = useMemo(() => {
        return tvShows
            .filter(show => show.status === 'planning')
            .sort((a, b) => {
                const dateA = new Date(a.added_at || 0)
                const dateB = new Date(b.added_at || 0)
                return dateA.getTime() - dateB.getTime()
            })
    }, [tvShows])

    const getEpisodeLabel = (show: WatchlistItem): string => {
        const season = show.current_season || 1
        const episode = show.current_episode || 1
        return `S${season} E${episode}`
    }

    const renderShowCard = (show: WatchlistItem, showFirstEpisode: boolean = false) => {
        const isAdding = addingEpisode === show.id
        const episodeLabel = showFirstEpisode ? 'S1 E1' : getEpisodeLabel(show)
        const episodeTitle = showFirstEpisode ? 'First episode' : `Episode ${show.current_episode || 1}`

        return (
            <div
                key={show.id}
                className="mobile-tvshow-card"
                onClick={() => { if (show.tmdb_id) void `/tv/${show.tmdb_id}` }}
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
                        <i className="fa-solid fa-play"></i>
                        <span>{episodeLabel}</span>
                    </div>
                    <p className="mobile-tvshow-card-episode-title">{episodeTitle}</p>
                </div>
                {!showFirstEpisode && (
                    <button
                        className="mobile-tvshow-card-add-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleAddEpisode(show)
                        }}
                        disabled={isAdding}
                        title="Add one episode"
                    >
                        <i className={`fa-solid ${isAdding ? 'fa-spinner fa-spin' : 'fa-plus'}`}></i>
                    </button>
                )}
            </div>
        )
    }

    return (
        <section className="dashboard-page mobile-tvshows-page">
            <div className="dashboard-shell mobile-tvshows-shell">
                {recentlyUpdated.length === 0 && toWatch.length === 0 ? (
                    <div className="mobile-tvshows-empty">
                        <i className="fa-solid fa-tv"></i>
                        <h3>No TV shows yet</h3>
                        <p>Add shows to your watchlist to see them here</p>
                    </div>
                ) : (
                    <div className="mobile-tvshows-list">
                        {recentlyUpdated.length > 0 && (
                            <div className="mobile-tvshows-section">
                                <h2 className="mobile-tvshows-section-title">Recently Updated</h2>
                                <div className="mobile-tvshows-cards">
                                    {recentlyUpdated.map(show => renderShowCard(show, false))}
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

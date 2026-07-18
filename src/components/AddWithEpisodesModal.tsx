import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails, imageUrl } from '../services/tmdbService'
import type { TMDBResult, WatchlistItem } from '../types'

interface AddWithEpisodesModalProps {
    item: TMDBResult
    onClose: () => void
    onAdd: (item: WatchlistItem) => void
}

interface Episode {
    season_number: number
    episode_number: number
    name?: string
    still_path?: string
    air_date?: string
    runtime?: number
}

const AddWithEpisodesModal: React.FC<AddWithEpisodesModalProps> = ({ item, onClose, onAdd }) => {
    const [loading, setLoading] = useState(true)
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<Episode[]>([])
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set())
    const [adding, setAdding] = useState(false)

    const isTV = item.media_type === 'tv'

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!isTV || !item.id) return
            setLoading(true)
            try {
                const details = await getTVDetails(item.id)
                const seasonList = (details.seasons || [])
                    .filter((s: { season_number: number }) => s.season_number > 0)
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

                const allEpisodes: Episode[] = []
                for (const season of seasonList) {
                    const sData = await getTVSeasonDetails(item.id, season)
                    const sEpisodes = sData.episodes || []
                    for (const ep of sEpisodes) {
                        allEpisodes.push({
                            season_number: season,
                            episode_number: ep.episode_number,
                            name: ep.name,
                            still_path: ep.still_path,
                            air_date: ep.air_date,
                            runtime: ep.runtime
                        })
                    }
                }
                setEpisodes(allEpisodes)
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
            setLoading(false)
        }
        loadEpisodes()
    }, [item.id, isTV])

    const filteredEpisodes = episodes.filter(ep => ep.season_number === selectedSeason)

    const isEpisodeReleased = (episode: Episode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
    }

    const handleEpisodeToggle = (episode: Episode) => {
        if (!isEpisodeReleased(episode)) return
        const key = `${episode.season_number}-${episode.episode_number}`
        const newSelected = new Set(selectedEpisodes)
        if (newSelected.has(key)) {
            newSelected.delete(key)
        } else {
            newSelected.add(key)
        }
        setSelectedEpisodes(newSelected)
    }

    const handleAdd = async () => {
        setAdding(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            alert('Please log in')
            setAdding(false)
            return
        }

        const itemTitle = item.title || item.name || ''
        const { data, error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: 'tv',
            tmdb_id: item.id,
            title: itemTitle,
            poster_path: item.poster_path,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date,
            vote_average: item.vote_average,
            status: 'watching'
        }).select().single()

        if (error) {
            alert('Error: ' + error.message)
        } else if (data) {
            // Add selected episodes as watched
            const watchlistId = data.id
            const episodeInserts = Array.from(selectedEpisodes).map(key => {
                const [season, epNum] = key.split('-').map(Number)
                const ep = episodes.find(e => e.season_number === season && e.episode_number === epNum)
                return supabase.from('watchlist_episodes').insert({
                    watchlist_id: watchlistId,
                    season_number: season,
                    episode_number: epNum,
                    title: ep?.name,
                    still_path: ep?.still_path,
                    air_date: ep?.air_date,
                    runtime: ep?.runtime,
                    watched: true,
                    watched_at: new Date().toISOString()
                })
            })
            await Promise.all(episodeInserts)
            onAdd(data)
        }
        setAdding(false)
    }

    const posterUrl = item.poster_path ? imageUrl(item.poster_path) : null
    const title = item.title || item.name || 'Untitled'

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="media-detail-view" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                <div className="media-detail-layout">
                    <div className="media-detail-info">
                        {posterUrl && (
                            <div className="media-detail-poster">
                                <img src={posterUrl} alt={title} />
                            </div>
                        )}
                        <h2 className="media-detail-title">{title}</h2>
                        <span className="media-card__type">TV Show</span>

                        {item.overview && (
                            <p className="media-detail-overview">{item.overview}</p>
                        )}

                        <div className="media-detail-meta">
                            {item.vote_average && <span>⭐ {item.vote_average.toFixed(1)}</span>}
                            {episodes.length > 0 && <span>📺 {episodes.length} episodes</span>}
                            {seasons.length > 0 && <span>📦 {seasons.length} seasons</span>}
                        </div>

                        {seasons.length > 1 && (
                            <div className="media-detail-season-tabs" style={{ marginTop: '1rem' }}>
                                {seasons.map(sn => (
                                    <button
                                        key={sn}
                                        className={`media-detail-season-tab ${selectedSeason === sn ? 'active' : ''}`}
                                        onClick={() => setSelectedSeason(sn)}
                                    >
                                        Season {sn}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div style={{ marginTop: '1rem' }}>
                            <button
                                className="modal-btn modal-btn--watch"
                                onClick={handleAdd}
                                disabled={adding}
                                style={{ width: '100%' }}
                            >
                                {adding ? 'Adding...' : `Add to Watchlist (${selectedEpisodes.size} episodes marked)`}
                            </button>
                        </div>
                    </div>

                    <div className="media-detail-episodes">
                        <div className="media-detail-episodes-header">
                            <h3>Select Episodes to Mark as Watched</h3>
                        </div>

                        <div className="media-detail-episodes-list">
                            {loading ? (
                                <div className="discover-loading"><div className="discover-spinner" /><p>Loading episodes...</p></div>
                            ) : filteredEpisodes.length === 0 ? (
                                <p style={{ textAlign: 'center', opacity: 0.6, padding: '2rem' }}>No episodes available</p>
                            ) : (
                                filteredEpisodes.map(ep => {
                                    const key = `${ep.season_number}-${ep.episode_number}`
                                    const selected = selectedEpisodes.has(key)
                                    const released = isEpisodeReleased(ep)
                                    return (
                                        <div
                                            key={key}
                                            className={`media-detail-episode-card ${selected ? 'watched' : ''} ${!released ? 'unreleased' : ''}`}
                                            onClick={() => handleEpisodeToggle(ep)}
                                            style={!released ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
                                        >
                                            {ep.still_path && (
                                                <div className="media-detail-episode-still">
                                                    <img src={imageUrl(ep.still_path) || ''} alt={ep.name || `Episode ${ep.episode_number}`} />
                                                </div>
                                            )}
                                            <div className="media-detail-episode-info">
                                                <div className="media-detail-episode-number">
                                                    <div className={`media-detail-episode-check ${selected ? 'checked' : ''}`}>
                                                        {selected && <span>✓</span>}
                                                    </div>
                                                    <span>Episode {ep.episode_number}</span>
                                                </div>
                                                <div className="media-detail-episode-details">
                                                    <strong>{ep.name || `Episode ${ep.episode_number}`}</strong>
                                                    {ep.air_date && <span> · {ep.air_date}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AddWithEpisodesModal
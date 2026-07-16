import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails, imageUrl } from '../services/tmdbService'
import EpisodeWatchModal from './EpisodeWatchModal'
import type { WatchlistItem, WatchlistEpisode } from '../types'

interface MediaDetailViewProps {
    item: WatchlistItem
    onClose: () => void
    onUpdate: () => void
}

const MediaDetailView: React.FC<MediaDetailViewProps> = ({ item, onClose, onUpdate }) => {
    const [episodes, setEpisodes] = useState<WatchlistEpisode[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedSeason, setSelectedSeason] = useState(item.current_season || 1)
    
    // Set initial season to the last watched episode's season
    useEffect(() => {
        const loadLastWatched = async () => {
            if (!item.tmdb_id) return
            try {
                const { data: watchedEpisodes } = await supabase
                    .from('watchlist_episodes')
                    .select('*')
                    .eq('watchlist_id', item.id)
                    .eq('watched', true)
                    .order('season_number', { ascending: false })
                    .order('episode_number', { ascending: false })
                    .limit(1)

                if (watchedEpisodes && watchedEpisodes.length > 0) {
                    setSelectedSeason(watchedEpisodes[0].season_number)
                }
            } catch (err) {
                console.error('Failed to load last watched episode:', err)
            }
        }
        loadLastWatched()
    }, [item.id, item.tmdb_id])
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodeModal, setEpisodeModal] = useState<{ watchlistId: string; episode: WatchlistEpisode } | null>(null)
    const [updatingStatus, setUpdatingStatus] = useState(false)

    const isAnime = item.media_type === 'anime'

    useEffect(() => {
        const loadEpisodes = async () => {
            setLoading(true)
            try {
                if (item.tmdb_id) {
                    const details = await getTVDetails(item.tmdb_id)
                    const seasonList = (details.seasons || [])
                        .filter((s: { season_number: number }) => s.season_number > 0)
                        .map((s: { season_number: number }) => s.season_number)
                    setSeasons(seasonList)

                    const { data: watchedEpisodes } = await supabase
                        .from('watchlist_episodes')
                        .select('*')
                        .eq('watchlist_id', item.id)
                        .eq('watched', true)

                    const allEpisodes: WatchlistEpisode[] = []
                    for (const season of seasonList) {
                        const sData = await getTVSeasonDetails(item.tmdb_id!, season as number)
                        const sEpisodes = sData.episodes || []
                        for (const ep of sEpisodes) {
                            const watched = watchedEpisodes?.find(we =>
                                we.season_number === season && we.episode_number === ep.episode_number
                            )
                            allEpisodes.push({
                                id: `${item.id}-${season}-${ep.episode_number}`,
                                watchlist_id: item.id,
                                season_number: season,
                                episode_number: ep.episode_number,
                                title: ep.name,
                                still_path: ep.still_path,
                                overview: ep.overview,
                                vote_average: ep.vote_average,
                                air_date: ep.air_date,
                                runtime: ep.runtime,
                                watched: !!watched,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            })
                        }
                    }
                    setEpisodes(allEpisodes)
                }
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
            setLoading(false)
        }
        loadEpisodes()
    }, [item.id, item.tmdb_id, item.total_episodes, isAnime, selectedSeason])

    const getFilteredEpisodes = () => {
        return episodes.filter(ep => ep.season_number === selectedSeason)
    }

    const isEpisodeReleased = (episode: WatchlistEpisode): boolean => {
        if (!episode.air_date) return true
        const airDate = new Date(episode.air_date)
        const today = new Date()
        return airDate <= today
    }

    const markEpisodeWatched = async (watchlistId: string, episode: WatchlistEpisode, markAll: boolean) => {
        if (markAll) {
            const itemEpisodes = episodes || []
            const episodesToMark = itemEpisodes.filter(ep => {
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

            const updates = episodesToMark.map(ep =>
                supabase.from('watchlist_episodes').upsert({
                    watchlist_id: watchlistId,
                    season_number: ep.season_number,
                    episode_number: ep.episode_number,
                    title: ep.title,
                    still_path: ep.still_path,
                    overview: ep.overview,
                    vote_average: ep.vote_average,
                    air_date: ep.air_date,
                    runtime: ep.runtime,
                    watched: true,
                    watched_at: new Date().toISOString()
                }, {
                    onConflict: 'watchlist_id,season_number,episode_number'
                })
            )

            await Promise.all(updates)

            setEpisodes(prev => prev.map((ep: WatchlistEpisode) => {
                const shouldMark = isEpisodeReleased(ep) && (
                    ep.season_number < episode.season_number ||
                    (ep.season_number === episode.season_number && ep.episode_number <= episode.episode_number)
                )
                return shouldMark ? { ...ep, watched: true } : ep
            }))

            const allReleasedWatched = episodes.every(ep => !isEpisodeReleased(ep) || ep.watched)
            if (allReleasedWatched && episodes.length > 0) {
                await supabase.from('watchlist').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', watchlistId)
                onUpdate()
            }
        } else {
            if (!isEpisodeReleased(episode)) {
                alert('Cannot mark unreleased episodes as watched!')
                setEpisodeModal(null)
                return
            }

            await supabase.from('watchlist_episodes').upsert({
                watchlist_id: watchlistId,
                season_number: episode.season_number,
                episode_number: episode.episode_number,
                title: episode.title,
                still_path: episode.still_path,
                overview: episode.overview,
                vote_average: episode.vote_average,
                air_date: episode.air_date,
                runtime: episode.runtime,
                watched: true,
                watched_at: new Date().toISOString()
            }, {
                onConflict: 'watchlist_id,season_number,episode_number'
            })

            setEpisodes(prev => prev.map(ep =>
                ep.id === episode.id ? { ...ep, watched: true } : ep
            ))

            const updatedEpisodes = episodes.map(ep =>
                ep.id === episode.id ? { ...ep, watched: true } : ep
            )
            const allWatched = updatedEpisodes.every(ep => ep.watched)
            if (allWatched && updatedEpisodes.length > 0) {
                await supabase.from('watchlist').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', watchlistId)
                onUpdate()
            }
        }

        setEpisodeModal(null)
    }

    const handleEpisodeClick = (episode: WatchlistEpisode) => {
        if (!episode.watched && isEpisodeReleased(episode)) {
            setEpisodeModal({ watchlistId: item.id, episode })
        }
    }

    // Auto-advance to next season when all episodes in current season are watched
    useEffect(() => {
        const checkSeasonComplete = async () => {
            if (seasons.length === 0 || episodes.length === 0) return
            
            const currentSeasonEpisodes = episodes.filter(ep => ep.season_number === selectedSeason)
            const allWatched = currentSeasonEpisodes.length > 0 && currentSeasonEpisodes.every(ep => ep.watched)
            
            if (allWatched && selectedSeason < Math.max(...seasons)) {
                const nextSeason = selectedSeason + 1
                setSelectedSeason(nextSeason)
                
                // Update current_season in database
                await supabase.from('watchlist').update({
                    current_season: nextSeason,
                    updated_at: new Date().toISOString()
                }).eq('id', item.id)
                
                onUpdate()
            }
        }
        checkSeasonComplete()
    }, [episodes, selectedSeason, seasons, item.id, onUpdate])

    const updateStatus = async (status: string) => {
        setUpdatingStatus(true)
        const updateData: Record<string, string> = { status, updated_at: new Date().toISOString() }
        await supabase.from('watchlist').update(updateData).eq('id', item.id)
        
        setUpdatingStatus(false)
        onUpdate()
    }

    const removeItem = async () => {
        if (!confirm('Remove from watchlist?')) return
        const { error } = await supabase.from('watchlist').delete().eq('id', item.id)
        if (!error) {
            onUpdate()
            onClose()
        }
    }

    const filteredEpisodes = getFilteredEpisodes()
    const watchedCount = episodes.filter(ep => ep.watched).length
    const totalCount = episodes.length
    const posterUrl = item.poster_path
        ? (isAnime ? item.poster_path : imageUrl(item.poster_path))
        : null

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="media-detail-view" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                <div className="media-detail-layout">
                    {/* Left: Info Panel */}
                    <div className="media-detail-info">
                        {posterUrl && (
                            <div className="media-detail-poster">
                                <img src={posterUrl} alt={item.title} />
                            </div>
                        )}
                        <h2 className="media-detail-title">{item.title}</h2>
                        <span className="media-card__type">{item.media_type === 'anime' ? 'Anime' : 'TV Show'}</span>

                        {item.overview && (
                            <p className="media-detail-overview">{item.overview}</p>
                        )}

                        <div className="media-detail-meta">
                            {item.release_date && <span>📅 {item.release_date}</span>}
                            {item.vote_average && <span>⭐ {item.vote_average.toFixed(1)}</span>}
                            {totalCount > 0 && <span>📺 {totalCount} episodes</span>}
                            {seasons.length > 0 && <span>📦 {seasons.length} seasons</span>}
                        </div>

                        {totalCount > 0 && (
                            <div className="media-detail-progress">
                                <div className="media-detail-progress-bar">
                                    <div
                                        className="media-detail-progress-fill"
                                        style={{ width: `${Math.round((watchedCount / totalCount) * 100)}%` }}
                                    />
                                </div>
                                <span className="media-detail-progress-text">
                                    {watchedCount}/{totalCount} ({Math.round((watchedCount / totalCount) * 100)}%)
                                </span>
                            </div>
                        )}

                        <div className="media-detail-actions">
                            <button
                                className={`watchlist-status-btn ${item.status === 'watching' ? 'active' : ''}`}
                                onClick={() => updateStatus('watching')}
                                disabled={updatingStatus}
                            >Watching</button>
                            <button
                                className={`watchlist-status-btn ${item.status === 'dropped' ? 'active' : ''}`}
                                onClick={() => updateStatus('dropped')}
                                disabled={updatingStatus}
                            >Drop</button>
                            <button
                                className="watchlist-remove-btn"
                                onClick={removeItem}
                                style={{ marginTop: '0.5rem' }}
                            >Remove from Watchlist</button>
                        </div>
                    </div>

                    {/* Right: Episodes Panel */}
                    <div className="media-detail-episodes">
                        <div className="media-detail-episodes-header">
                            <h3>Episodes</h3>
                            {seasons.length > 1 && (
                                <div className="media-detail-season-tabs">
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
                        </div>

                        <div className="media-detail-episodes-list">
                            {loading ? (
                                <div className="discover-loading"><div className="discover-spinner" /><p>Loading episodes...</p></div>
                            ) : filteredEpisodes.length === 0 ? (
                                <p style={{ textAlign: 'center', opacity: 0.6, padding: '2rem' }}>No episodes available</p>
                            ) : (
                                filteredEpisodes.map(ep => {
                                    const released = isEpisodeReleased(ep)
                                    return (
                                        <div
                                            key={ep.id}
                                            className={`media-detail-episode-card ${ep.watched ? 'watched' : ''} ${!released ? 'unreleased' : ''}`}
                                            onClick={() => released ? handleEpisodeClick(ep) : undefined}
                                            style={!released ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
                                        >
                                            {ep.still_path && (
                                                <div className="media-detail-episode-still">
                                                    <img src={imageUrl(ep.still_path) || ''} alt={ep.title || `Episode ${ep.episode_number}`} />
                                                </div>
                                            )}
                                            <div className="media-detail-episode-info">
                                                <div className="media-detail-episode-number">
                                                    <div className={`media-detail-episode-check ${ep.watched ? 'checked' : ''}`}>
                                                        {ep.watched && <span>✓</span>}
                                                    </div>
                                                    <span>Episode {ep.episode_number}</span>
                                                </div>
                                                <div className="media-detail-episode-details">
                                                    <strong>{ep.title || `Episode ${ep.episode_number}`}</strong>
                                                    {ep.overview && <p>{ep.overview.slice(0, 120)}...</p>}
                                                    <div className="media-detail-episode-meta">
                                                        {ep.air_date && <span>{ep.air_date}</span>}
                                                        {ep.runtime && <span>{ep.runtime} min</span>}
                                                        {released && ep.vote_average && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                    </div>
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

            {episodeModal && (
                <EpisodeWatchModal
                    episode={episodeModal.episode}
                    onClose={() => setEpisodeModal(null)}
                    onMarkSingle={() => markEpisodeWatched(episodeModal.watchlistId, episodeModal.episode, false)}
                    onMarkAll={() => markEpisodeWatched(episodeModal.watchlistId, episodeModal.episode, true)}
                />
            )}
        </div>
    )
}

export default MediaDetailView
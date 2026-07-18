import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails, imageUrl } from '../services/tmdbService'
import EpisodeWatchModal from './EpisodeWatchModal'
import type { TMDBResult, WatchlistItem, WatchlistEpisode } from '../types'

interface DiscoverDetailViewProps {
    item: TMDBResult
    onClose: () => void
    onAdd: (item: WatchlistItem) => void
    isInWatchlist: boolean
}

const DiscoverDetailView: React.FC<DiscoverDetailViewProps> = ({ item, onClose, onAdd, isInWatchlist }) => {
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<WatchlistEpisode[]>([])
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [episodeModal, setEpisodeModal] = useState<{ watchlistId: string; episode: WatchlistEpisode } | null>(null)

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true)
            try {
                if (item.media_type === 'tv') {
                    const data = await getTVDetails(item.id)
                    setDetails(data)
                    if (data.seasons?.[0]) {
                        setSelectedSeason(data.seasons[0].season_number)
                    }
                } else {
                    setDetails(item)
                }
            } catch (err) {
                console.error('Failed to load details:', err)
                setDetails(item)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [item])

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!details || item.media_type !== 'tv') return
            try {
                const detailsData = await getTVDetails(item.id)
                const seasonList = (detailsData.seasons || [])
                    .filter((s: { season_number: number }) => s.season_number > 0)
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

                // If already in watchlist, load watched episodes
                let watchedEpisodes: WatchlistEpisode[] = []
                if (isInWatchlist && watchlistId) {
                    const { data: we } = await supabase
                        .from('watchlist_episodes')
                        .select('*')
                        .eq('watchlist_id', watchlistId)
                        .eq('watched', true)
                    watchedEpisodes = we || []
                }

                const allEpisodes: WatchlistEpisode[] = []
                for (const season of seasonList) {
                    const sData = await getTVSeasonDetails(item.id, season)
                    const sEpisodes = sData.episodes || []
                    for (const ep of sEpisodes) {
                        const watched = watchedEpisodes?.find(we =>
                            we.season_number === season && we.episode_number === ep.episode_number
                        )
                        allEpisodes.push({
                            id: `${item.id}-${season}-${ep.episode_number}`,
                            watchlist_id: watchlistId || '',
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
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
        }
        loadEpisodes()
    }, [details, item.id, item.media_type, isInWatchlist, watchlistId])

    const getFilteredEpisodes = () => {
        return episodes.filter(ep => ep.season_number === selectedSeason)
    }

    const isEpisodeReleased = (episode: WatchlistEpisode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
    }

    const handleAdd = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            alert('Please log in')
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
            setWatchlistId(data.id)
            onAdd(data)
        }
    }

    const markEpisodeWatched = async (epWatchlistId: string, episode: WatchlistEpisode, markAll: boolean) => {
        if (markAll) {
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

            const updates = episodesToMark.map(ep =>
                supabase.from('watchlist_episodes').upsert({
                    watchlist_id: epWatchlistId,
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
        } else {
            if (!isEpisodeReleased(episode)) {
                alert('Cannot mark unreleased episodes as watched!')
                setEpisodeModal(null)
                return
            }

            await supabase.from('watchlist_episodes').upsert({
                watchlist_id: epWatchlistId,
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
        }

        setEpisodeModal(null)
    }

    const handleEpisodeClick = (episode: WatchlistEpisode) => {
        if (!isInWatchlist) {
            // First add to watchlist, then mark episode
            handleAdd().then(() => {
                if (watchlistId) {
                    setEpisodeModal({ watchlistId, episode })
                }
            })
        } else if (!episode.watched && isEpisodeReleased(episode)) {
            setEpisodeModal({ watchlistId: watchlistId!, episode })
        }
    }

    const filteredEpisodes = getFilteredEpisodes()
    const watchedCount = episodes.filter(ep => ep.watched).length
    const totalCount = episodes.length
    const posterUrl = item.poster_path ? imageUrl(item.poster_path) : null
    const title = item.title || item.name || 'Untitled'
    const year = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || ''
    const rating = details?.vote_average?.toFixed(1) || item.vote_average?.toFixed(1)
    const overview = details?.overview || item.overview || 'No description available.'

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="media-detail-view" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                {loading ? (
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading details...</p></div>
                ) : (
                    <div className="media-detail-layout">
                        <div className="media-detail-info">
                            {posterUrl && (
                                <div className="media-detail-poster">
                                    <img src={posterUrl} alt={title} />
                                </div>
                            )}
                            <h2 className="media-detail-title">{title}</h2>
                            <span className="media-card__type">TV Show</span>

                            {overview && (
                                <p className="media-detail-overview">{overview}</p>
                            )}

                            <div className="media-detail-meta">
                                {year && <span>📅 {year}</span>}
                                {rating && <span>⭐ {rating}</span>}
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

                            {!isInWatchlist && (
                                <div style={{ marginTop: '1rem' }}>
                                    <button
                                        className="modal-btn modal-btn--watch"
                                        onClick={handleAdd}
                                        style={{ width: '100%' }}
                                    >
                                        Add to Watchlist
                                    </button>
                                </div>
                            )}
                        </div>

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
                )}
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

export default DiscoverDetailView
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { getMovieDetails, getTVDetails, getTVSeasonDetails, imageUrl } from '../../services/tmdbService'
import EpisodeWatchModal from '../modals/EpisodeWatchModal'
import type { TMDBResult, WatchlistItem, WatchlistEpisode } from '../../types'

interface MediaDetailViewProps {
    item: TMDBResult | WatchlistItem
    mode: 'browse' | 'watchlist'
    onClose: () => void
    onAdd?: (item: TMDBResult, status: string) => void
    onAddWatchlistItem?: (item: WatchlistItem) => void
    onUpdate?: () => void
    onPersonClick?: (person: TMDBResult) => void
}

interface Season {
    season_number: number
    episode_count?: number
}

const MediaDetailView: React.FC<MediaDetailViewProps> = ({ 
    item, 
    mode, 
    onClose, 
    onAdd, 
    onAddWatchlistItem, 
    onUpdate, 
    onPersonClick 
}) => {
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<WatchlistEpisode[]>([])
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [episodeModal, setEpisodeModal] = useState<{ watchlistId: string; episode: WatchlistEpisode } | null>(null)
    const [updatingStatus, setUpdatingStatus] = useState(false)
    const hasUserSelectedSeason = useRef(false)
    const prevItemIdRef = useRef<string | null>(null)

    const isWatchlistItem = 'id' in item && typeof item.id === 'string'
    const tmdbId = isWatchlistItem ? (item as WatchlistItem).tmdb_id : (item as TMDBResult).id
    const isInWatchlist = mode === 'watchlist' || watchlistId !== null
    const isTV = isWatchlistItem 
        ? (item as WatchlistItem).media_type === 'tv' || (item as WatchlistItem).media_type === 'anime'
        : (item as TMDBResult).media_type === 'tv'
    const isAnime = isWatchlistItem ? (item as WatchlistItem).media_type === 'anime' : false

    // Set initial season to the last watched episode's season (only for watchlist mode)
    useEffect(() => {
        if (!isWatchlistItem) return
        const loadLastWatched = async () => {
            const watchlistItemId = (item as WatchlistItem).id
            if (!tmdbId || prevItemIdRef.current === watchlistItemId) return
            
            try {
                const { data: watchedEpisodes } = await supabase
                    .from('watchlist_episodes')
                    .select('*')
                    .eq('watchlist_id', watchlistItemId)
                    .eq('watched', true)
                    .order('season_number', { ascending: false })
                    .order('episode_number', { ascending: false })
                    .limit(1)

                if (watchedEpisodes && watchedEpisodes.length > 0 && !hasUserSelectedSeason.current) {
                    setSelectedSeason(watchedEpisodes[0].season_number)
                }
            } catch (err) {
                console.error('Failed to load last watched episode:', err)
            } finally {
                prevItemIdRef.current = watchlistItemId
            }
        }
        loadLastWatched()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tmdbId, isWatchlistItem])

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true)
            try {
                if (isWatchlistItem) {
                    // For watchlist items, we already have basic info, fetch TMDB details
                    if (tmdbId) {
                        const data = await getTVDetails(tmdbId)
                        setDetails(data)
                        if (data.seasons?.[0]) {
                            setSelectedSeason(data.seasons[0].season_number)
                        }
                    }
                } else {
                    const tmdbItem = item as TMDBResult
                    if (tmdbItem.media_type === 'movie') {
                        const data = await getMovieDetails(tmdbItem.id)
                        setDetails(data)
                    } else if (tmdbItem.media_type === 'tv') {
                        const data = await getTVDetails(tmdbItem.id)
                        setDetails(data)
                        if (data.seasons?.[0]) {
                            setSelectedSeason(data.seasons[0].season_number)
                        }
                    } else {
                        setDetails(tmdbItem)
                    }
                }
            } catch (err) {
                console.error('Failed to load details:', err)
                setDetails(item as TMDBResult)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [item, isWatchlistItem, tmdbId])

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!details || !isTV || !tmdbId) return
            
            try {
                const detailsData = await getTVDetails(tmdbId)
                const seasonList = (detailsData.seasons || [])
                    .filter((s: { season_number: number }) => s.season_number > 0)
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

                let watchedEpisodes: WatchlistEpisode[] = []
                const currentWatchlistId = watchlistId || (isWatchlistItem ? (item as WatchlistItem).id : '')
                if (isInWatchlist && (watchlistId || isWatchlistItem)) {
                    const { data: we } = await supabase
                        .from('watchlist_episodes')
                        .select('*')
                        .eq('watchlist_id', currentWatchlistId)
                        .eq('watched', true)
                    watchedEpisodes = we || []
                }

                const allEpisodes: WatchlistEpisode[] = []
                for (const season of seasonList) {
                    const sData = await getTVSeasonDetails(tmdbId, season)
                    const sEpisodes = sData.episodes || []
                    for (const ep of sEpisodes) {
                        const watched = watchedEpisodes?.find(we =>
                            we.season_number === season && we.episode_number === ep.episode_number
                        )
                        allEpisodes.push({
                            id: `${tmdbId}-${season}-${ep.episode_number}`,
                            watchlist_id: currentWatchlistId,
                            season_number: season,
                            episode_number: ep.episode_number,
                            tmdb_episode_id: ep.id,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [details, isTV, tmdbId, isInWatchlist, watchlistId, isWatchlistItem])

    // Auto-advance to next season when all episodes in current season are watched (watchlist mode only)
    useEffect(() => {
        if (!isWatchlistItem || seasons.length === 0 || episodes.length === 0 || hasUserSelectedSeason.current) return
        
        const checkSeasonComplete = async () => {
            const currentSeasonEpisodes = episodes.filter(ep => ep.season_number === selectedSeason)
            const allWatched = currentSeasonEpisodes.length > 0 && currentSeasonEpisodes.every(ep => ep.watched)
            
            if (allWatched && selectedSeason < Math.max(...seasons)) {
                const nextSeason = selectedSeason + 1
                setSelectedSeason(nextSeason)
                
                await supabase.from('watchlist').update({
                    current_season: nextSeason,
                    updated_at: new Date().toISOString()
                }).eq('id', (item as WatchlistItem).id)
                
                onUpdate?.()
            }
        }
        checkSeasonComplete()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [episodes, selectedSeason, seasons, onUpdate, isWatchlistItem])

    const handleSeasonChange = (season: number) => {
        hasUserSelectedSeason.current = true
        setSelectedSeason(season)
    }

    const getFilteredEpisodes = () => {
        return episodes.filter(ep => ep.season_number === selectedSeason)
    }

    const isEpisodeReleased = (episode: WatchlistEpisode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
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
                    tmdb_episode_id: ep.tmdb_episode_id,
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

            // Auto-complete if all released episodes are watched (watchlist mode only)
            if (isWatchlistItem) {
                const allReleasedWatched = episodes.every(ep => !isEpisodeReleased(ep) || ep.watched)
                if (allReleasedWatched && episodes.length > 0) {
                    await supabase.from('watchlist').update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('id', epWatchlistId)
                    onUpdate?.()
                }
            }
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
                tmdb_episode_id: episode.tmdb_episode_id,
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

            // Auto-complete if all episodes are watched (watchlist mode only)
            if (isWatchlistItem) {
                const updatedEpisodes = episodes.map(ep =>
                    ep.id === episode.id ? { ...ep, watched: true } : ep
                )
                const allWatched = updatedEpisodes.every(ep => ep.watched)
                if (allWatched && updatedEpisodes.length > 0) {
                    await supabase.from('watchlist').update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('id', epWatchlistId)
                    onUpdate?.()
                }
            }
        }

        setEpisodeModal(null)
    }

    const handleEpisodeClick = (episode: WatchlistEpisode) => {
        const currentWatchlistId = watchlistId || (isWatchlistItem ? (item as WatchlistItem).id : null)
        
        if (!isInWatchlist && mode === 'browse') {
            // First add to watchlist, then mark episode
            handleAddToWatchlist().then(() => {
                if (watchlistId) {
                    setEpisodeModal({ watchlistId, episode })
                }
            })
        } else if (!episode.watched && isEpisodeReleased(episode) && currentWatchlistId) {
            setEpisodeModal({ watchlistId: currentWatchlistId, episode })
        }
    }

    const handleAddToWatchlist = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            alert('Please log in')
            return
        }

        const tmdbItem = item as TMDBResult
        const itemTitle = tmdbItem.title || tmdbItem.name || ''
        const { data, error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: 'tv',
            tmdb_id: tmdbItem.id,
            title: itemTitle,
            poster_path: tmdbItem.poster_path,
            overview: tmdbItem.overview,
            release_date: tmdbItem.release_date || tmdbItem.first_air_date,
            vote_average: tmdbItem.vote_average,
            status: 'watching'
        }).select().single()

        if (error) {
            alert('Error: ' + error.message)
        } else if (data) {
            setWatchlistId(data.id)
            onAddWatchlistItem?.(data)
        }
    }

    const handleAdd = async (status: string) => {
        if (!onAdd) return
        setAdding(true)
        await onAdd(item as TMDBResult, status)
        setAdding(false)
    }

    const markAllCurrentEpisodesWatched = async () => {
        if (!isWatchlistItem) return
        const releasedEpisodes = episodes.filter(ep => isEpisodeReleased(ep) && !ep.watched)
        if (releasedEpisodes.length === 0) return

        const updates = releasedEpisodes.map(ep =>
            supabase.from('watchlist_episodes').upsert({
                watchlist_id: (item as WatchlistItem).id,
                season_number: ep.season_number,
                episode_number: ep.episode_number,
                tmdb_episode_id: ep.tmdb_episode_id,
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

        setEpisodes(prev => prev.map((ep: WatchlistEpisode) =>
            isEpisodeReleased(ep) ? { ...ep, watched: true } : ep
        ))

        const allReleasedWatched = episodes.every(ep => !isEpisodeReleased(ep) || ep.watched)
        if (allReleasedWatched && episodes.length > 0) {
            await supabase.from('watchlist').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', (item as WatchlistItem).id)
            onUpdate?.()
        }
    }

    const updateStatus = async (status: string) => {
        if (!isWatchlistItem) return
        setUpdatingStatus(true)
        const updateData: Record<string, string> = { status, updated_at: new Date().toISOString() }
        await supabase.from('watchlist').update(updateData).eq('id', (item as WatchlistItem).id)
        
        setUpdatingStatus(false)
        onUpdate?.()
    }

    const removeItem = async () => {
        if (!isWatchlistItem) return
        if (!confirm('Remove from watchlist?')) return
        const { error } = await supabase.from('watchlist').delete().eq('id', (item as WatchlistItem).id)
        if (!error) {
            onUpdate?.()
            onClose()
        }
    }

    const filteredEpisodes = getFilteredEpisodes()
    const watchedCount = episodes.filter(ep => ep.watched).length
    const totalCount = episodes.length
    
    const getItemTitle = (item: TMDBResult | WatchlistItem): string => {
        return item.title || ('name' in item ? item.name : '') || 'Untitled'
    }
    const title = getItemTitle(item)
    
    const year = isWatchlistItem 
        ? (item as WatchlistItem).release_date?.slice(0, 4) 
        : (item as TMDBResult).release_date?.slice(0, 4) || ('first_air_date' in item ? (item as TMDBResult).first_air_date?.slice(0, 4) : undefined) || ''
    
    const rating = details?.vote_average?.toFixed(1) || (item as TMDBResult).vote_average?.toFixed(1)
    const overview = details?.overview || (item as TMDBResult).overview || 'No description available.'
    const genres = details?.genres || []
    const cast = details?.credits?.cast?.slice(0, 10) || details?.aggregate_credits?.cast?.slice(0, 10) || []
    const runtime = details?.runtime
    const totalEpisodes = details?.episodes || (item as TMDBResult).episodes || details?.number_of_episodes || 0
    const totalSeasons = details?.seasons?.length || details?.number_of_seasons || 0
    const mediaStatus = details?.status || (item as WatchlistItem).status
    const seasonsList = details?.seasons || []

    const posterUrl = isWatchlistItem
        ? ((item as WatchlistItem).poster_path 
            ? (isAnime ? (item as WatchlistItem).poster_path : imageUrl((item as WatchlistItem).poster_path || ''))
            : null)
        : imageUrl((item as TMDBResult).poster_path || null)

    const isBrowseMode = mode === 'browse'
    const showCast = isBrowseMode && cast.length > 0
    const showStatusButtons = mode === 'watchlist'
    const showAddButtons = isBrowseMode && !isInWatchlist
    const showProgress = isTV && totalCount > 0

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className={isBrowseMode ? "modal-content" : "media-detail-view"} onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                {loading ? (
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading details...</p></div>
                ) : (
                    <div className={isBrowseMode ? "modal-layout" : "media-detail-layout"}>
                        <div className={isBrowseMode ? "modal-poster" : "media-detail-poster"}>
                            {posterUrl ? (
                                <img src={posterUrl} alt={title} />
                            ) : (
                                <div className={isBrowseMode ? "discover-card__no-poster" : "media-card__no-poster"} style={{ height: '100%', minHeight: '300px' }}>
                                    <span>{title}</span>
                                </div>
                            )}
                        </div>

                        <div className={isBrowseMode ? "modal-info" : "media-detail-info"}>
                            <h2 className={isBrowseMode ? "modal-title" : "media-detail-title"}>{title}</h2>
                            <span className="media-card__type">{isAnime ? 'Anime' : isTV ? 'TV Show' : isWatchlistItem ? (item as WatchlistItem).media_type : (item as TMDBResult).media_type}</span>

                            <div className={isBrowseMode ? "modal-meta" : "media-detail-meta"}>
                                {year && <span>{year}</span>}
                                {rating && <span className={isBrowseMode ? "modal-rating" : ""}>★ {rating}</span>}
                                {runtime && !isTV && <span>{runtime} min</span>}
                                {totalEpisodes && <span>{totalEpisodes} episodes</span>}
                                {totalSeasons > 0 && <span>{totalSeasons} seasons</span>}
                                {mediaStatus && <span>{mediaStatus}</span>}
                            </div>

                            {isBrowseMode && genres.length > 0 && (
                                <div className="modal-genres">
                                    {genres.map((g: { id: number; name: string } | string) => (
                                        <span key={typeof g === 'object' ? g.id : g} className="modal-genre-tag">{typeof g === 'object' ? g.name : g}</span>
                                    ))}
                                </div>
                            )}

                            <p className={isBrowseMode ? "modal-overview" : "media-detail-overview"}>{overview}</p>

                            {showCast && (
                                <div className="modal-cast">
                                    <h4>Cast</h4>
                                    <div className="modal-cast-list">
                                        {cast.map((c: { id: number; name: string; profile_path?: string }) => (
                                            <span 
                                                key={c.id || c.name} 
                                                className="modal-cast-item" 
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => onPersonClick?.({ 
                                                    id: c.id, 
                                                    name: c.name, 
                                                    profile_path: c.profile_path,
                                                    media_type: 'person' as const
                                                })}
                                            >
                                                {c.profile_path && (
                                                    <img src={imageUrl(c.profile_path) || ''} alt={c.name} />
                                                )}
                                                <span>{c.name}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isBrowseMode && isInWatchlist && (
                                <div className="modal-in-watchlist">✓ Already in your watchlist</div>
                            )}

                            {showProgress && (
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

                            {showAddButtons && (
                                <div className={isBrowseMode ? "modal-actions" : ""} style={isBrowseMode ? {} : { marginTop: '1rem' }}>
                                    <button className="modal-btn modal-btn--watch" onClick={() => handleAdd('watching')} disabled={adding}>
                                        {adding ? 'Adding...' : 'Add to Watchlist'}
                                    </button>
                                    {!isTV && (
                                        <button className="modal-btn modal-btn--done" onClick={() => handleAdd('completed')} disabled={adding}>
                                            Already Watched
                                        </button>
                                    )}
                                </div>
                            )}

                            {isBrowseMode && isInWatchlist && (
                                <div className="modal-in-watchlist">✓ Already in your watchlist</div>
                            )}

                            {showStatusButtons && (
                                <div className="media-detail-actions">
                                    <button
                                        className={`watchlist-status-btn ${(item as WatchlistItem).status === 'watching' ? 'active' : ''}`}
                                        onClick={() => updateStatus('watching')}
                                        disabled={updatingStatus}
                                    >Watching</button>
                                    <button
                                        className={`watchlist-status-btn ${(item as WatchlistItem).status === 'dropped' ? 'active' : ''}`}
                                        onClick={() => updateStatus('dropped')}
                                        disabled={updatingStatus}
                                    >Drop</button>
                                    <button
                                        className="watchlist-remove-btn"
                                        onClick={removeItem}
                                        style={{ marginTop: '0.5rem' }}
                                    >Remove from Watchlist</button>
                                </div>
                            )}

                            {!isInWatchlist && isTV && isBrowseMode && (
                                <div style={{ marginTop: '1rem' }}>
                                    <button
                                        className="modal-btn modal-btn--watch"
                                        onClick={handleAddToWatchlist}
                                        style={{ width: '100%' }}
                                    >
                                        Add to Watchlist
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Episodes for TV */}
                        {isTV && seasonsList.length > 0 && (
                            <div className={isBrowseMode ? "modal-episodes" : "media-detail-episodes"}>
                                <div className={isBrowseMode ? "" : "media-detail-episodes-header"}>
                                    <h4>Episodes</h4>
                                    {seasonsList.length > 1 && (
                                        <div className={isBrowseMode ? "modal-season-tabs" : "media-detail-season-tabs"}>
                                            {seasonsList.filter((s: Season) => s.season_number > 0).map((s: Season) => (
                                                <button
                                                    key={s.season_number}
                                                    className={isBrowseMode 
                                                        ? `modal-season-tab ${selectedSeason === s.season_number ? 'active' : ''}`
                                                        : `media-detail-season-tab ${selectedSeason === s.season_number ? 'active' : ''}`
                                                    }
                                                    onClick={() => isWatchlistItem ? handleSeasonChange(s.season_number) : setSelectedSeason(s.season_number)}
                                                >
                                                    {isBrowseMode ? `S${s.season_number}` : `Season ${s.season_number}`}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {filteredEpisodes.length > 0 && (
                                    <div className={isBrowseMode ? "modal-episode-list" : "media-detail-episodes-list"}>
                                        {filteredEpisodes.map((ep: WatchlistEpisode) => (
                                            <div 
                                                key={ep.id} 
                                                className={isBrowseMode 
                                                    ? "modal-episode-item"
                                                    : `media-detail-episode-card ${ep.watched ? 'watched' : ''} ${!isEpisodeReleased(ep) ? 'unreleased' : ''}`
                                                }
                                                onClick={() => isBrowseMode ? undefined : (isEpisodeReleased(ep) ? handleEpisodeClick(ep) : undefined)}
                                                style={isBrowseMode ? {} : (!isEpisodeReleased(ep) ? { cursor: 'not-allowed', opacity: 0.6 } : {})}
                                            >
                                                {isBrowseMode ? (
                                                    <>
                                                        <div className="modal-episode-num">{ep.episode_number}</div>
                                                        <div className="modal-episode-info">
                                                            <strong>{ep.title}</strong>
                                                            {ep.runtime && <span> · {ep.runtime}min</span>}
                                                            {ep.vote_average && <span> · ★ {ep.vote_average.toFixed(1)}</span>}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
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
                                                                    {isEpisodeReleased(ep) && ep.vote_average && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {episodeModal && (
                <EpisodeWatchModal
                    episode={episodeModal.episode}
                    onClose={() => setEpisodeModal(null)}
                    onMarkSingle={() => markEpisodeWatched(episodeModal.watchlistId, episodeModal.episode, false)}
                    onMarkAll={() => markEpisodeWatched(episodeModal.watchlistId, episodeModal.episode, true)}
                    onMarkAllWatched={isWatchlistItem ? markAllCurrentEpisodesWatched : undefined}
                />
            )}
        </div>
    )
}

export default MediaDetailView

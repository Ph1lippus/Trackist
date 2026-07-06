import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { imageUrl } from '../services/tmdbService'
import { getTVDetails, getTVSeasonDetails } from '../services/tmdbService'
import EpisodeWatchModal from '../components/EpisodeWatchModal'
import type { WatchlistItem, WatchlistEpisode } from '../types'

const Watchlist: React.FC = () => {
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [episodes, setEpisodes] = useState<Record<string, WatchlistEpisode[]>>({})
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'planning' | 'watching' | 'completed' | 'dropped'>('all')
    const [updating, setUpdating] = useState<string | null>(null)
    const [expandedItem, setExpandedItem] = useState<string | null>(null)
    const [loadingEpisodes, setLoadingEpisodes] = useState<string | null>(null)
    const [episodeModal, setEpisodeModal] = useState<{ watchlistId: string; episode: WatchlistEpisode } | null>(null)

    const loadEpisodesFromDB = async (watchlistId: string, tmdbId: number) => {
        try {
            // Load watched episodes from database
            const { data: watchedEpisodes, error } = await supabase
                .from('watchlist_episodes')
                .select('*')
                .eq('watchlist_id', watchlistId)
                .eq('watched', true)

            if (error || !watchedEpisodes || watchedEpisodes.length === 0) {
                // If no watched episodes in DB, fetch from TMDB and initialize
                await loadEpisodes(watchlistId, tmdbId)
                return
            }

            // Fetch all episodes from TMDB
            const details = await getTVDetails(tmdbId)
            const allEpisodes: WatchlistEpisode[] = []
            
            for (const season of (details.seasons || []).filter((s: { season_number: number }) => s.season_number > 0)) {
                const seasonData = await getTVSeasonDetails(tmdbId, season.season_number)
                const seasonEpisodes = seasonData.episodes || []
                
                for (const ep of seasonEpisodes) {
                    const episodeId = `${watchlistId}-${season.season_number}-${ep.episode_number}`
                    const watchedEpisode = watchedEpisodes.find(we => 
                        we.season_number === season.season_number && 
                        we.episode_number === ep.episode_number
                    )
                    
                    allEpisodes.push({
                        id: episodeId,
                        watchlist_id: watchlistId,
                        season_number: season.season_number,
                        episode_number: ep.episode_number,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        vote_average: ep.vote_average,
                        air_date: ep.air_date,
                        runtime: ep.runtime,
                        watched: !!watchedEpisode,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                }
            }
            
            setEpisodes(prev => ({ ...prev, [watchlistId]: allEpisodes }))
        } catch (err) {
            console.error('Failed to load episodes from DB:', err)
        }
    }

    const loadEpisodes = async (watchlistId: string, tmdbId: number) => {
        if (episodes[watchlistId]) return
        
        setLoadingEpisodes(watchlistId)
        try {
            const details = await getTVDetails(tmdbId)
            const allEpisodes: WatchlistEpisode[] = []
            
            for (const season of (details.seasons || []).filter((s: { season_number: number }) => s.season_number > 0)) {
                const seasonData = await getTVSeasonDetails(tmdbId, season.season_number)
                const seasonEpisodes = seasonData.episodes || []
                
                for (const ep of seasonEpisodes) {
                    allEpisodes.push({
                        id: `${watchlistId}-${season.season_number}-${ep.episode_number}`,
                        watchlist_id: watchlistId,
                        season_number: season.season_number,
                        episode_number: ep.episode_number,
                        title: ep.name,
                        still_path: ep.still_path,
                        overview: ep.overview,
                        vote_average: ep.vote_average,
                        air_date: ep.air_date,
                        runtime: ep.runtime,
                        watched: false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                }
            }
            setEpisodes(prev => ({ ...prev, [watchlistId]: allEpisodes }))
        } catch (err) {
            console.error('Failed to fetch episodes:', err)
        } finally {
            setLoadingEpisodes(null)
        }
    }

    const markEpisodeWatched = async (watchlistId: string, episode: WatchlistEpisode, markAll: boolean) => {
        if (markAll) {
            const itemEpisodes = episodes[watchlistId] || []
            // Get all episodes from the clicked one onwards (including the clicked one)
            const subsequentEpisodes = itemEpisodes.filter(ep => {
                if (ep.season_number > episode.season_number) return true
                if (ep.season_number === episode.season_number && ep.episode_number >= episode.episode_number) return true
                return false
            })
            
            // Save all subsequent episodes to database
            const updates = subsequentEpisodes.map(ep => 
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
            
            // Update local state
            setEpisodes(prev => {
                const updatedEpisodes = (prev[watchlistId] || []).map((ep: WatchlistEpisode) => {
                    const isSubsequent = ep.season_number > episode.season_number ||
                        (ep.season_number === episode.season_number && ep.episode_number >= episode.episode_number)
                    return isSubsequent ? { ...ep, watched: true } : ep
                })
                
                // Check if all episodes are now watched
                const allWatched = updatedEpisodes.every(ep => ep.watched)
                if (allWatched && updatedEpisodes.length > 0) {
                    supabase.from('watchlist').update({ 
                        status: 'completed', 
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('id', watchlistId)
                    
                    setItems(items.map(item => item.id === watchlistId ? { ...item, status: 'completed' } : item))
                }
                
                return {
                    ...prev,
                    [watchlistId]: updatedEpisodes
                }
            })
        } else {
            // Mark single episode as watched
            const { error } = await supabase.from('watchlist_episodes').upsert({
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

            if (!error) {
                setEpisodes(prev => {
                    const updatedEpisodes = (prev[watchlistId] || []).map((ep: WatchlistEpisode) => 
                        ep.id === episode.id ? { ...ep, watched: true } : ep
                    )
                    
                    // Check if all episodes are now watched
                    const allWatched = updatedEpisodes.every(ep => ep.watched)
                    if (allWatched && updatedEpisodes.length > 0) {
                        supabase.from('watchlist').update({ 
                            status: 'completed', 
                            completed_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }).eq('id', watchlistId)
                        
                        setItems(items.map(item => item.id === watchlistId ? { ...item, status: 'completed' } : item))
                    }
                    
                    return {
                        ...prev,
                        [watchlistId]: updatedEpisodes
                    }
                })
            }
        }
        
        setEpisodeModal(null)
    }

    const handleEpisodeClick = (watchlistId: string, episode: WatchlistEpisode) => {
        if (!episode.watched) {
            setEpisodeModal({ watchlistId, episode })
        } else {
            toggleEpisodeUnwatch(watchlistId, episode)
        }
    }

    const toggleEpisodeUnwatch = async (watchlistId: string, episode: WatchlistEpisode) => {
        const { error } = await supabase.from('watchlist_episodes').upsert({
            watchlist_id: watchlistId,
            season_number: episode.season_number,
            episode_number: episode.episode_number,
            title: episode.title,
            still_path: episode.still_path,
            overview: episode.overview,
            vote_average: episode.vote_average,
            air_date: episode.air_date,
            runtime: episode.runtime,
            watched: false,
            watched_at: null
        }, {
            onConflict: 'watchlist_id,season_number,episode_number'
        })

        if (!error) {
            setEpisodes(prev => {
                const updatedEpisodes = (prev[watchlistId] || []).map((ep: WatchlistEpisode) => 
                    ep.id === episode.id ? { ...ep, watched: false } : ep
                )
                
                const item = items.find(i => i.id === watchlistId)
                if (item && item.status === 'completed') {
                    supabase.from('watchlist').update({ 
                        status: 'watching', 
                        updated_at: new Date().toISOString()
                    }).eq('id', watchlistId)
                    
                    setItems(items.map(i => i.id === watchlistId ? { ...i, status: 'watching' } : i))
                }
                
                return {
                    ...prev,
                    [watchlistId]: updatedEpisodes
                }
            })
        }
    }

    const updateStatus = async (id: string, status: string) => {
        setUpdating(id)
        const updateData: Record<string, string> = { status, updated_at: new Date().toISOString() }
        
        if (status === 'completed') {
            updateData.completed_at = new Date().toISOString()
        }
        
        const { error } = await supabase.from('watchlist').update(updateData).eq('id', id)
        if (!error) {
            setItems(items.map(item => item.id === id ? { ...item, status: status as WatchlistItem['status'] } : item))
        }
        setUpdating(null)
    }

    const removeItem = async (id: string) => {
        if (!confirm('Remove from watchlist?')) return
        const { error } = await supabase.from('watchlist').delete().eq('id', id)
        if (!error) {
            setItems(items.filter(item => item.id !== id))
            setEpisodes(prev => {
                const newEpisodes = { ...prev }
                delete newEpisodes[id]
                return newEpisodes
            })
        }
    }

    const filtered = filter === 'all' ? items : items.filter(item => item.status === filter)

    const getItemProgress = (item: WatchlistItem) => {
        if (item.media_type === 'movie') return null
        const itemEpisodes = episodes[item.id]
        if (!itemEpisodes || itemEpisodes.length === 0) return null
        
        const watched = itemEpisodes.filter(ep => ep.watched).length
        const total = itemEpisodes.length
        const lastWatched = itemEpisodes.filter(ep => ep.watched).sort((a, b) => {
            if (a.season_number !== b.season_number) return b.season_number - a.season_number
            return b.episode_number - a.episode_number
        })[0]
        
        return {
            watched,
            total,
            percentage: total > 0 ? Math.round((watched / total) * 100) : 0,
            lastWatched
        }
    }

    const statusCounts = {
        all: items.length,
        planning: items.filter(i => i.status === 'planning').length,
        watching: items.filter(i => i.status === 'watching').length,
        completed: items.filter(i => i.status === 'completed').length,
        dropped: items.filter(i => i.status === 'dropped').length
    }

    useEffect(() => {
        const fetchWatchlist = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })

            if (!error) {
                setItems(data || [])
                
                // Load episodes for all TV shows and anime from database
                const tvItems = (data || []).filter(item => 
                    item.media_type !== 'movie' && item.tmdb_id != null
                )
                
                tvItems.forEach(item => {
                    if (item.tmdb_id) {
                        loadEpisodesFromDB(item.id, item.tmdb_id)
                    }
                })
            }
            setLoading(false)
        }
        fetchWatchlist()
    }, [])

    if (loading) return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
            </div>
        </section>
    )

    return (
        <>
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-section">
                        <div className="discover-section__head">
                            <h2>Your Watchlist</h2>
                            <span>{items.length} total</span>
                        </div>

                        <div className="watchlist-tabs">
                            <button className={`watchlist-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({statusCounts.all})</button>
                            <button className={`watchlist-tab ${filter === 'planning' ? 'active' : ''}`} onClick={() => setFilter('planning')}>Planning ({statusCounts.planning})</button>
                            <button className={`watchlist-tab ${filter === 'watching' ? 'active' : ''}`} onClick={() => setFilter('watching')}>Watching ({statusCounts.watching})</button>
                            <button className={`watchlist-tab ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>Completed ({statusCounts.completed})</button>
                            <button className={`watchlist-tab ${filter === 'dropped' ? 'active' : ''}`} onClick={() => setFilter('dropped')}>Dropped ({statusCounts.dropped})</button>
                        </div>

                        {filtered.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                                {items.length === 0 ? 'Your watchlist is empty. Start adding movies and shows!' : 'No items with this status.'}
                            </p>
                        ) : (
                            <div className="watchlist-grid">
                                {filtered.map((item) => {
                                    const poster = item.poster_path ? imageUrl(item.poster_path) : null
                                    const progress = getItemProgress(item)
                                    
                                    return (
                                        <div className="watchlist-card" key={item.id}>
                                            <div className="watchlist-card__poster">
                                                {poster ? (
                                                    <img src={poster} alt={item.title} />
                                                ) : (
                                                    <div className="discover-card__no-poster"><span>{item.title}</span></div>
                                                )}
                                            </div>
                                            <div className="watchlist-card__info">
                                                <h3>{item.title}</h3>
                                                <span className="watchlist-card__type">{item.media_type}</span>
                                                {item.overview && <p className="watchlist-card__overview">{item.overview.slice(0, 100)}...</p>}
                                                
                                                {progress && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            fontSize: '0.75rem',
                                                            color: 'rgba(255,255,255,0.6)',
                                                            marginBottom: '0.25rem'
                                                        }}>
                                                            <span>{progress.watched}/{progress.total} episodes</span>
                                                            <span>{progress.percentage}%</span>
                                                        </div>
                                                        <div style={{
                                                            height: '4px',
                                                            background: 'rgba(255,255,255,0.1)',
                                                            borderRadius: '2px',
                                                            overflow: 'hidden'
                                                        }}>
                                                            <div style={{
                                                                height: '100%',
                                                                width: `${progress.percentage}%`,
                                                                background: 'var(--color-orange)',
                                                                borderRadius: '2px',
                                                                transition: 'width 0.3s ease'
                                                            }} />
                                                        </div>
                                                        {progress.lastWatched && (
                                                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem' }}>
                                                                Last: S{progress.lastWatched.season_number}E{progress.lastWatched.episode_number}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {item.next_episode_to_watch && item.status === 'watching' && (
                                                    <div style={{
                                                        marginTop: '0.5rem',
                                                        padding: '0.5rem',
                                                        background: 'rgba(133,138,227,0.1)',
                                                        border: '1px solid rgba(133,138,227,0.2)',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        color: 'var(--color-orange)'
                                                    }}>
                                                        Next: S{item.next_episode_to_watch.season_number}E{item.next_episode_to_watch.episode_number}
                                                    </div>
                                                )}
                                                
                                                {item.has_new_episodes && (
                                                    <div style={{
                                                        marginTop: '0.5rem',
                                                        padding: '0.4rem 0.6rem',
                                                        background: 'rgba(104,255,174,0.1)',
                                                        border: '1px solid rgba(104,255,174,0.3)',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        color: '#68ffae',
                                                        fontWeight: 600
                                                    }}>
                                                        🆕 New episodes available!
                                                    </div>
                                                )}
                                                
                                                {/* Only show episodes button for TV shows and anime with tmdb_id */}
                                                {item.media_type !== 'movie' && item.tmdb_id != null && (
                                                    <button 
                                                        className="dashboard-link-btn" 
                                                        onClick={() => {
                                                            if (expandedItem === item.id) {
                                                                setExpandedItem(null)
                                                            } else {
                                                                setExpandedItem(item.id)
                                                                if (!episodes[item.id] && item.tmdb_id) {
                                                                    loadEpisodes(item.id, item.tmdb_id!)
                                                                }
                                                            }
                                                        }}
                                                        style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
                                                    >
                                                        {expandedItem === item.id ? 'Hide Episodes' : 'Show Episodes'}
                                                    </button>
                                                )}
                                                
                                                {/* Only show episodes list for TV shows and anime with tmdb_id */}
                                                {expandedItem === item.id && item.media_type !== 'movie' && item.tmdb_id != null && (
                                                    <div style={{
                                                        marginTop: '0.75rem',
                                                        padding: '0.75rem',
                                                        background: 'rgba(255,255,255,0.02)',
                                                        border: '1px solid rgba(255,255,255,0.06)',
                                                        borderRadius: '8px',
                                                        maxHeight: '300px',
                                                        overflowY: 'auto'
                                                    }}>
                                                        {loadingEpisodes === item.id ? (
                                                            <p style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>Loading episodes...</p>
                                                        ) : episodes[item.id] && episodes[item.id].length > 0 ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                                {episodes[item.id].map((ep) => (
                                                                    <div 
                                                                        key={ep.id} 
                                                                        style={{ 
                                                                            display: 'flex', 
                                                                            alignItems: 'center', 
                                                                            gap: '0.5rem',
                                                                            padding: '0.4rem',
                                                                            background: ep.watched ? 'rgba(104,255,174,0.05)' : 'rgba(255,255,255,0.02)',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        onClick={() => handleEpisodeClick(item.id, ep)}
                                                                    >
                                                                        <div style={{
                                                                            width: '20px',
                                                                            height: '20px',
                                                                            borderRadius: '4px',
                                                                            border: `1px solid ${ep.watched ? '#68ffae' : 'rgba(255,255,255,0.2)'}`,
                                                                            background: ep.watched ? 'rgba(104,255,174,0.2)' : 'transparent',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            flexShrink: 0
                                                                        }}>
                                                                            {ep.watched && <span style={{ color: '#68ffae', fontSize: '0.7rem' }}>✓</span>}
                                                                        </div>
                                                                        <span style={{ 
                                                                            fontSize: '0.8rem', 
                                                                            color: ep.watched ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
                                                                            flex: 1
                                                                        }}>
                                                                            S{ep.season_number}E{ep.episode_number}: {ep.title}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>No episodes available</p>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                <div className="watchlist-card__status">
                                                    <button
                                                        className={`watchlist-status-btn ${item.status === 'planning' ? 'active' : ''}`}
                                                        onClick={() => updateStatus(item.id, 'planning')}
                                                        disabled={updating === item.id}
                                                    >Plan</button>
                                                    <button
                                                        className={`watchlist-status-btn ${item.status === 'watching' ? 'active' : ''}`}
                                                        onClick={() => updateStatus(item.id, 'watching')}
                                                        disabled={updating === item.id}
                                                    >Watch</button>
                                                    {item.media_type === 'movie' && (
                                                        <button
                                                            className={`watchlist-status-btn ${item.status === 'completed' ? 'active' : ''}`}
                                                            onClick={() => updateStatus(item.id, 'completed')}
                                                            disabled={updating === item.id}
                                                        >Done</button>
                                                    )}
                                                    <button
                                                        className={`watchlist-status-btn ${item.status === 'dropped' ? 'active' : ''}`}
                                                        onClick={() => updateStatus(item.id, 'dropped')}
                                                        disabled={updating === item.id}
                                                    >Drop</button>
                                                </div>
                                                <button className="watchlist-remove-btn" onClick={() => removeItem(item.id)}>Remove</button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </section>
            
            {episodeModal && (
                <EpisodeWatchModal
                    episode={episodeModal.episode}
                    onClose={() => setEpisodeModal(null)}
                    onMarkSingle={() => markEpisodeWatched(episodeModal.watchlistId, episodeModal.episode, false)}
                    onMarkAll={() => markEpisodeWatched(episodeModal.watchlistId, episodeModal.episode, true)}
                />
            )}
        </>
    )
}

export default Watchlist
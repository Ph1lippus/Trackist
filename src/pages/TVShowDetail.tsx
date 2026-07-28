import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getTVDetails, getTVSeasonDetails, imageUrl, imageUrlOriginal, getFanartImages } from '../services/tmdbService'
import { saveAllEpisodesForShow } from '../services/watchlistService'
import ConfirmModal from '../components/modals/ConfirmModal'
import EpisodeChoiceModal from '../components/modals/EpisodeChoiceModal'
import type { TMDBResult, WatchlistEpisode } from '../types'

const TVShowDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [details, setDetails] = useState<TMDBResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [fanartImages, setFanartImages] = useState<{ hdtvlogo?: Array<{ url: string }> } | null>(null)
    const [isInWatchlist, setIsInWatchlist] = useState(false)
    const [watchlistId, setWatchlistId] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [seasons, setSeasons] = useState<number[]>([])
    const [episodes, setEpisodes] = useState<WatchlistEpisode[]>([])
    const [selectedSeason, setSelectedSeason] = useState(1)
    const [showTrailer, setShowTrailer] = useState(false)
    const [trailerKey, setTrailerKey] = useState<string | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        episode: WatchlistEpisode
        markAll: boolean
        isUnwatch: boolean
    } | null>(null)
    const [removeEpisodeModal, setRemoveEpisodeModal] = useState<{
        isOpen: boolean
        episode: WatchlistEpisode
    } | null>(null)
    const [removeWatchlistModal, setRemoveWatchlistModal] = useState<{ isOpen: boolean } | null>(null)
    const [markWatchedModal, setMarkWatchedModal] = useState<{ isOpen: boolean; markAsWatched: boolean } | null>(null)
    const [addEpisodeModal, setAddEpisodeModal] = useState<{
        isOpen: boolean
        episode: WatchlistEpisode
    } | null>(null)
    const [showCast, setShowCast] = useState(false)
    const hasUserSelectedSeason = useRef(false)
    const episodeToScrollRef = useRef<string | null>(null)
    const episodeRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})

    const isEpisodeReleased = (episode: WatchlistEpisode): boolean => {
        if (!episode.air_date) return true
        return new Date(episode.air_date) <= new Date()
    }

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [id])

    useEffect(() => {
        if (episodeToScrollRef.current && episodeRefs.current[episodeToScrollRef.current]) {
            episodeRefs.current[episodeToScrollRef.current]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            episodeToScrollRef.current = null
        }
    }, [selectedSeason, episodes])

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return
            setLoading(true)
            try {
                const [data, fanart] = await Promise.all([
                    getTVDetails(Number(id)),
                    getFanartImages(Number(id), 'tv')
                ])
                setDetails(data)
                setFanartImages(fanart)
                
                if (data.seasons?.[0]) {
                    setSelectedSeason(data.seasons[0].season_number)
                }

                // Find trailer from videos
                if (data.videos?.results) {
                    const trailer = data.videos.results.find(
                        (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
                    )
                    if (trailer) setTrailerKey(trailer.key)
                }

                // Check if in watchlist
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: watchlistData } = await supabase
                        .from('watchlist')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('tmdb_id', Number(id))
                        .single()
                    if (watchlistData) {
                        setIsInWatchlist(true)
                        setWatchlistId(watchlistData.id)
                    }
                }
            } catch (err) {
                console.error('Failed to load TV show details:', err)
            }
            setLoading(false)
        }
        fetchDetails()
    }, [id])

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!details || !id) return
            
            try {
                const seasonList = (details.seasons || [])
                    .filter((s: { season_number: number }) => s.season_number > 0)
                    .map((s: { season_number: number }) => s.season_number)
                setSeasons(seasonList)

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
                    const sData = await getTVSeasonDetails(Number(id), season)
                    const sEpisodes = sData.episodes || []
                    for (const ep of sEpisodes) {
                        const watched = watchedEpisodes?.find(we =>
                            we.season_number === season && we.episode_number === ep.episode_number
                        )
                        allEpisodes.push({
                            id: `${id}-${season}-${ep.episode_number}`,
                            watchlist_id: watchlistId || '',
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

                // Find last watched episode and set season/scroll if user hasn't manually selected
                if (!hasUserSelectedSeason.current && watchedEpisodes.length > 0) {
                    const lastWatched = watchedEpisodes.reduce((latest, ep) => {
                        if (!latest) return ep
                        const latestDate = new Date(latest.watched_at || latest.created_at)
                        const epDate = new Date(ep.watched_at || ep.created_at)
                        return epDate > latestDate ? ep : latest
                    })
                    
                    if (lastWatched) {
                        // Check if all episodes in the last watched season are fully watched
                        const episodesInSeason = allEpisodes.filter(ep => ep.season_number === lastWatched.season_number)
                        const allReleasedInSeasonWatched = episodesInSeason.filter(ep => isEpisodeReleased(ep)).every(ep => ep.watched)
                        
                        let targetSeason = lastWatched.season_number
                        let targetEpisode = lastWatched.episode_number
                        
                        // If all released episodes in the season are watched, go to next season
                        if (allReleasedInSeasonWatched) {
                            const nextSeasonIndex = seasonList.indexOf(lastWatched.season_number) + 1
                            if (nextSeasonIndex < seasonList.length) {
                                targetSeason = seasonList[nextSeasonIndex]
                                // Find first episode of next season
                                const firstEpisodeOfNextSeason = allEpisodes.find(ep => ep.season_number === targetSeason)
                                if (firstEpisodeOfNextSeason) {
                                    targetEpisode = firstEpisodeOfNextSeason.episode_number
                                }
                            }
                        }
                        
                        setSelectedSeason(targetSeason)
                        episodeToScrollRef.current = `${id}-${targetSeason}-${targetEpisode}`
                    }
                }
            } catch (err) {
                console.error('Failed to load episodes:', err)
            }
        }
        loadEpisodes()
    }, [details, id, isInWatchlist, watchlistId])

    const handleAddToWatchlist = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !details) {
            alert('Please log in')
            return
        }

        setAdding(true)

        // Fetch total episodes and seasons from TMDB
        const totalEpisodes = details.number_of_episodes || 0
        const totalSeasons = details.number_of_seasons || 1

        const { data, error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: 'tv',
            tmdb_id: details.id,
            title: details.name || '',
            poster_path: details.poster_path,
            overview: details.overview,
            release_date: details.first_air_date,
            vote_average: details.vote_average,
            total_episodes: totalEpisodes,
            total_seasons: totalSeasons,
            current_episode: 0,
            current_season: 1,
            last_season_number: totalSeasons,
            last_season_check: new Date().toISOString(),
            status: 'watching'
        }).select().single()

        if (error) {
            alert('Error: ' + error.message)
        } else if (data) {
            setIsInWatchlist(true)
            setWatchlistId(data.id)
            // Save all episodes to watchlist_episodes table
            await saveAllEpisodesForShow(details.id, data.id)
        }
        setAdding(false)
    }

    const handleRemoveFromWatchlist = async () => {
        if (!watchlistId) return

        const { error } = await supabase
            .from('watchlist')
            .delete()
            .eq('id', watchlistId)

        if (error) {
            alert('Error: ' + error.message)
        } else {
            setIsInWatchlist(false)
            setWatchlistId(null)
        }
        setRemoveWatchlistModal(null)
    }

    const handleSeasonChange = (season: number) => {
        hasUserSelectedSeason.current = true
        setSelectedSeason(season)
    }

    const areAllReleasedEpisodesWatched = (): boolean => {
        const releasedEpisodes = episodes.filter(ep => isEpisodeReleased(ep))
        if (releasedEpisodes.length === 0) return false
        return releasedEpisodes.every(ep => ep.watched)
    }

    const hasUnwatchedEpisodesBefore = (episode: WatchlistEpisode): boolean => {
        const episodesBefore = episodes.filter(ep => {
            if (ep.season_number < episode.season_number) {
                return true
            }
            if (ep.season_number === episode.season_number && ep.episode_number < episode.episode_number) {
                return true
            }
            return false
        })
        return episodesBefore.some(ep => !ep.watched)
    }

    const getLogoUrl = (): string | null => {
        if (details?.images?.logos) {
            const englishLogo = details.images.logos.find(
                (logo: any) => logo.iso_639_1 === 'en'
            )
            if (englishLogo) {
                return imageUrlOriginal(englishLogo.file_path)
            }
            const noLanguageLogo = details.images.logos.find(
                (logo: any) => logo.iso_639_1 === null || logo.iso_639_1 === ''
            )
            if (noLanguageLogo) {
                return imageUrlOriginal(noLanguageLogo.file_path)
            }
            if (details.images.logos.length > 0) {
                return imageUrlOriginal(details.images.logos[0].file_path)
            }
        }
        if (fanartImages?.hdtvlogo?.[0]?.url) {
            return fanartImages.hdtvlogo[0].url
        }
    
        return null
        }  

    const getAgeRating = (): string => {
        if (!details?.content_ratings?.results) return ''
        const usRating = details.content_ratings.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US')
        if (usRating?.rating) {
            return usRating.rating
        }
        return ''
    }

    const getProviders = () => {
        const watchProviders = details?.['watch/providers']
        if (!watchProviders || !Array.isArray(watchProviders.results)) return []
        const usProviders = watchProviders.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US')
        if (!usProviders) return []
        const providers = []
        if (usProviders.flatrate) providers.push(...usProviders.flatrate)
        if (usProviders.buy) providers.push(...usProviders.buy)
        if (usProviders.rent) providers.push(...usProviders.rent)
        return providers.slice(0, 5)
    }

    const markEpisodeWatched = async (episode: WatchlistEpisode, markAll: boolean) => {
        if (!watchlistId) return

        if (markAll) {
            // Mark all episodes up to and including this one
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

            // Optimistically update local state
            setEpisodes(prev => prev.map(ep => {
                const shouldMark = isEpisodeReleased(ep) && (
                    ep.season_number < episode.season_number ||
                    (ep.season_number === episode.season_number && ep.episode_number <= episode.episode_number)
                )
                return shouldMark ? { ...ep, watched: true } : ep
            }))

            try {
                const updates = episodesToMark.map(ep =>
                    supabase.from('watchlist_episodes').upsert({
                        watchlist_id: watchlistId,
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
                await recalculateWatchlistProgress()
            } catch (err) {
                console.error('Failed to mark episodes:', err)
                return
            }
        } else {
            // Mark just this episode (toggle)
            const newWatchedState = !episode.watched

            // If unwatching, show confirmation modal
            if (!newWatchedState && episode.watched) {
                setRemoveEpisodeModal({ isOpen: true, episode })
                return
            }

            // Optimistically update local state
            setEpisodes(prev => prev.map(ep => 
                ep.id === episode.id ? { ...ep, watched: newWatchedState } : ep
            ))

            try {
                // Check if episode record exists in DB
                const { data: existingEp } = await supabase
                    .from('watchlist_episodes')
                    .select('*')
                    .eq('watchlist_id', watchlistId)
                    .eq('season_number', episode.season_number)
                    .eq('episode_number', episode.episode_number)
                    .maybeSingle()

                if (newWatchedState) {
                    if (existingEp) {
                        // Update existing record
                        const { error } = await supabase
                            .from('watchlist_episodes')
                            .update({
                                watched: true,
                                watched_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', existingEp.id)

                        if (error) {
                            setEpisodes(prev => prev.map(ep => 
                                ep.id === episode.id ? { ...ep, watched: !newWatchedState } : ep
                            ))
                            console.error('Failed to update episode:', error)
                            return
                        }
                    } else {
                        // Insert new record
                        const { error } = await supabase
                            .from('watchlist_episodes')
                            .insert({
                                watchlist_id: watchlistId,
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
                            })

                        if (error) {
                            setEpisodes(prev => prev.map(ep => 
                                ep.id === episode.id ? { ...ep, watched: !newWatchedState } : ep
                            ))
                            console.error('Failed to insert episode:', error)
                            return
                        }
                    }
                } else {
                    // Delete from database when unwatching
                    if (existingEp) {
                        const { error } = await supabase
                            .from('watchlist_episodes')
                            .delete()
                            .eq('id', existingEp.id)

                        if (error) {
                            setEpisodes(prev => prev.map(ep => 
                                ep.id === episode.id ? { ...ep, watched: !newWatchedState } : ep
                            ))
                            console.error('Failed to delete episode:', error)
                            return
                        }
                    }
                }

                await recalculateWatchlistProgress()
            } catch (err) {
                setEpisodes(prev => prev.map(ep => 
                    ep.id === episode.id ? { ...ep, watched: !newWatchedState } : ep
                ))
                console.error('Failed to toggle episode:', err)
            }
        }
    }

    const handleRemoveEpisode = async () => {
        if (!removeEpisodeModal || !watchlistId) return

        const episode = removeEpisodeModal.episode

        // Optimistically update local state
        setEpisodes(prev => prev.map(ep => 
            ep.id === episode.id ? { ...ep, watched: false } : ep
        ))

        try {
            // Delete from database
            const { data: existingEp } = await supabase
                .from('watchlist_episodes')
                .select('*')
                .eq('watchlist_id', watchlistId)
                .eq('season_number', episode.season_number)
                .eq('episode_number', episode.episode_number)
                .maybeSingle()

            if (existingEp) {
                const { error } = await supabase
                    .from('watchlist_episodes')
                    .delete()
                    .eq('id', existingEp.id)

                if (error) {
                    setEpisodes(prev => prev.map(ep => 
                        ep.id === episode.id ? { ...ep, watched: true } : ep
                    ))
                    console.error('Failed to delete episode:', error)
                    return
                }
            }

            await recalculateWatchlistProgress()
        } catch (err) {
            setEpisodes(prev => prev.map(ep => 
                ep.id === episode.id ? { ...ep, watched: true } : ep
            ))
            console.error('Failed to remove episode:', err)
        }

        setRemoveEpisodeModal(null)
    }

    const recalculateWatchlistProgress = async () => {
        if (!watchlistId || !details) return

        // Count total watched episodes from current state
        let watchedCount = 0
        for (const ep of episodes) {
            if (ep.watchlist_id !== watchlistId) continue
            if (ep.watched) watchedCount++
        }

        const totalEpisodes = details.number_of_episodes || 0
        const totalSeasons = details.number_of_seasons || 1

        // Determine new status
        let newStatus: string
        let newCurrentEpisode: number
        let newCurrentSeason: number

        if (totalEpisodes > 0 && watchedCount >= totalEpisodes) {
            newStatus = 'completed'
            newCurrentEpisode = totalEpisodes
            const watchedEps = episodes.filter(ep => ep.watched)
            if (watchedEps.length > 0) {
                const lastWatched = watchedEps.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEps[0])
                newCurrentSeason = lastWatched.season_number
            } else {
                newCurrentSeason = 1
            }
        } else if (watchedCount > 0) {
            newStatus = 'watching'
            newCurrentEpisode = watchedCount
            const watchedEps = episodes.filter(ep => ep.watched)
            if (watchedEps.length > 0) {
                const lastWatched = watchedEps.reduce((max, ep) =>
                    ep.season_number > max.season_number ? ep : max
                , watchedEps[0])
                newCurrentSeason = lastWatched.season_number
            } else {
                newCurrentSeason = 1
            }
        } else {
            newStatus = 'watching'
            newCurrentEpisode = 0
            newCurrentSeason = 1
        }


        const { error } = await supabase
            .from('watchlist')
            .update({
                total_episodes: totalEpisodes,
                total_seasons: totalSeasons,
                current_episode: newCurrentEpisode,
                current_season: newCurrentSeason,
                status: newStatus,
                completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', watchlistId)

        if (error) {
            console.error('Failed to update watchlist progress:', error)
        }
    }

    const filteredEpisodes = episodes.filter(ep => ep.season_number === selectedSeason)

    if (loading) {
        return (
            <div className="detail-page">
                <div className="detail-page__content">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading TV show details...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!details) {
        return <div className="detail-page-error">TV Show not found</div>
    }

    const backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null
    const logoUrl = getLogoUrl()
    const title = details.name || 'Untitled'
    const firstYear = details.first_air_date?.slice(0, 4) || ''
    const lastYear = details.last_air_date?.slice(0, 4) || ''
    const year = details.status === 'Ended' && lastYear && lastYear !== firstYear ? `${firstYear}-${lastYear}` : firstYear
    const rating = details.vote_average?.toFixed(1)
    const ageRating = getAgeRating()
    const overview = details.overview || 'No description available.'
    const genres = details.genres || []
    const cast = (details.credits?.cast || [])
        .slice(0, 10)
        .sort((a: { profile_path?: string | null }, b: { profile_path?: string | null }) => {
            if (a.profile_path && !b.profile_path) return -1
            if (!a.profile_path && b.profile_path) return 1
            return 0
        })
    const providers = getProviders()

    return (
        <div className="detail-page detail-page--no-scroll">
            {backdropUrl && (
                <div className="detail-page__backdrop">
                    <img src={backdropUrl} alt={title} />
                    <div className="detail-page__backdrop-overlay" />
                </div>
            )}
            
            <div className="detail-page__content detail-page__content--split">
                <div className="detail-page__main detail-page__main--tv">
                    <div className="detail-page__left">
                        <div className="detail-page__title-section">
                            <div className="detail-page__logo-section">
                                {logoUrl ? (
                                    <img src={logoUrl} alt={title} className="detail-page__logo" />
                                ) : (
                                    <h1 className="detail-page__title">{title}</h1>
                                )}
                            </div>
                            
                            <div className="detail-page__meta">
                                {year && <span className="detail-page__year">{year}</span>}
                                {rating && <span className="detail-page__rating">★ {rating}</span>}
                                {details.number_of_seasons && <span className="detail-page__seasons">{details.number_of_seasons} Seasons</span>}
                                {ageRating && <span className="detail-page__age-rating">{ageRating}</span>}
                            </div>

                            {providers.length > 0 && (
                                <div className="detail-page__providers">
                                    {providers.map((p: { logo_path: string }, idx: number) => (
                                        <img
                                            key={idx}
                                            src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                                            alt="Provider"
                                            className="detail-page__provider-logo"
                                        />
                                    ))}
                                </div>
                            )}

                            {genres.length > 0 && (
                                <div className="detail-page__genres">
                                    {genres.map((g: { id: number; name: string }) => (
                                        <span key={g.id} className="detail-page__genre">{g.name}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="detail-page__overview-section">
                            <h2 className="detail-page__section-title">Overview</h2>
                            <p className="detail-page__overview">{overview}</p>
                            
                            <div className="detail-page__actions">
                                {trailerKey && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setShowTrailer(!showTrailer)}
                                        title={showTrailer ? 'Close Trailer' : 'Watch Trailer'}
                                    >
                                        <i className="fa-solid fa-clapperboard"></i>
                                    </button>
                                )}
                                {cast.length > 0 && (
                                    <button 
                                        className="detail-page__icon-btn"
                                        onClick={() => setShowCast(!showCast)}
                                        title={showCast ? 'Hide Cast' : 'Cast'}
                                    >
                                        <i className="fa-solid fa-users"></i>
                                    </button>
                                )}
                                {!isInWatchlist ? (
                                    <>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={handleAddToWatchlist}
                                            disabled={adding}
                                            title="Add to Watchlist"
                                        >
                                            <i className="fa-regular fa-bookmark"></i>
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={async () => {
                                                await handleAddToWatchlist()
                                                if (watchlistId) {
                                                    // Mark all episodes as watched
                                                    const releasedEpisodes = episodes.filter(ep => isEpisodeReleased(ep))
                                                    for (const ep of releasedEpisodes) {
                                                        await supabase.from('watchlist_episodes').upsert({
                                                            watchlist_id: watchlistId,
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
                                                    }
                                                    // Update watchlist status to completed
                                                    await supabase.from('watchlist').update({
                                                        status: 'completed',
                                                        completed_at: new Date().toISOString()
                                                    }).eq('id', watchlistId)
                                                    // Refresh episodes
                                                    setEpisodes(prev => prev.map(ep => 
                                                        isEpisodeReleased(ep) ? { ...ep, watched: true } : ep
                                                    ))
                                                }
                                            }}
                                            disabled={adding}
                                            title="Mark as Watched"
                                        >
                                            <i className="fa-solid fa-eye"></i>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => setRemoveWatchlistModal({ isOpen: true })}
                                            title="Remove from Watchlist"
                                        >
                                            <i className="fa-solid fa-bookmark" style={{ color: '#68ffae' }}></i>
                                        </button>
                                        <button 
                                            className="detail-page__icon-btn"
                                            onClick={() => {
                                                if (!watchlistId) return
                                                const markAsWatched = !areAllReleasedEpisodesWatched()
                                                setMarkWatchedModal({ isOpen: true, markAsWatched })
                                            }}
                                            title={areAllReleasedEpisodesWatched() ? 'Mark as Unwatched' : 'Mark as Watched'}
                                        >
                                            <i className={areAllReleasedEpisodesWatched() ? 'fa-solid fa-eye-slash' :'fa-solid fa-eye'}></i>
                                        </button>
                                    </>
                                )}
                            </div>

                            {showTrailer && trailerKey && (
                                <div className="detail-page__trailer-overlay" onClick={() => setShowTrailer(false)}>
                                    <div className="detail-page__trailer-modal" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                            className="detail-page__trailer-close"
                                            onClick={() => setShowTrailer(false)}
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                        <iframe
                                            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&vq=hd1080`}
                                            title="Trailer"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                            className="detail-page__trailer-iframe"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {showCast && cast.length > 0 && (
                            <div className="detail-page__cast-section">
                                {showCast && (
                                    <div className="detail-page__cast-list">
                                        {cast.map((c: { id: number; name: string; profile_path?: string; character?: string }) => (
                                            <div 
                                                key={c.id} 
                                                className="detail-page__cast-item"
                                                onClick={() => navigate(`/person/${c.id}`)}
                                            >
                                                {c.profile_path && (
                                                    <img 
                                                        src={imageUrl(c.profile_path) || ''} 
                                                        alt={c.name} 
                                                        className="detail-page__cast-photo"
                                                    />
                                                )}
                                                <div className="detail-page__cast-info">
                                                    <span className="detail-page__cast-name">{c.name}</span>
                                                    {c.character && (
                                                        <span className="detail-page__cast-character">{c.character}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="detail-page__right">
                        <div className="detail-page__episodes-section">
                            {seasons.length > 1 && (
                                <div className="detail-page__episodes-header">
                                    <button 
                                        className="detail-page__season-nav"
                                        onClick={() => {
                                            const currentIndex = seasons.indexOf(selectedSeason)
                                            if (currentIndex > 0) {
                                                handleSeasonChange(seasons[currentIndex - 1])
                                            }
                                        }}
                                        disabled={seasons.indexOf(selectedSeason) === 0}
                                    >
                                        <i className="fa-solid fa-chevron-left"></i>
                                    </button>
                                    <select 
                                        className="detail-page__season-select"
                                        value={selectedSeason}
                                        onChange={(e) => handleSeasonChange(Number(e.target.value))}
                                    >
                                        {seasons.map(s => (
                                            <option key={s} value={s}>Season {s}</option>
                                        ))}
                                    </select>
                                    <button 
                                        className="detail-page__season-nav"
                                        onClick={() => {
                                            const currentIndex = seasons.indexOf(selectedSeason)
                                            if (currentIndex < seasons.length - 1) {
                                                handleSeasonChange(seasons[currentIndex + 1])
                                            }
                                        }}
                                        disabled={seasons.indexOf(selectedSeason) === seasons.length - 1}
                                    >
                                        <i className="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>
                            )}
                            
                            <div className="detail-page__episode-list">
                                {filteredEpisodes.map((ep) => (
                                    <div 
                                        key={ep.id} 
                                        ref={(el) => { episodeRefs.current[ep.id] = el }}
                                        className={`detail-page__episode-card ${ep.watched ? 'watched' : ''} ${!isEpisodeReleased(ep) ? 'unreleased' : ''}`}
                                        style={{ cursor: isEpisodeReleased(ep) ? 'pointer' : 'default' }}
                                    >
                                        {ep.still_path && (
                                            <div className="detail-page__episode-still">
                                                <img src={imageUrl(ep.still_path) || ''} alt={ep.title || `Episode ${ep.episode_number}`} />
                                            </div>
                                        )}
                                        <div className="detail-page__episode-info" onClick={() => {
                                            if (isEpisodeReleased(ep)) {
                                                if (!ep.watched && hasUnwatchedEpisodesBefore(ep)) {
                                                    setAddEpisodeModal({ isOpen: true, episode: ep })
                                                } else if (!ep.watched) {
                                                    // Force mark as watched
                                                    setEpisodes(prev => prev.map(e => 
                                                        e.id === ep.id ? { ...e, watched: true } : e
                                                    ))
                                                    // Directly insert/update in DB
                                                    supabase
                                                        .from('watchlist_episodes')
                                                        .select('*')
                                                        .eq('watchlist_id', watchlistId)
                                                        .eq('season_number', ep.season_number)
                                                        .eq('episode_number', ep.episode_number)
                                                        .maybeSingle()
                                                        .then(({ data: existingEp }) => {
                                                            if (existingEp) {
                                                                supabase
                                                                    .from('watchlist_episodes')
                                                                    .update({
                                                                        watched: true,
                                                                        watched_at: new Date().toISOString(),
                                                                        updated_at: new Date().toISOString()
                                                                    })
                                                                    .eq('id', existingEp.id)
                                                                    .then(() => recalculateWatchlistProgress())
                                                            } else {
                                                                supabase
                                                                    .from('watchlist_episodes')
                                                                    .insert({
                                                                        watchlist_id: watchlistId,
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
                                                                    })
                                                                    .then(() => recalculateWatchlistProgress())
                                                            }
                                                        })
                                                } else {
                                                    // Toggle to unwatched
                                                    markEpisodeWatched(ep, false)
                                                }
                                            }
                                        }}>
                                            <div className="detail-page__episode-number">
                                                <span>Episode {ep.episode_number}</span>
                                            </div>
                                            <div className="detail-page__episode-details">
                                                <strong>{ep.title || `Episode ${ep.episode_number}`}</strong>
                                                <div className="detail-page__episode-meta">
                                                    {ep.air_date && <span>{ep.air_date}</span>}
                                                    {ep.runtime && <span>{ep.runtime} min</span>}
                                                    {isEpisodeReleased(ep) && ep.vote_average && <span>★ {ep.vote_average.toFixed(1)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            className="detail-page__episode-ellipsis-btn"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/tv/${id}/season/${ep.season_number}/episode/${ep.episode_number}`)
                                            }}
                                            title="View episode details"
                                        >
                                            <i className="fa-solid fa-ellipsis"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title={confirmModal.isUnwatch ? "Unmark Episode as Watched" : "Mark Episodes as Watched"}
                    message={confirmModal.isUnwatch 
                        ? `Are you sure you want to mark S${confirmModal.episode.season_number}E${confirmModal.episode.episode_number} as unwatched?`
                        : `There are unwatched episodes before S${confirmModal.episode.season_number}E${confirmModal.episode.episode_number}. Do you want to mark all episodes up to this one as watched?`
                    }
                    onConfirm={() => {
                        if (confirmModal.isUnwatch) {
                            markEpisodeWatched(confirmModal.episode, false)
                        } else {
                            markEpisodeWatched(confirmModal.episode, confirmModal.markAll)
                        }
                        setConfirmModal(null)
                    }}
                    onCancel={() => {
                        setConfirmModal(null)
                    }}
                    confirmText={confirmModal.isUnwatch ? "Unmark" : confirmModal.markAll ? "Mark All" : "Mark This One"}
                    cancelText="Cancel"
                    confirmColor={confirmModal.isUnwatch ? "danger" : "success"}
                />
            )}
            {removeEpisodeModal && (
                <ConfirmModal
                    isOpen={removeEpisodeModal.isOpen}
                    title="Remove Episode"
                    message={`Are you sure you want to remove S${removeEpisodeModal.episode.season_number}E${removeEpisodeModal.episode.episode_number} from your watched episodes?`}
                    onConfirm={handleRemoveEpisode}
                    onCancel={() => setRemoveEpisodeModal(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                />
            )}
            {removeWatchlistModal && (
                <ConfirmModal
                    isOpen={removeWatchlistModal.isOpen}
                    title="Remove from Watchlist"
                    message="Are you sure you want to remove this TV show from your watchlist?"
                    onConfirm={handleRemoveFromWatchlist}
                    onCancel={() => setRemoveWatchlistModal(null)}
                    confirmText="Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                />
            )}
            {markWatchedModal && (
                <ConfirmModal
                    isOpen={markWatchedModal.isOpen}
                    title={markWatchedModal.markAsWatched ? 'Mark as Watched' : 'Mark as Unwatched'}
                    message={markWatchedModal.markAsWatched ? 'Are you sure you want to mark all released episodes as watched?' : 'Are you sure you want to mark all episodes as unwatched?'}
                    onConfirm={async () => {
                        if (!watchlistId) return
                        const newWatchedState = markWatchedModal.markAsWatched
                        
                        // Mark/unmark all released episodes
                        const releasedEpisodes = episodes.filter(ep => isEpisodeReleased(ep))
                        for (const ep of releasedEpisodes) {
                            await supabase.from('watchlist_episodes').upsert({
                                watchlist_id: watchlistId,
                                season_number: ep.season_number,
                                episode_number: ep.episode_number,
                                tmdb_episode_id: ep.tmdb_episode_id,
                                title: ep.title,
                                still_path: ep.still_path,
                                overview: ep.overview,
                                vote_average: ep.vote_average,
                                air_date: ep.air_date,
                                runtime: ep.runtime,
                                watched: newWatchedState,
                                watched_at: newWatchedState ? new Date().toISOString() : null
                            }, {
                                onConflict: 'watchlist_id,season_number,episode_number'
                            })
                        }
                        
                        // Update watchlist status based on whether all episodes are watched
                        const totalEpisodes = details?.number_of_episodes || 0
                        const watchedCount = newWatchedState ? releasedEpisodes.length : 0
                        let newStatus = 'watching'
                        if (watchedCount >= totalEpisodes) {
                            newStatus = 'completed'
                        }
                        
                        await supabase.from('watchlist').update({
                            status: newStatus,
                            completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
                            updated_at: new Date().toISOString()
                        }).eq('id', watchlistId)
                        
                        // Refresh episodes
                        setEpisodes(prev => prev.map(ep => 
                            isEpisodeReleased(ep) ? { ...ep, watched: newWatchedState } : ep
                        ))
                        setDetails(prev => prev ? { ...prev, status: newStatus as any } : null)
                        setMarkWatchedModal(null)
                    }}
                    onCancel={() => setMarkWatchedModal(null)}
                    confirmText={markWatchedModal.markAsWatched ? 'Mark as Watched' : 'Mark as Unwatched'}
                    cancelText="Cancel"
                    confirmColor="primary"
                />
            )}
            {addEpisodeModal && (
                <EpisodeChoiceModal
                    isOpen={addEpisodeModal.isOpen}
                    title="Mark Episode as Watched"
                    message={`There are unwatched episodes before S${addEpisodeModal.episode.season_number}E${addEpisodeModal.episode.episode_number}. Do you want to mark only this episode or all episodes up to this one as watched?`}
                    onMarkAll={() => {
                        markEpisodeWatched(addEpisodeModal.episode, true)
                        setAddEpisodeModal(null)
                    }}
                    onMarkOne={() => {
                        markEpisodeWatched(addEpisodeModal.episode, false)
                        setAddEpisodeModal(null)
                    }}
                    onCancel={() => {
                        setAddEpisodeModal(null)
                    }}
                />
            )}
        </div>
    )
}

export default TVShowDetail
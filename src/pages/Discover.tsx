import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { searchMulti, searchPerson, getPopularMovies, getTrendingMovies, getTopRatedMovies, getPopularTV, getTrendingTV, getTopRatedTV, imageUrl } from '../services/tmdbService'
import { searchAnime, getPopularAnime, getAnilistImageUrl } from '../services/anilistService'
import type { TMDBResult, AnilistResult } from '../types'
import DetailModal from '../components/DetailModal'

type ResultItem = TMDBResult | {
    id: number
    title: string
    name: string
    poster_path: string | null
    overview: string
    media_type: 'anime'
    vote_average: number | null
    release_date: string | null
    episodes: number | null
    status: string
}

const Discover: React.FC = () => {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ResultItem[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState<number | null>(null)
    const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv' | 'anime'>('all')
    const [sortBy, setSortBy] = useState<'popular' | 'trending' | 'top_rated'>('popular')
    const [showAll, setShowAll] = useState(false)
    const [detailItem, setDetailItem] = useState<ResultItem | null>(null)
    const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set())
    const [addStatus, setAddStatus] = useState<{ id: number; status: string } | null>(null)

    const [movies, setMovies] = useState<ResultItem[]>([])
    const [tvShows, setTvShows] = useState<ResultItem[]>([])
    const [animeList, setAnimeList] = useState<ResultItem[]>([])

    useEffect(() => {
        const fetchWatchlist = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase.from('watchlist').select('tmdb_id, anilist_id').eq('user_id', user.id)
            if (data) {
                const ids = new Set<number>()
                data.forEach((w: any) => {
                    if (w.tmdb_id) ids.add(w.tmdb_id)
                    if (w.anilist_id) ids.add(w.anilist_id)
                })
                setWatchlistIds(ids)
            }
        }
        fetchWatchlist()
    }, [])

    const formatAnimeItem = (item: AnilistResult): ResultItem => ({
        id: item.id,
        title: item.title.english || item.title.romaji,
        name: item.title.romaji,
        poster_path: getAnilistImageUrl(item.coverImage?.large ?? null),
        overview: (item.description || '').replace(/<[^>]*>/g, ''),
        media_type: 'anime' as const,
        vote_average: item.averageScore ? item.averageScore / 10 : null,
        release_date: item.startDate?.year ? `${item.startDate.year}` : null,
        episodes: item.episodes,
        status: item.status
    })

    const getMovieFn = () => {
        if (sortBy === 'trending') return getTrendingMovies()
        if (sortBy === 'top_rated') return getTopRatedMovies()
        return getPopularMovies()
    }

    const getTVFn = () => {
        if (sortBy === 'trending') return getTrendingTV()
        if (sortBy === 'top_rated') return getTopRatedTV()
        return getPopularTV()
    }

    const loadPopular = async () => {
        setLoading(true)
        setShowAll(false)
        try {
            if (mediaType === 'anime') {
                const animeResults = await getPopularAnime()
                setResults(animeResults.map(formatAnimeItem))
                setMovies([]); setTvShows([]); setAnimeList([])
            } else if (mediaType === 'movie') {
                const data = await getMovieFn()
                setResults(data.results || [])
                setMovies([]); setTvShows([]); setAnimeList([])
            } else if (mediaType === 'tv') {
                const data = await getTVFn()
                setResults(data.results || [])
                setMovies([]); setTvShows([]); setAnimeList([])
            } else {
                const [moviesData, tvData, animeData] = await Promise.all([
                    getMovieFn(),
                    getTVFn(),
                    getPopularAnime()
                ])
                setMovies(moviesData.results || [])
                setTvShows(tvData.results || [])
                setAnimeList(animeData.map(formatAnimeItem))
                setResults([])
            }
        } catch (err) {
            console.error('Failed to load:', err)
        }
        setLoading(false)
    }

    useEffect(() => {
        loadPopular()
    }, [mediaType, sortBy])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        setLoading(true)
        setShowAll(false)

        try {
            if (mediaType === 'anime') {
                const animeResults = await searchAnime(query)
                setResults(animeResults.map(formatAnimeItem))
            } else {
                const [multiData, personData] = await Promise.all([
                    searchMulti(query),
                    searchPerson(query)
                ])
                const combined = [...(multiData.results || []), ...(personData.results || [])]
                setResults(combined)
            }
            setMovies([]); setTvShows([]); setAnimeList([])
        } catch (err) {
            console.error('Search failed:', err)
        }
        setLoading(false)
    }

    const addToWatchlist = async (item: ResultItem, status: string = 'planning') => {
        setAdding(item.id)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return alert('Please log in')

        const isAnime = item.media_type === 'anime'
        const mediaTypeValue = isAnime ? 'anime' : (item.media_type === 'movie' ? 'movie' : 'tv')

        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: mediaTypeValue,
            ...isAnime ? { anilist_id: item.id } : { tmdb_id: item.id },
            title: item.title || item.name,
            poster_path: item.poster_path,
            overview: item.overview,
            release_date: item.release_date,
            vote_average: item.vote_average,
            status
        })

        setAdding(null)
        if (error) alert('Error: ' + error.message)
        else {
            setWatchlistIds(prev => new Set(prev).add(item.id))
            setAddStatus({ id: item.id, status })
            setTimeout(() => setAddStatus(null), 2000)
        }
    }

    const getDisplayType = (item: ResultItem) => {
        if (item.media_type === 'anime') return 'Anime'
        if (item.media_type === 'movie') return 'Movie'
        if (item.media_type === 'person') return 'Person'
        return 'TV Show'
    }

    const getImageUrl = (item: ResultItem) => {
        if (item.media_type === 'anime') return item.poster_path || null
        return imageUrl(item.poster_path ?? null)
    }

    const renderCard = (item: ResultItem) => {
        const imgUrl = getImageUrl(item)
        const isInWatchlist = watchlistIds.has(item.id)
        const addState = addStatus?.id === item.id ? addStatus.status : null

        return (
            <article className="discover-card" key={`${item.media_type}-${item.id}`}>
                <div className="discover-card__poster" onClick={() => setDetailItem(item)}>
                    {imgUrl ? (
                        <img src={imgUrl} alt={item.title || item.name || ''} />
                    ) : (
                        <div className="discover-card__no-poster">
                            <span>{item.title || item.name || 'Untitled'}</span>
                        </div>
                    )}
                    {item.vote_average && (
                        <div className="discover-card__rating">{item.vote_average.toFixed(1)}</div>
                    )}
                </div>
                <div className="discover-card__body">
                    <h3 onClick={() => setDetailItem(item)}>{item.title || item.name}</h3>
                    <span className="discover-card__type">{getDisplayType(item)}</span>
                    {isInWatchlist ? (
                        <span className="discover-card__in-list">✓ In Watchlist</span>
                    ) : addState ? (
                        <span className="discover-card__in-list">✓ Added as {addState}</span>
                    ) : (
                        <div className="discover-card__add-options">
                            <button className="discover-card__add-btn" onClick={() => addToWatchlist(item, 'planning')} disabled={adding === item.id}>
                                {adding === item.id ? '...' : 'Plan to Watch'}
                            </button>
                            <button className="discover-card__add-btn discover-card__add-btn--watch" onClick={() => addToWatchlist(item, 'watching')} disabled={adding === item.id}>
                                Watching
                            </button>
                            <button className="discover-card__add-btn discover-card__add-btn--done" onClick={() => addToWatchlist(item, 'completed')} disabled={adding === item.id}>
                                Watched
                            </button>
                        </div>
                    )}
                </div>
            </article>
        )
    }

    const renderSection = (title: string, items: ResultItem[]) => {
        if (items.length === 0) return null
        const display = showAll ? items : items.slice(0, 6)
        return (
            <div className="discover-section">
                <div className="discover-section__head">
                    <h2>{title}</h2>
                    {!showAll && items.length > 6 && (
                        <button className="dashboard-link-btn" onClick={() => setShowAll(true)}>See All ({items.length})</button>
                    )}
                </div>
                <div className="discover-grid">
                    {display.map(renderCard)}
                </div>
            </div>
        )
    }

    return (
        <div className="discover-page">
            <div className="discover-container">
                <div className="discover-search-wrap">
                    <form onSubmit={handleSearch}>
                        <div className="discover-search-box">
                            <svg className="discover-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                className="discover-search"
                                placeholder="Search movies, TV shows, anime, actors..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                <div className="discover-controls">
                    <div className="discover-tabs">
                        <button className={`discover-tab ${mediaType === 'all' ? 'active' : ''}`} onClick={() => setMediaType('all')}>All</button>
                        <button className={`discover-tab ${mediaType === 'movie' ? 'active' : ''}`} onClick={() => setMediaType('movie')}>Movies</button>
                        <button className={`discover-tab ${mediaType === 'tv' ? 'active' : ''}`} onClick={() => setMediaType('tv')}>TV Shows</button>
                        <button className={`discover-tab ${mediaType === 'anime' ? 'active' : ''}`} onClick={() => setMediaType('anime')}>Anime</button>
                    </div>
                    <div className="discover-sorts">
                        <button className={`discover-sort-btn ${sortBy === 'popular' ? 'active' : ''}`} onClick={() => setSortBy('popular')}>Popular</button>
                        <button className={`discover-sort-btn ${sortBy === 'trending' ? 'active' : ''}`} onClick={() => setSortBy('trending')}>Trending</button>
                        <button className={`discover-sort-btn ${sortBy === 'top_rated' ? 'active' : ''}`} onClick={() => setSortBy('top_rated')}>Top Rated</button>
                    </div>
                </div>

                {loading ? (
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
                ) : query ? (
                    <div className="discover-section">
                        <div className="discover-section__head">
                            <h2>Results for "{query}"</h2>
                            <span>{results.length} found</span>
                        </div>
                        {results.length === 0 ? (
                            <div className="discover-empty"><p>No results found</p></div>
                        ) : (
                            <div className="discover-grid">{results.map(renderCard)}</div>
                        )}
                    </div>
                ) : mediaType === 'all' ? (
                    <>
                        {renderSection(`${sortBy === 'popular' ? 'Popular' : sortBy === 'trending' ? 'Trending' : 'Top Rated'} Movies`, movies)}
                        {renderSection(`${sortBy === 'popular' ? 'Popular' : sortBy === 'trending' ? 'Trending' : 'Top Rated'} TV Shows`, tvShows)}
                        {renderSection('Popular Anime', animeList)}
                        {movies.length === 0 && tvShows.length === 0 && animeList.length === 0 && (
                            <div className="discover-empty"><p>Nothing to show</p></div>
                        )}
                    </>
                ) : (
                    <div className="discover-section">
                        <div className="discover-section__head">
                            <h2>{sortBy === 'popular' ? 'Popular' : sortBy === 'trending' ? 'Trending' : 'Top Rated'} {mediaType === 'movie' ? 'Movies' : mediaType === 'tv' ? 'TV Shows' : 'Anime'}</h2>
                        </div>
                        {results.length === 0 ? (
                            <div className="discover-empty"><p>Nothing to show</p></div>
                        ) : (
                            <div className="discover-grid">{results.map(renderCard)}</div>
                        )}
                    </div>
                )}
            </div>

            {detailItem && (
                <DetailModal
                    item={detailItem}
                    onClose={() => setDetailItem(null)}
                    onAdd={addToWatchlist}
                    isInWatchlist={watchlistIds.has(detailItem.id)}
                />
            )}
        </div>
    )
}

export default Discover
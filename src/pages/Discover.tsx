import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { searchMulti, getPopularMovies, getPopularTV, imageUrl } from '../services/tmdbService'
import { searchAnime, getPopularAnime, getAnilistImageUrl } from '../services/anilistService'
import type { TMDBResult, AnilistResult } from '../types'

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

    const [movies, setMovies] = useState<ResultItem[]>([])
    const [tvShows, setTvShows] = useState<ResultItem[]>([])
    const [animeList, setAnimeList] = useState<ResultItem[]>([])

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

    const loadPopular = async () => {
        setLoading(true)
        if (mediaType === 'anime') {
            const animeResults = await getPopularAnime()
            setResults(animeResults.map(formatAnimeItem))
            setMovies([])
            setTvShows([])
            setAnimeList([])
        } else if (mediaType === 'movie') {
            const data = await getPopularMovies()
            setResults(data.results || [])
            setMovies([])
            setTvShows([])
            setAnimeList([])
        } else if (mediaType === 'tv') {
            const data = await getPopularTV()
            setResults(data.results || [])
            setMovies([])
            setTvShows([])
            setAnimeList([])
        } else {
            // 'all' - load movies, TV shows, and anime separately
            const [moviesData, tvData, animeData] = await Promise.all([
                getPopularMovies(),
                getPopularTV(),
                getPopularAnime()
            ])
            setMovies(moviesData.results || [])
            setTvShows(tvData.results || [])
            setAnimeList(animeData.map(formatAnimeItem))
            setResults([])
        }
        setLoading(false)
    }

    useEffect(() => {
        loadPopular()
    }, [mediaType])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        setLoading(true)

        if (mediaType === 'anime') {
            const animeResults = await searchAnime(query)
            setResults(animeResults.map(formatAnimeItem))
        } else {
            const data = await searchMulti(query)
            setResults(data.results || [])
        }

        setMovies([])
        setTvShows([])
        setAnimeList([])
        setLoading(false)
    }

    const addToWatchlist = async (item: ResultItem) => {
        setAdding(item.id)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return alert('Please log in')

        const isAnime = item.media_type === 'anime'
        const mediaTypeValue = isAnime ? 'anime' : (item.media_type === 'movie' ? 'movie' : 'tv')

        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: mediaTypeValue,
            ...isAnime 
                ? { anilist_id: item.id }
                : { tmdb_id: item.id },
            title: item.title || item.name,
            poster_path: item.poster_path,
            overview: item.overview,
            release_date: item.release_date,
            vote_average: item.vote_average,
            status: 'planning'
        })

        setAdding(null)
        if (error) alert('Error: ' + error.message)
        else alert('Added to watchlist!')
    }

    const getDisplayType = (item: ResultItem) => {
        if (item.media_type === 'anime') return 'Anime'
        if (item.media_type === 'movie') return 'Movie'
        return 'TV Show'
    }

    const getImageUrl = (item: ResultItem) => {
        if (item.media_type === 'anime') {
            return item.poster_path || '/placeholder.png'
        }
        return imageUrl(item.poster_path ?? null) || '/placeholder.png'
    }

    const renderCard = (item: ResultItem) => (
        <article className="dashboard-card" key={`${item.media_type}-${item.id}`}>
            <img
                src={getImageUrl(item)}
                alt={item.title || item.name}
                className="dashboard-card__art"
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px 8px 0 0' }}
            />
            <div className="dashboard-card__body">
                <h3>{item.title || item.name}</h3>
                <p>{getDisplayType(item)}</p>
                <p>{item.overview?.slice(0, 80)}...</p>
                <button
                    className="btn btn-primary btn-sm w-100 mt-2"
                    onClick={() => addToWatchlist(item)}
                    disabled={adding === item.id}
                >
                    {adding === item.id ? 'Adding...' : 'Add to Watchlist'}
                </button>
            </div>
        </article>
    )

    const renderSection = (title: string, items: ResultItem[]) => {
        if (items.length === 0) return null
        return (
            <div className="dashboard-section" style={{ marginBottom: '1rem' }}>
                <div className="dashboard-section__head">
                    <h2>{title}</h2>
                    <span>{items.length} items</span>
                </div>
                <div className="dashboard-card-grid">
                    {items.map(renderCard)}
                </div>
            </div>
        )
    }

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-search-wrap">
                    <form onSubmit={handleSearch} className="dashboard-search-form">
                        <input
                            className="dashboard-search"
                            placeholder="Discover anime, movies, and shows"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </form>
                </div>

                <div className="dashboard-filter-bar">
                    <button className={`btn btn-sm ${mediaType === 'all' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMediaType('all')}>All</button>
                    <button className={`btn btn-sm ${mediaType === 'movie' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMediaType('movie')}>Movies</button>
                    <button className={`btn btn-sm ${mediaType === 'tv' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMediaType('tv')}>TV Shows</button>
                    <button className={`btn btn-sm ${mediaType === 'anime' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMediaType('anime')}>Anime</button>
                </div>

                {loading ? (
                    <div className="dashboard-section">
                        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Loading...</p>
                    </div>
                ) : query ? (
                    <div className="dashboard-section">
                        <div className="dashboard-section__head">
                            <h2>Search Results</h2>
                            <span>Found {results.length} results</span>
                        </div>
                        {results.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>No results found</p>
                        ) : (
                            <div className="dashboard-card-grid">
                                {results.map(renderCard)}
                            </div>
                        )}
                    </div>
                ) : mediaType === 'all' ? (
                    <>
                        {renderSection('Popular Movies', movies)}
                        {renderSection('Popular TV Shows', tvShows)}
                        {renderSection('Popular Anime', animeList)}
                        {movies.length === 0 && tvShows.length === 0 && animeList.length === 0 && (
                            <div className="dashboard-section">
                                <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>No results found</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="dashboard-section">
                        <div className="dashboard-section__head">
                            <h2>Popular {mediaType === 'movie' ? 'Movies' : mediaType === 'tv' ? 'TV Shows' : 'Anime'}</h2>
                            <span>Fresh picks for your queue</span>
                        </div>
                        {results.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>No results found</p>
                        ) : (
                            <div className="dashboard-card-grid">
                                {results.map(renderCard)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    )
}

export default Discover
import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { searchMulti, getPopularMovies, imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'

const Discover: React.FC = () => {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<TMDBResult[]>([])
    const [loading, setLoading] = useState(false)
    const [adding, setAdding] = useState<number | null>(null)

    useEffect(() => {
        getPopularMovies().then(data => setResults(data.results || []))
    }, [])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        setLoading(true)
        const data = await searchMulti(query)
        setResults(data.results || [])
        setLoading(false)
    }

    const addToWatchlist = async (item: TMDBResult) => {
        setAdding(item.id)
        const mediaType = item.media_type === 'movie' ? 'movie' : 'tv'

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return alert('Please log in')

        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: mediaType,
            tmdb_id: item.id,
            title: item.title || item.name,
            poster_path: item.poster_path,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date,
            vote_average: item.vote_average,
            status: 'planning'
        })

        setAdding(null)
        if (error) alert('Error: ' + error.message)
        else alert('Added to watchlist!')
    }

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-search-wrap">
                    <form onSubmit={handleSearch} style={{ width: '100%' }}>
                        <input
                            className="dashboard-search"
                            placeholder="Discover anime, movies, and shows"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </form>
                </div>

                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>{query ? 'Search Results' : 'Popular Right Now'}</h2>
                        <span>{query ? `Found ${results.length} results` : 'Fresh picks for your queue'}</span>
                    </div>

                    {loading ? (
                        <p>Searching...</p>
                    ) : (
                        <div className="dashboard-card-grid">
                            {results.map((item) => (
                                <article className="dashboard-card" key={item.id}>
                                    <img
                                        src={imageUrl(item.poster_path ?? null) || '/placeholder.png'}
                                        alt={item.title || item.name}
                                        className="dashboard-card__art"
                                        style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px 8px 0 0' }}
                                    />
                                    <div className="dashboard-card__body">
                                        <h3>{item.title || item.name}</h3>
                                        <p>{item.media_type === 'movie' ? 'Movie' : 'TV Show'}</p>
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
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default Discover
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabaseClient'
import { searchMulti, searchPerson, getPopularMovies, getTrendingMovies, getTopRatedMovies, getPopularTV, getTrendingTV, getTopRatedTV } from '../services/tmdbService'
import type { TMDBResult, WatchlistItem } from '../types'
import MediaCard from '../components/MediaCard'
import DetailModal from '../components/DetailModal'
import AddModal from '../components/AddModal'
import AddWithEpisodesModal from '../components/AddWithEpisodesModal'

type ResultItem = TMDBResult

const Discover: React.FC = () => {
    const [query, setQuery] = useState('')  
    const [results, setResults] = useState<ResultItem[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv'>('all')
    const [sortBy, setSortBy] = useState<'popular' | 'trending' | 'top_rated'>('popular')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [detailItem, setDetailItem] = useState<ResultItem | null>(null)
    const [addItem, setAddItem] = useState<ResultItem | null>(null)
    const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set())
    const [addStatus, setAddStatus] = useState<{ id: number; status: string } | null>(null)

    const sentinelRef = useRef<HTMLDivElement>(null)
    const fetchingRef = useRef(false)

    useEffect(() => {
        const fetchWatchlist = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase.from('watchlist').select('tmdb_id').eq('user_id', user.id)
            if (data) {
                const ids = new Set<number>()
                data.forEach((w: { tmdb_id?: number }) => {
                    if (w.tmdb_id) ids.add(w.tmdb_id)
                })
                setWatchlistIds(ids)
            }
        }
        fetchWatchlist()
    }, [])

    const fetchData = async (pageNum: number) => {
        if (fetchingRef.current) return
        fetchingRef.current = true

        if (pageNum === 1) {
            setLoading(true)
        } else {
            setLoadingMore(true)
        }

        try {
            let newResults: ResultItem[] = []
            let totalPages = 1

            if (query.trim()) {
                const [multiData, personData] = await Promise.all([
                    searchMulti(query),
                    searchPerson(query)
                ])
                let combined = [...(multiData.results || []), ...(personData.results || [])]
                combined = combined.map(r => ({
                    ...r,
                    media_type: r.media_type || (r.title ? 'movie' as const : 'tv' as const)
                }))
                if (mediaType === 'movie') {
                    combined = combined.filter(r => r.media_type === 'movie')
                } else if (mediaType === 'tv') {
                    combined = combined.filter(r => r.media_type === 'tv')
                }
                newResults = combined
                totalPages = 1
            } else if (mediaType === 'movie') {
                const data = sortBy === 'trending' ? await getTrendingMovies(pageNum) : sortBy === 'top_rated' ? await getTopRatedMovies(pageNum) : await getPopularMovies(pageNum)
                newResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({ ...r, media_type: 'movie' as const }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            } else if (mediaType === 'tv') {
                const data = sortBy === 'trending' ? await getTrendingTV(pageNum) : sortBy === 'top_rated' ? await getTopRatedTV(pageNum) : await getPopularTV(pageNum)
                newResults = ((data as { results: TMDBResult[] }).results || []).map(r => ({ ...r, media_type: 'tv' as const }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            } else {
                const [moviesData, tvData] = await Promise.all([
                    getPopularMovies(pageNum),
                    getPopularTV(pageNum)
                ])
                const movies = ((moviesData as { results: TMDBResult[] }).results || []).map(r => ({ ...r, media_type: 'movie' as const }))
                const tv = ((tvData as { results: TMDBResult[] }).results || []).map(r => ({ ...r, media_type: 'tv' as const }))
                const combined = [...movies, ...tv]
                for (let i = combined.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [combined[i], combined[j]] = [combined[j], combined[i]]
                }
                newResults = combined
                totalPages = 10
            }

            setResults(prev => pageNum === 1 ? newResults : [...prev, ...newResults])
            setPage(pageNum)
            setHasMore(pageNum < totalPages)
        } catch (err) {
            console.error('Failed to load:', err)
        }
        setLoading(false)
        setLoadingMore(false)
        fetchingRef.current = false
    }

    useEffect(() => {
        setPage(1)
        setHasMore(true)
        fetchData(1)
    }, [mediaType, sortBy, query])

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !fetchingRef.current && !loadingMore) {
                fetchData(page + 1)
            }
        }, { rootMargin: '400px' })

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, loadingMore, page, fetchData])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        fetchData(1)
    }

    const addToWatchlist = async (item: ResultItem, status: string) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return alert('Please log in')

        const mediaTypeValue = item.media_type === 'movie' ? 'movie' : 'tv'
        const itemTitle = item.title || item.name || ''

        const { error } = await supabase.from('watchlist').insert({
            user_id: user.id,
            media_type: mediaTypeValue,
            tmdb_id: item.id,
            title: itemTitle,
            poster_path: item.poster_path,
            overview: item.overview,
            release_date: item.release_date,
            vote_average: item.vote_average,
            status
        })

        if (error) alert('Error: ' + error.message)
        else {
            setWatchlistIds(prev => new Set(prev).add(item.id))
            setAddStatus({ id: item.id, status })
            setTimeout(() => setAddStatus(null), 2000)
        }
    }

    const handleAddWithEpisodes = (item: WatchlistItem) => {
        setWatchlistIds(prev => new Set(prev).add(Number(item.tmdb_id)))
        setAddItem(null)
    }

    const getSectionTitle = (): string => {
        if (query.trim()) return `Results for "${query}"`
        const source = mediaType === 'all'
            ? 'Popular Movies & TV Shows'
            : sortBy === 'popular'
                ? 'Popular'
                : sortBy === 'trending'
                    ? 'Trending'
                    : 'Top Rated'
        return mediaType === 'movie' ? `${source} Movies` : mediaType === 'tv' ? `${source} TV Shows` : source
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
                                placeholder="Search movies, TV shows..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                <div className="discover-controls">
                    <div className="discover-tabs">
                        <button className={`discover-tab ${mediaType === 'all' ? 'active' : ''}`} onClick={() => { setMediaType('all'); setQuery(''); }}>All</button>
                        <button className={`discover-tab ${mediaType === 'movie' ? 'active' : ''}`} onClick={() => { setMediaType('movie'); setQuery(''); }}>Movies</button>
                        <button className={`discover-tab ${mediaType === 'tv' ? 'active' : ''}`} onClick={() => { setMediaType('tv'); setQuery(''); }}>TV Shows</button>
                    </div>
                    <div className="discover-sorts">
                        <button className={`discover-sort-btn ${sortBy === 'popular' ? 'active' : ''}`} onClick={() => setSortBy('popular')}>Popular</button>
                        <button className={`discover-sort-btn ${sortBy === 'trending' ? 'active' : ''}`} onClick={() => setSortBy('trending')}>Trending</button>
                        <button className={`discover-sort-btn ${sortBy === 'top_rated' ? 'active' : ''}`} onClick={() => setSortBy('top_rated')}>Top Rated</button>
                    </div>
                </div>

                {loading ? (
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
                ) : results.length === 0 ? (
                    <div className="discover-empty"><p>{query ? 'No results found' : 'Nothing to show'}</p></div>
                ) : (
                    <div className="watchlist-section">
                        <h3 className="watchlist-section__title">{getSectionTitle()}</h3>
                        <div className="discover-grid">
                            {results.map((item) => (
                                <MediaCard
                                    key={`${item.media_type}-${item.id}`}
                                    item={item}
                                    isInWatchlist={watchlistIds.has(item.id)}
                                    onDetail={setDetailItem}
                                    onAdd={setAddItem}
                                    addStatus={addStatus}
                                />
                            ))}
                        </div>
                        <div ref={sentinelRef} style={{ height: '1px' }} />
                        {loadingMore && (
                            <div className="discover-loading"><div className="discover-spinner" /><p>Loading more...</p></div>
                        )}
                        {!hasMore && results.length > 0 && (
                            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', padding: '1rem' }}>
                                You've reached the end
                            </p>
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
            {addItem && (
                addItem.media_type === 'tv' ? (
                    <AddWithEpisodesModal
                        item={addItem}
                        onClose={() => setAddItem(null)}
                        onAdd={handleAddWithEpisodes}
                    />
                ) : (
                    <AddModal item={addItem} onClose={() => setAddItem(null)} onAdd={addToWatchlist} />
                )
            )}
        </div>
    )
}

export default Discover
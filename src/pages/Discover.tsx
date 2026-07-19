import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../services/supabaseClient'
import { searchMulti, searchPerson, getPopularMovies, getTrendingMovies, getTopRatedMovies, getPopularTV, getTrendingTV, getTopRatedTV, getPersonMovies, getPersonTV, getPopularPeople } from '../services/tmdbService'
import type { TMDBResult, WatchlistItem } from '../types'
import MediaCard from '../components/MediaCard'
import PersonCard from '../components/PersonCard'
import DetailModal from '../components/DetailModal'
import AddModal from '../components/AddModal'
import AddWithEpisodesModal from '../components/AddWithEpisodesModal'
import DiscoverDetailView from '../components/DiscoverDetailView'
import PersonDetailModal from '../components/PersonDetailModal'

type ResultItem = TMDBResult

const Discover: React.FC = () => {
    const [query, setQuery] = useState('')  
    const [results, setResults] = useState<ResultItem[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv' | 'person'>('all')
    const [sortBy, setSortBy] = useState<'popular' | 'trending' | 'top_rated'>('popular')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [detailItem, setDetailItem] = useState<ResultItem | null>(null)
    const [addItem, setAddItem] = useState<ResultItem | null>(null)
    const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set())

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

    const fetchData = useCallback(async (pageNum: number) => {
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
                
                // Deduplicate by id to avoid actors/actresses appearing twice
                const seen = new Set<number>()
                combined = combined.filter(item => {
                    if (seen.has(item.id)) return false
                    seen.add(item.id)
                    return true
                })
                
                combined = combined.map(r => {
                    // Person results have profile_path but no title, and no media_type
                    if (r.profile_path && !r.title && !r.media_type) {
                        return { ...r, media_type: 'person' as const }
                    }
                    return { ...r, media_type: r.media_type || (r.title ? 'movie' as const : 'tv' as const) }
                })
                if (mediaType === 'movie') {
                    combined = combined.filter(r => r.media_type === 'movie')
                } else if (mediaType === 'tv') {
                    combined = combined.filter(r => r.media_type === 'tv')
                } else if (mediaType === 'person') {
                    combined = combined.filter(r => r.media_type === 'person')
                }
                // If searching for people, also fetch their filmography
                if (query.trim() && combined.some(r => r.media_type === 'person')) {
                    const personIds = combined.filter(r => r.media_type === 'person').map(r => r.id)
                    const [personMovies, personTV] = await Promise.all([
                        Promise.all(personIds.map(id => getPersonMovies(id))),
                        Promise.all(personIds.map(id => getPersonTV(id)))
                    ])
                    const films = [
                        ...personMovies.flatMap(d => (d.results || []).map(r => ({ ...r, media_type: 'movie' as const }))),
                        ...personTV.flatMap(d => (d.results || []).map(r => ({ ...r, media_type: 'tv' as const })))
                    ]
                    // Deduplicate films by id
                    const filmSeen = new Set<number>()
                    const uniqueFilms = films.filter(f => {
                        if (filmSeen.has(f.id)) return false
                        filmSeen.add(f.id)
                        return true
                    })
                    combined = [...combined, ...uniqueFilms]
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
            } else if (mediaType === 'person') {
                const data = await getPopularPeople(pageNum)
                newResults = (data.results || []).map(r => ({ ...r, media_type: 'person' as const }))
                totalPages = (data as { total_pages?: number }).total_pages || 1
            } else {
                const [moviesData, tvData] = await Promise.all([
                    getPopularMovies(pageNum),
                    getPopularTV(pageNum)
                ])
                const movies = ((moviesData as { results: TMDBResult[] }).results || []).map(r => ({ ...r, media_type: 'movie' as const }))
                const tv = ((tvData as { results: TMDBResult[] }).results || []).map(r => ({ ...r, media_type: 'tv' as const }))
                const combined = [...movies, ...tv]
                // Shuffle on first page only (page 1) so subsequent pages don't re-shuffle existing results
                if (pageNum === 1) {
                    for (let i = combined.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [combined[i], combined[j]] = [combined[j], combined[i]]
                    }
                }
                newResults = combined
                // Use actual page limit from both sources
                const moviesTotal = (moviesData as { total_pages?: number }).total_pages || 1
                const tvTotal = (tvData as { total_pages?: number }).total_pages || 1
                totalPages = Math.max(moviesTotal, tvTotal)
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
    }, [mediaType, sortBy, query])

    const fetchTrigger = `${mediaType}-${sortBy}-${query}`
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on dependency change
        fetchData(1)
    }, [fetchTrigger, fetchData])

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
    }, [hasMore, loadingMore, page, fetchData, loading])

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
        }
    }

    const handleAddWithEpisodes = (item: WatchlistItem) => {
        setWatchlistIds(prev => new Set(prev).add(Number(item.tmdb_id)))
        setAddItem(null)
    }

    const handleDetailAdd = (item: WatchlistItem) => {
        setWatchlistIds(prev => new Set(prev).add(Number(item.tmdb_id)))
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
        if (mediaType === 'person') return 'Popular People'
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
                                placeholder="Search movies, TV shows, actors, directors..."
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
                        <button className={`discover-tab ${mediaType === 'person' ? 'active' : ''}`} onClick={() => { setMediaType('person'); setQuery(''); }}>People</button>
                    </div>
                    {mediaType !== 'person' && (
                        <div className="discover-sorts">
                            <button className={`discover-sort-btn ${sortBy === 'popular' ? 'active' : ''}`} onClick={() => setSortBy('popular')}>Popular</button>
                            <button className={`discover-sort-btn ${sortBy === 'trending' ? 'active' : ''}`} onClick={() => setSortBy('trending')}>Trending</button>
                            <button className={`discover-sort-btn ${sortBy === 'top_rated' ? 'active' : ''}`} onClick={() => setSortBy('top_rated')}>Top Rated</button>
                        </div>
                    )}
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
                                item.media_type === 'person' ? (
                                    <PersonCard
                                        key={`${item.media_type}-${item.id}`}
                                        item={item}
                                        onDetail={setDetailItem}
                                    />
                                ) : (
                                    <MediaCard
                                        key={`${item.media_type}-${item.id}`}
                                        item={item}
                                        isInWatchlist={watchlistIds.has(item.id)}
                                        onDetail={setDetailItem}
                                        onAdd={setAddItem}
                                    />
                                )
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
                detailItem.media_type === 'tv' ? (
                    <DiscoverDetailView
                        item={detailItem}
                        onClose={() => setDetailItem(null)}
                        onAdd={handleDetailAdd}
                        isInWatchlist={watchlistIds.has(detailItem.id)}
                    />
                ) : detailItem.media_type === 'person' ? (
                    <PersonDetailModal
                        item={detailItem}
                        onClose={() => setDetailItem(null)}
                        onMediaClick={(media) => setDetailItem(media)}
                    />
                ) : (
                    <DetailModal
                        item={detailItem}
                        onClose={() => setDetailItem(null)}
                        onAdd={addToWatchlist}
                        isInWatchlist={watchlistIds.has(detailItem.id)}
                        onPersonClick={(person) => setDetailItem(person)}
                    />
                )
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
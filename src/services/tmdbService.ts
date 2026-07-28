const API_KEY = import.meta.env.VITE_TMDB_API_KEY
const FANART_API_KEY = import.meta.env.VITE_FANART_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original'
const FANART_BASE = 'https://webservice.fanart.tv/v3'

import type { TMDBResult } from '../types'
import { getCachedOrFetch } from './cacheService'

export const searchMulti = async (query: string, page: number = 1): Promise<{ results: TMDBResult[]; total_pages?: number }> => {
    const res = await fetch(
        `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}`
    )
    return res.json()
}

export const searchPerson = async (query: string, page: number = 1): Promise<{ results: TMDBResult[]; total_pages?: number }> => {
    const res = await fetch(
        `${BASE_URL}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}`
    )
    return res.json()
}

export const getPersonDetails = async (id: number): Promise<{
    id: number
    name: string
    profile_path?: string | null
    biography?: string
    birthday?: string
    place_of_birth?: string
    known_for_department?: string
    popularity?: number
    gender?: number
    known_for?: TMDBResult[]
}> => {
    const res = await fetch(
        `${BASE_URL}/person/${id}?api_key=${API_KEY}`
    )
    return res.json()
}

export const getPopularMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const url = new URL(`${BASE_URL}/movie/popular`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('region', 'US')
    url.searchParams.append('page', String(page))
    const res = await fetch(url.toString())
    return res.json()
}

export const getTrendingMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const url = new URL(`${BASE_URL}/trending/movie/week`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('page', String(page))
    const res = await fetch(url.toString())
    return res.json()
}

export const getTopRatedMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const url = new URL(`${BASE_URL}/movie/top_rated`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('region', 'US')
    url.searchParams.append('page', String(page))
    const res = await fetch(url.toString())
    return res.json()
}

export const getPopularTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const url = new URL(`${BASE_URL}/tv/popular`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('page', String(page))
    const res = await fetch(url.toString())
    return res.json()
}

export const getTrendingTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const url = new URL(`${BASE_URL}/trending/tv/week`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('page', String(page))
    const res = await fetch(url.toString())
    return res.json()
}

export const getTopRatedTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const url = new URL(`${BASE_URL}/tv/top_rated`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('page', String(page))
    const res = await fetch(url.toString())
    return res.json()
}

export const getMovieDetails = async (id: number) => {
    const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}&append_to_response=credits,videos,images,release_dates,watch/providers`)
    return res.json()
}

export const getTVDetails = async (id: number) => {
    return getCachedOrFetch(
        'tv-details',
        id,
        async () => {
            const res = await fetch(`${BASE_URL}/tv/${id}?api_key=${API_KEY}&append_to_response=credits,videos,aggregate_credits,images,watch/providers,content_ratings`)
            return res.json()
        },
        { ttl: 6 * 60 * 60 * 1000 } // 6 hours
    )
}

export const getTVSeasonDetails = async (tvId: number, seasonNumber: number) => {
    return getCachedOrFetch(
        'tv-season',
        `${tvId}-${seasonNumber}`,
        async () => {
            const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`)
            return res.json()
        },
        { ttl: 6 * 60 * 60 * 1000 } // 6 hours
    )
}

export const getTVSeasons = async (id: number, seasonNumber: number) => {
    const res = await fetch(`${BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${API_KEY}`)
    return res.json()
}

export const imageUrl = (path: string | null) => {
    if (!path) return null
    return `${IMAGE_BASE}${path}`
}

export const imageUrlOriginal = (path: string | null) => {
    if (!path) return null
    return `${IMAGE_BASE_ORIGINAL}${path}`
}

export const getFanartImages = async (tmdbId: number, type: 'movies' | 'tv') => {
    if (!FANART_API_KEY) return null
    return getCachedOrFetch(
        'fanart',
        `${type}-${tmdbId}`,
        async () => {
            try {
                const res = await fetch(`${FANART_BASE}/${type}/${tmdbId}?api_key=${FANART_API_KEY}`)
                if (!res.ok) return null
                return res.json()
            } catch {
                return null
            }
        },
        { ttl: 24 * 60 * 60 * 1000 } // 24 hours
    )
}

export const getPersonMovies = async (id: number): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/person/${id}/movie_credits?api_key=${API_KEY}`)
    return res.json()
}

export const getPersonTV = async (id: number): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/person/${id}/tv_credits?api_key=${API_KEY}`)
    return res.json()
}

export const getPopularPeople = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/person/popular?api_key=${API_KEY}&page=${page}`)
    return res.json()
}

// ─── Discover / Filter endpoints ──────────────────────────────────────────────

export const discoverMovies = async (params: {
    page?: number
    sort_by?: string
    primary_release_year?: number
    with_genres?: string
    'release_date.lte'?: string
    'release_date.gte'?: string
}) => {
    const url = new URL(`${BASE_URL}/discover/movie`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    url.searchParams.append('region', 'US')
    if (params.page) url.searchParams.append('page', String(params.page))
    if (params.sort_by) url.searchParams.append('sort_by', params.sort_by)
    if (params.primary_release_year) url.searchParams.append('primary_release_year', String(params.primary_release_year))
    if (params.with_genres) url.searchParams.append('with_genres', params.with_genres)
    if (params['release_date.lte']) url.searchParams.append('release_date.lte', params['release_date.lte'])
    if (params['release_date.gte']) url.searchParams.append('release_date.gte', params['release_date.gte'])
    const res = await fetch(url.toString())
    return res.json()
}

export const discoverTV = async (params: {
    page?: number
    sort_by?: string
    first_air_date_year?: number
    with_genres?: string
    'first_air_date.lte'?: string
    'first_air_date.gte'?: string
}) => {
    const url = new URL(`${BASE_URL}/discover/tv`)
    url.searchParams.append('api_key', API_KEY)
    url.searchParams.append('language', 'en-US')
    if (params.page) url.searchParams.append('page', String(params.page))
    if (params.sort_by) url.searchParams.append('sort_by', params.sort_by)
    if (params.first_air_date_year) url.searchParams.append('first_air_date_year', String(params.first_air_date_year))
    if (params.with_genres) url.searchParams.append('with_genres', params.with_genres)
    if (params['first_air_date.lte']) url.searchParams.append('first_air_date.lte', params['first_air_date.lte'])
    if (params['first_air_date.gte']) url.searchParams.append('first_air_date.gte', params['first_air_date.gte'])
    const res = await fetch(url.toString())
    return res.json()
}

export const getGenres = async (type: 'movie' | 'tv') => {
    const cacheKey = `genres-${type}`
    return getCachedOrFetch(
        'genres',
        cacheKey,
        async () => {
            const res = await fetch(`${BASE_URL}/genre/${type}/list?api_key=${API_KEY}`)
            const data = await res.json()
            return data.genres || []
        },
        { ttl: 24 * 60 * 60 * 1000 } // 24 hours
    )
}

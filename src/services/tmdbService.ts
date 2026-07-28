const API_KEY = import.meta.env.VITE_TMDB_API_KEY
const FANART_API_KEY = import.meta.env.VITE_FANART_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original'
const FANART_BASE = 'https://webservice.fanart.tv/v3'

import type { TMDBResult } from '../types'
import { getCachedOrFetch } from './cacheService'

export const searchMulti = async (query: string): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(
        `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
    )
    return res.json()
}

export const searchPerson = async (query: string): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(
        `${BASE_URL}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
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
    const res = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}&page=${page}`)
    return res.json()
}

export const getTrendingMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/trending/movie/week?api_key=${API_KEY}&page=${page}`)
    return res.json()
}

export const getTopRatedMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/movie/top_rated?api_key=${API_KEY}&page=${page}`)
    return res.json()
}

export const getPopularTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/tv/popular?api_key=${API_KEY}&page=${page}`)
    return res.json()
}

export const getTrendingTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`)
    return res.json()
}

export const getTopRatedTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/tv/top_rated?api_key=${API_KEY}&page=${page}`)
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

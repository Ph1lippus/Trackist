const API_KEY = import.meta.env.VITE_TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

import type { TMDBResult } from '../types'

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
    const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}&append_to_response=credits,videos`)
    return res.json()
}

export const getTVDetails = async (id: number) => {
    const res = await fetch(`${BASE_URL}/tv/${id}?api_key=${API_KEY}&append_to_response=credits,videos,aggregate_credits`)
    return res.json()
}

export const getTVSeasonDetails = async (tvId: number, seasonNumber: number) => {
    const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`)
    return res.json()
}

export const getTVSeasons = async (id: number, seasonNumber: number) => {
    const res = await fetch(`${BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${API_KEY}`)
    return res.json()
}

export const imageUrl = (path: string | null) => {
    if (!path) return null
    return `${IMAGE_BASE}${path}`
}
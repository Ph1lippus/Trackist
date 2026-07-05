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

export const getPopularMovies = async (): Promise<{ results: TMDBResult[] }> => {
    const res = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}`)
    return res.json()
}

export const getPopularTV = async () => {
    const res = await fetch(`${BASE_URL}/tv/popular?api_key=${API_KEY}`)
    return res.json()
}

export const getMovieDetails = async (id: number) => {
    const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}`)
    return res.json()
}

export const getTVDetails = async (id: number) => {
    const res = await fetch(`${BASE_URL}/tv/${id}?api_key=${API_KEY}`)
    return res.json()
}

export const getTVSeasons = async (id: number, seasonNumber: number) => {
    const res = await fetch(`${BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${API_KEY}`)
    return res.json()
}

export const imageUrl = (path: string | null) => path ? `${IMAGE_BASE}${path}` : null
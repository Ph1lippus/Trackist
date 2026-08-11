import type { TMDBResult } from '../types'
import { getCachedOrFetch } from './cacheService'

const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original'

async function tmdbProxy(path: string): Promise<Response> {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tmdb-proxy?path=${encodeURIComponent(path)}&_t=${Date.now()}`
    return fetch(url)
}

export const searchMulti = async (query: string, page: number = 1): Promise<{ results: TMDBResult[]; total_pages?: number }> => {
    const res = await tmdbProxy(`/search/multi?query=${encodeURIComponent(query)}&page=${page}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const searchPerson = async (query: string, page: number = 1): Promise<{ results: TMDBResult[]; total_pages?: number }> => {
    const res = await tmdbProxy(`/search/person?query=${encodeURIComponent(query)}&page=${page}`)
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
    const res = await tmdbProxy(`/person/${id}`)
    return res.json()
}

export const getPopularMovies = async (page: number = 1, vote_count_gte?: number): Promise<{ results: TMDBResult[] }> => {
    let path = `/movie/popular?page=${page}`
    if (vote_count_gte) path += `&vote_count.gte=${vote_count_gte}`
    const res = await tmdbProxy(path)
    return res.json()
}

export const getTrendingMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/trending/movie/week?page=${page}`)
    return res.json()
}

export const getTopRatedMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/movie/top_rated?page=${page}`)
    return res.json()
}

export const getPopularTV = async (page: number = 1, vote_count_gte?: number): Promise<{ results: TMDBResult[] }> => {
    let path = `/tv/popular?page=${page}`
    if (vote_count_gte) path += `&vote_count.gte=${vote_count_gte}`
    const res = await tmdbProxy(path)
    return res.json()
}

export const getTrendingTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/trending/tv/week?page=${page}`)
    return res.json()
}

export const getTopRatedTV = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/tv/top_rated?page=${page}`)
    return res.json()
}

export const getMovieDetails = async (id: number) => {
    const path = `/movie/${id}?append_to_response=external_ids,credits,videos,images,release_dates,watch/providers&include_image_language=en,null`
    const res = await tmdbProxy(path)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getTVDetails = async (id: number) => {
    return getCachedOrFetch(
        'tv-details',
        id,
        async () => {
            const path = `/tv/${id}?append_to_response=external_ids,credits,videos,aggregate_credits,images,watch/providers,content_ratings&include_image_language=en,null`
            const res = await tmdbProxy(path)
            return res.json()
        },
        { ttl: 6 * 60 * 60 * 1000 }
    )
}

export const getBestBackdropPath = (
    backdrops: Array<{
        file_path: string
        width: number
        height: number
        iso_639_1?: string | null
        vote_average?: number
        vote_count?: number
    }> = []
): string | null => {
    if (!backdrops.length) return null

    const candidates = backdrops.filter(
        b => b.iso_639_1 === null
    )

    const list = candidates.length ? candidates : backdrops

    const best = [...list].sort((a, b) => {
        const areaA = a.width * a.height
        const areaB = b.width * b.height
        if (areaA !== areaB) return areaB - areaA

        if ((a.vote_average ?? 0) !== (b.vote_average ?? 0)) {
            return (b.vote_average ?? 0) - (a.vote_average ?? 0)
        }

        return (b.vote_count ?? 0) - (a.vote_count ?? 0)
    })[0]

    return best?.file_path ?? null
}

export const getTVSeasonDetails = async (tvId: number, seasonNumber: number) => {
    return getCachedOrFetch(
        'tv-season',
        `${tvId}-${seasonNumber}`,
        async () => {
            const res = await tmdbProxy(`/tv/${tvId}/season/${seasonNumber}`)
            return res.json()
        },
        { ttl: 6 * 60 * 60 * 1000 }
    )
}

export const getTVSeasons = async (id: number, seasonNumber: number) => {
    const res = await tmdbProxy(`/tv/${id}/season/${seasonNumber}`)
    return res.json()
}

export const imageUrl = (path: string | null, size: string = 'w500') => {
    if (!path) return null
    return `https://image.tmdb.org/t/p/${size}${path}`
}

export const imageUrlOriginal = (path: string | null) => {
    if (!path) return null
    return `${IMAGE_BASE_ORIGINAL}${path}`
}

export const getPersonMovies = async (id: number): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/person/${id}/movie_credits`)
    return res.json()
}

export const getPersonTV = async (id: number): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/person/${id}/tv_credits`)
    return res.json()
}

export const getPopularPeople = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/person/popular?page=${page}`)
    return res.json()
}

export const discoverMovies = async (params: {
    page?: number
    sort_by?: string
    primary_release_year?: number
    with_genres?: string
    'release_date.lte'?: string
    'release_date.gte'?: string
    'vote_count.gte'?: number
}) => {
    const query = new URLSearchParams()
    query.append('language', 'en-US')
    query.append('region', 'US')
    if (params.page) query.append('page', String(params.page))
    if (params.sort_by) query.append('sort_by', params.sort_by)
    if (params.primary_release_year) query.append('primary_release_year', String(params.primary_release_year))
    if (params.with_genres) query.append('with_genres', params.with_genres)
    if (params['release_date.lte']) query.append('release_date.lte', params['release_date.lte'])
    if (params['release_date.gte']) query.append('release_date.gte', params['release_date.gte'])
    if (params['vote_count.gte']) query.append('vote_count.gte', String(params['vote_count.gte']))
    
    const res = await tmdbProxy(`/discover/movie?${query.toString()}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    const data = await res.json()
    if (data.status_code || data.status_message) {
        throw new Error(`TMDB API error: ${data.status_message || 'Unknown error'}`)
    }
    return data
}

export const discoverTV = async (params: {
    page?: number
    sort_by?: string
    first_air_date_year?: number
    with_genres?: string
    'first_air_date.lte'?: string
    'first_air_date.gte'?: string
    'vote_count.gte'?: number
}) => {
    const query = new URLSearchParams()
    query.append('language', 'en-US')
    if (params.page) query.append('page', String(params.page))
    if (params.sort_by) query.append('sort_by', params.sort_by)
    if (params.first_air_date_year) query.append('first_air_date_year', String(params.first_air_date_year))
    if (params.with_genres) query.append('with_genres', params.with_genres)
    if (params['first_air_date.lte']) query.append('first_air_date.lte', params['first_air_date.lte'])
    if (params['first_air_date.gte']) query.append('first_air_date.gte', params['first_air_date.gte'])
    if (params['vote_count.gte']) query.append('vote_count.gte', String(params['vote_count.gte']))
    
    const res = await tmdbProxy(`/discover/tv?${query.toString()}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    const data = await res.json()
    if (data.status_code || data.status_message) {
        throw new Error(`TMDB API error: ${data.status_message || 'Unknown error'}`)
    }
    return data
}

export const getGenres = async (type: 'movie' | 'tv') => {
    const cacheKey = `genres-${type}`
    return getCachedOrFetch(
        'genres',
        cacheKey,
        async () => {
            const res = await tmdbProxy(`/genre/${type}/list`)
            if (!res.ok) {
                throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
            }
            const data = await res.json()
            return data.genres || []
        },
        { ttl: 24 * 60 * 60 * 1000 }
    )
}

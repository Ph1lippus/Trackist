import type { TMDBResult } from '../types'


const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original'

const ALLOWED_TMDB_PATHS = ['/search/', '/person/', '/movie/', '/tv/', '/trending/', '/discover/', '/genre/'] as const

function isAllowedPath(path: string): boolean {
    const basePath = path.split('?')[0]
    const allowed = ALLOWED_TMDB_PATHS.some(prefix => basePath.startsWith(prefix))
    if (!allowed) {
        console.warn('[tmdbProxy] Blocked path:', path, 'basePath:', basePath, 'allowedPrefixes:', ALLOWED_TMDB_PATHS)
    }
    return allowed
}

async function tmdbProxy(path: string): Promise<Response> {
    if (!path.startsWith('/')) {
        throw new Error(`Invalid TMDB path: ${path}`)
    }
    if (!isAllowedPath(path)) {
        throw new Error(`TMDB path not allowed: ${path}`)
    }
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
    const path = vote_count_gte
        ? `/movie/popular?page=${page}&vote_count.gte=${vote_count_gte}`
        : `/movie/popular?page=${page}`
    const res = await tmdbProxy(path)
    return res.json()
}

export const getPopularTVShows = async (page: number = 1, vote_count_gte?: number): Promise<{ results: TMDBResult[] }> => {
    const path = vote_count_gte
        ? `/tv/popular?page=${page}&vote_count.gte=${vote_count_gte}`
        : `/tv/popular?page=${page}`
    const res = await tmdbProxy(path)
    return res.json()
}

export const getTrending = async (timeWindow: 'day' | 'week' = 'day'): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/trending/all/${timeWindow}`)
    return res.json()
}

export const getTopRatedMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/movie/top_rated?page=${page}`)
    return res.json()
}

export const getTopRatedTVShows = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/tv/top_rated?page=${page}`)
    return res.json()
}

export const getMovieDetails = async (id: number): Promise<{
    id: number
    title: string
    overview?: string
    poster_path?: string | null
    backdrop_path?: string | null
    release_date?: string
    vote_average?: number
    vote_count?: number
    genres?: { id: number; name: string }[]
    runtime?: number
    status?: string
    tagline?: string
    production_companies?: { id: number; name: string; logo_path?: string | null; origin_country?: string }[]
    videos?: {
        results: {
            id: string
            key: string
            name: string
            site: string
            type: string
            official: boolean
        }[]
    }
}> => {
    const res = await tmdbProxy(`/movie/${id}`)
    return res.json()
}
export const getTVShowDetails = async (id: number): Promise<{
    id: number
    name: string
    overview?: string
    poster_path?: string | null
    backdrop_path?: string | null
    first_air_date?: string
    vote_average?: number
    vote_count?: number
    genres?: { id: number; name: string }[]
    number_of_seasons?: number
    number_of_episodes?: number
    status?: string
    episode_run_time?: number[]
    production_companies?: { id: number; name: string; logo_path?: string | null; origin_country?: string }[]
    videos?: {
        results: {
            id: string
            key: string
            name: string
            site: string
            type: string
            official: boolean
        }[]
    }
}> => {
    const res = await tmdbProxy(`/tv/${id}`)
    return res.json()
}
export const getTVSeasonDetails = async (tvId: number, seasonNumber: number): Promise<{
    id: number
    season_number: number
    episodes: {
        id: number
        episode_number: number
        name: string
        overview?: string
        still_path?: string | null
        air_date?: string
        vote_average?: number
        runtime?: number
    }[]
}> => {
    const res = await tmdbProxy(`/tv/${tvId}/season/${seasonNumber}`)
    return res.json()
}

export const getTVEpisodeDetails = async (tvId: number, seasonNumber: number, episodeNumber: number): Promise<{
    id: number
    episode_number: number
    name: string
    overview?: string
    still_path?: string | null
    air_date?: string
    vote_average?: number
    runtime?: number
}> => {
    const res = await tmdbProxy(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`)
    return res.json()
}

export const getSimilarMovies = async (id: number, page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/movie/${id}/similar?page=${page}`)
    return res.json()
}

export const getSimilarTVShows = async (id: number, page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/tv/${id}/similar?page=${page}`)
    return res.json()
}

export const getMovieCredits = async (id: number): Promise<{
    cast: {
        id: number
        name: string
        character: string
        profile_path?: string | null
        order: number
    }[]
    crew: {
        id: number
        name: string
        job: string
        profile_path?: string | null
        department: string
    }[]
}> => {
    const res = await tmdbProxy(`/movie/${id}/credits`)
    return res.json()
}

export const getTVShowCredits = async (id: number): Promise<{
    cast: {
        id: number
        name: string
        character: string
        profile_path?: string | null
        order: number
    }[]
    crew: {
        id: number
        name: string
        job: string
        profile_path?: string | null
        department: string
    }[]
}> => {
    const res = await tmdbProxy(`/tv/${id}/credits`)
    return res.json()
}

export const getVideos = async (id: number, mediaType: 'movie' | 'tv'): Promise<{
    results: {
        id: string
        key: string
        name: string
        site: string
        type: string
        official: boolean
    }[]
}> => {
    const res = await tmdbProxy(`/${mediaType}/${id}/videos`)
    return res.json()
}

export const getWatchProviders = async (id: number, mediaType: 'movie' | 'tv'): Promise<{
    results?: {
        flatrate?: { provider_id: number; provider_name: string; logo_path?: string | null }[]
    }[]
}> => {
    const res = await tmdbProxy(`/${mediaType}/${id}/watch/providers`)
    return res.json()
}

export const getExternalIds = async (id: number, mediaType: 'movie' | 'tv'): Promise<{
    imdb_id?: string
    facebook_id?: string
    instagram_id?: string
    twitter_id?: string
}> => {
    const res = await tmdbProxy(`/${mediaType}/${id}/external_ids`)
    return res.json()
}

export const imageUrl = (path: string | null | undefined, size: string = 'w500'): string | null => {
    if (!path) return null
    return `${IMAGE_BASE_ORIGINAL}/${size}${path}`
}

export const getBackdropUrl = (path: string | null | undefined, size: string = 'original'): string | null => {
    if (!path) return null
    return `${IMAGE_BASE_ORIGINAL}/${size}${path}`
}


export const getTVDetails = async (id: number): Promise<{
    id: number
    name: string
    overview?: string
    poster_path?: string | null
    backdrop_path?: string | null
    first_air_date?: string
    vote_average?: number
    vote_count?: number
    genres?: { id: number; name: string }[]
    number_of_seasons?: number
    number_of_episodes?: number
    status?: string
    episode_run_time?: number[]
    seasons?: { season_number: number; episode_count: number; air_date?: string }[]
    images?: { logos?: { file_path: string; language?: string }[]; backdrops?: any[] }
    videos?: {
        results: {
            id: string
            key: string
            name: string
            site: string
            type: string
            official: boolean
        }[]
    }
}> => {
    const res = await tmdbProxy(`/tv/${id}`)
    return res.json()
}
export const imageUrlOriginal = (path: string | null | undefined): string | null => {
    if (!path) return null
    return `${IMAGE_BASE_ORIGINAL}/original`
}


export const getBestBackdropPath = (backdrops: any[] | undefined | null): string | null => {
    if (!backdrops || backdrops.length === 0) return null
    const english = backdrops.find(b => b.iso_639_1 === 'en')
    return english?.file_path ?? backdrops[0]?.file_path ?? null
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




export const discoverMovies = async (options: { page?: number; sort_by?: string; with_genres?: string; primary_release_year?: number; vote_count_gte?: number } = {}): Promise<{ results: TMDBResult[] }> => {
    const params = new URLSearchParams()
    if (options.page) params.set('page', String(options.page))
    if (options.sort_by) params.set('sort_by', options.sort_by)
    if (options.with_genres) params.set('with_genres', options.with_genres)
    if (options.primary_release_year) params.set('primary_release_year', String(options.primary_release_year))
    if (options.vote_count_gte) params.set('vote_count.gte', String(options.vote_count_gte))
    const res = await tmdbProxy(`/discover/movie?${params.toString()}`)
    return res.json()
}

export const discoverTV = async (options: { page?: number; sort_by?: string; with_genres?: string; first_air_date_year?: number; vote_count_gte?: number } = {}): Promise<{ results: TMDBResult[] }> => {
    const params = new URLSearchParams()
    if (options.page) params.set('page', String(options.page))
    if (options.sort_by) params.set('sort_by', options.sort_by)
    if (options.with_genres) params.set('with_genres', options.with_genres)
    if (options.first_air_date_year) params.set('first_air_date_year', String(options.first_air_date_year))
    if (options.vote_count_gte) params.set('vote_count.gte', String(options.vote_count_gte))
    const res = await tmdbProxy(`/discover/tv?${params.toString()}`)
    return res.json()
}

export const getGenres = async (type: 'movie' | 'tv'): Promise<{ genres: { id: number; name: string }[] }> => {
    const path = type === 'movie' ? '/genre/movie/list' : '/genre/tv/list'
    const res = await tmdbProxy(path)
    const data = await res.json()
    return data
}







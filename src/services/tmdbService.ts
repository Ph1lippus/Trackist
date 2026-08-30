import type { TMDBResult } from '../types'


const IMAGE_BASE = 'https://image.tmdb.org/t/p'

export const imageUrl = (path: string | null | undefined, size: string = 'w500'): string | null => {
    if (!path) return null
    return `${IMAGE_BASE}/${size}${path}`
}

export const getBackdropUrl = (path: string | null | undefined, size: string = 'w1280'): string | null => {
    if (!path) return null
    return `${IMAGE_BASE}/${size}${path}`
}


export const imageUrlOriginal = (path: string | null | undefined): string | null => {
    if (!path) return null
    return `${IMAGE_BASE}/original${path}`
}


const ALLOWED_TMDB_PATHS = ['/search/', '/person/', '/movie/', '/tv/', '/trending/', '/discover/', '/genre/'] as const

function isAllowedPath(path: string): boolean {
    const basePath = path.split('?')[0]
    const allowed = ALLOWED_TMDB_PATHS.some(prefix => basePath.startsWith(prefix))
    if (!allowed) {
        console.warn('[tmdbProxy] Blocked path:', path, 'basePath:', basePath, 'allowedPrefixes:', ALLOWED_TMDB_PATHS)
    }
    return allowed
}

// Simple in-memory cache for TMDB API responses
const tmdbCache = new Map<string, { data: any; expiry: number }>()
const TMDB_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function tmdbProxy(path: string): Promise<Response> {
    if (!path.startsWith('/')) {
        throw new Error(`Invalid TMDB path: ${path}`)
    }
    if (!isAllowedPath(path)) {
        throw new Error(`TMDB path not allowed: ${path}`)
    }
    
    // Check cache first
    const cacheKey = path
    const cached = tmdbCache.get(cacheKey)
    const now = Date.now()
    
    if (cached && now < cached.expiry) {
        return new Response(JSON.stringify(cached.data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })
    }
    
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tmdb-proxy?path=${encodeURIComponent(path)}&_t=${Date.now()}`
    const res = await fetch(url)
    
    // Cache successful responses
    if (res.ok) {
        try {
            const data = await res.clone().json()
            tmdbCache.set(cacheKey, { data, expiry: now + TMDB_CACHE_TTL })
        } catch (e) {
            // Ignore cache errors
        }
    }
    
    return res
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
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
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
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getPopularMovies = async (page: number = 1, vote_count_gte?: number): Promise<{ results: TMDBResult[] }> => {
    const path = vote_count_gte
        ? `/movie/popular?page=${page}&vote_count.gte=${vote_count_gte}`
        : `/movie/popular?page=${page}`
    const res = await tmdbProxy(path)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getPopularTVShows = async (page: number = 1, vote_count_gte?: number): Promise<{ results: TMDBResult[] }> => {
    const path = vote_count_gte
        ? `/tv/popular?page=${page}&vote_count.gte=${vote_count_gte}`
        : `/tv/popular?page=${page}`
    const res = await tmdbProxy(path)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getTrending = async (timeWindow: 'day' | 'week' = 'day'): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/trending/all/${timeWindow}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getTopRatedMovies = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/movie/top_rated?page=${page}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getTopRatedTVShows = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/tv/top_rated?page=${page}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
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
    images?: { logos?: { file_path: string; language?: string }[]; backdrops?: any[]; posters?: any[] }
    external_ids?: { imdb_id?: string }
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
    const res = await tmdbProxy(`/movie/${id}?append_to_response=images,external_ids,credits,videos,release_dates`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
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
    seasons?: { season_number: number; episode_count: number; air_date?: string }[]
    status?: string
    episode_run_time?: number[]
    production_companies?: { id: number; name: string; logo_path?: string | null; origin_country?: string }[]
    images?: { logos?: { file_path: string; language?: string }[]; backdrops?: any[]; posters?: any[] }
    external_ids?: { imdb_id?: string }
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
    credits?: {
        cast: {
            id: number
            name: string
            character: string
            profile_path?: string | null
            order: number
        }[]
    }
}> => {
    const res = await tmdbProxy(`/tv/${id}?append_to_response=images,external_ids,credits,videos,content_ratings`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getTVDetails = getTVShowDetails
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
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
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
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getSimilarMovies = async (id: number, page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/movie/${id}/similar?page=${page}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getSimilarTVShows = async (id: number, page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/tv/${id}/similar?page=${page}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
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
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getWatchProviders = async (id: number, mediaType: 'movie' | 'tv'): Promise<{
    results?: {
        flatrate?: { provider_id: number; provider_name: string; logo_path?: string | null }[]
    }[]
}> => {
    const res = await tmdbProxy(`/${mediaType}/${id}/watch/providers`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getExternalIds = async (id: number, mediaType: 'movie' | 'tv'): Promise<{
    imdb_id?: string
    facebook_id?: string
    instagram_id?: string
    twitter_id?: string
}> => {
    const res = await tmdbProxy(`/${mediaType}/${id}/external_ids`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}


const isNoLanguageCode = (value?: string | null): boolean => {
    return value == null || value === '' || value === 'xx' || value === 'und'
}

export const getBestBackdropPath = (backdrops: any[] | undefined | null): string | null => {
    if (!backdrops || backdrops.length === 0) return null
    
    const candidates = backdrops
        .filter(b => isNoLanguageCode(b.iso_639_1))
        .sort((a, b) => {
            const aVote = a.vote_average ?? 0
            const bVote = b.vote_average ?? 0
            if (bVote !== aVote) return bVote - aVote
            
            const aCount = a.vote_count ?? 0
            const bCount = b.vote_count ?? 0
            if (bCount !== aCount) return bCount - aCount
            
            return (b.width ?? 0) - (a.width ?? 0)
        })
    
    return candidates[0]?.file_path ?? null
}

/**
 * Best poster for hero backgrounds: highest-rated poster with no language
 * (iso_639_1 null/empty/xx/und), mirroring getBestBackdropPath. Returns null so callers
 * fall through to the backdrop logic when only language posters exist.
 */
export const getBestPoster = (posters: any[] | undefined | null): string | null => {
    if (!posters || posters.length === 0) return null

    const candidates = posters
        .filter(p => isNoLanguageCode(p.iso_639_1))
        .sort((a, b) => {
            const aVote = a.vote_average ?? 0
            const bVote = b.vote_average ?? 0
            if (bVote !== aVote) return bVote - aVote

            const aCount = a.vote_count ?? 0
            const bCount = b.vote_count ?? 0
            if (bCount !== aCount) return bCount - aCount

            return (b.height ?? 0) - (a.height ?? 0)
        })

    return candidates[0]?.file_path ?? null
}






export const getPersonMovies = async (id: number): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/person/${id}/movie_credits`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}


export const getPersonTV = async (id: number): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/person/${id}/tv_credits`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}


export const getPopularPeople = async (page: number = 1): Promise<{ results: TMDBResult[] }> => {
    const res = await tmdbProxy(`/person/popular?page=${page}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}




export const discoverMovies = async (options: { page?: number; sort_by?: string; with_genres?: string; primary_release_date_gte?: string; primary_release_date_lte?: string; vote_count_gte?: number } = {}): Promise<{ results: TMDBResult[] }> => {
    const params = new URLSearchParams()
    if (options.page) params.set('page', String(options.page))
    if (options.sort_by) params.set('sort_by', options.sort_by)
    if (options.with_genres) params.set('with_genres', options.with_genres)
    if (options.primary_release_date_gte) params.set('primary_release_date.gte', options.primary_release_date_gte)
    if (options.primary_release_date_lte) params.set('primary_release_date.lte', options.primary_release_date_lte)
    if (options.vote_count_gte) params.set('vote_count.gte', String(options.vote_count_gte))
    const res = await tmdbProxy(`/discover/movie?${params.toString()}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const discoverTV = async (options: { page?: number; sort_by?: string; with_genres?: string; first_air_date_gte?: string; first_air_date_lte?: string; vote_count_gte?: number } = {}): Promise<{ results: TMDBResult[] }> => {
    const params = new URLSearchParams()
    if (options.page) params.set('page', String(options.page))
    if (options.sort_by) params.set('sort_by', options.sort_by)
    if (options.with_genres) params.set('with_genres', options.with_genres)
    if (options.first_air_date_gte) params.set('first_air_date.gte', options.first_air_date_gte)
    if (options.first_air_date_lte) params.set('first_air_date.lte', options.first_air_date_lte)
    if (options.vote_count_gte) params.set('vote_count.gte', String(options.vote_count_gte))
    const res = await tmdbProxy(`/discover/tv?${params.toString()}`)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export const getGenres = async (type: 'movie' | 'tv'): Promise<{ genres: { id: number; name: string }[] }> => {
    const path = type === 'movie' ? '/genre/movie/list' : '/genre/tv/list'
    const res = await tmdbProxy(path)
    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}







export interface TMDBResult {
    id: number
    title?: string
    name?: string
    media_type?: 'movie' | 'tv' | 'person' | 'anime'
    poster_path?: string | null
    backdrop_path?: string | null
    profile_path?: string | null
    overview?: string
    release_date?: string
    first_air_date?: string
    vote_average?: number
    genres?: Array<{ id: number; name: string }>
    credits?: {
        cast?: Array<{ id: number; name: string; profile_path?: string; character?: string }>
    }
    aggregate_credits?: {
        cast?: Array<{ id: number; name: string; profile_path?: string }>
    }
    runtime?: number
    episodes?: number
    number_of_episodes?: number
    seasons?: Array<{ season_number: number; episode_count?: number }>
    number_of_seasons?: number
    status?: string
    known_for?: TMDBResult[]
    known_for_department?: string
    biography?: string
    birthday?: string
    place_of_birth?: string
    popularity?: number
    gender?: number
    images?: {
        logos?: Array<{ file_path: string }>
    }
    release_dates?: {
        results?: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string }> }>
    }
    videos?: {
        results?: Array<{ type: string; site: string; key: string }>
    }
    'watch/providers'?: {
        results?: Array<{ iso_3166_1: string; flatrate?: Array<{ logo_path: string }>; buy?: Array<{ logo_path: string }>; rent?: Array<{ logo_path: string }> }>
    }
    content_ratings?: {
        results?: Array<{ iso_3166_1: string; rating: string }>
    }
}

export interface WatchlistItem {
    id: string
    user_id: string
    media_type: 'movie' | 'tv' | 'anime'
    tmdb_id?: number
    anilist_id?: number
    title: string
    poster_path?: string
    overview?: string
    release_date?: string
    vote_average?: number
    total_seasons?: number
    total_episodes?: number
    current_season?: number
    current_episode?: number
    status: 'planning' | 'watching' | 'completed' | 'dropped'
    rating?: number
    notes?: string
    added_at: string
    updated_at: string
    started_watching_at?: string
    completed_at?: string
    last_watched_at?: string
    next_episode_to_watch?: {
        season_number: number
        episode_number: number
    }
    has_new_episodes?: boolean
}

export interface WatchlistEpisode {
    id: string
    watchlist_id: string
    season_number: number
    episode_number: number
    tmdb_episode_id?: number
    anilist_episode_id?: number
    title?: string
    still_path?: string
    overview?: string
    vote_average?: number
    air_date?: string
    runtime?: number
    watched: boolean
    watched_at?: string
    user_rating?: number
    notes?: string
    created_at: string
    updated_at: string
}

export interface UserList {
    id: string
    user_id: string
    title: string
    description?: string
    is_public: boolean
    completed_at?: string
    created_at: string
    updated_at: string
}

export interface ListItem {
    id: string
    list_id: string
    media_type: 'movie' | 'tv' | 'anime'
    tmdb_id: number
    anilist_id?: number
    title: string
    poster_path?: string
    overview?: string
    release_date?: string
    vote_average?: number
    added_at: string
    watched_at?: string
}


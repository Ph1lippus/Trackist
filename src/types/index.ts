export interface TMDBResult {
    id: number
    title?: string
    name?: string
    media_type?: 'movie' | 'tv' | 'person' | 'anime'
    poster_path?: string | null
    overview?: string
    release_date?: string
    first_air_date?: string
    vote_average?: number
    genres?: Array<{ id: number; name: string }>
    credits?: {
        cast?: Array<{ id: number; name: string; profile_path?: string }>
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


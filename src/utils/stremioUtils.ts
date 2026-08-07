/**
 * Stremio deep link utilities
 * Functions to construct and handle Stremio app deep links
 * Uses the correct strem.io sharing format with IMDB IDs
 */

/**
 * Creates a Stremio sharing link for a movie
 * @param tmdbId - The TMDB ID of the movie (fallback)
 * @param imdbId - The IMDB ID of the movie (preferred)
 * @returns The sharing URL
 */
export const createMovieDeepLink = (tmdbId: number, imdbId?: string): string => {
    if (imdbId) {
        const cleanImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`
        return `stremio:///detail/movie/${cleanImdb}`
    }
    return `stremio:///detail/movie/tmdb/${tmdbId}`
}

/**
 * Creates a Stremio sharing link for a TV show
 * @param tmdbId - The TMDB ID of the TV show (fallback)
 * @param imdbId - The IMDB ID of the TV show (preferred)
 * @returns The sharing URL
 */
export const createTVDeepLink = (tmdbId: number, imdbId?: string): string => {
    if (imdbId) {
        const cleanImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`
        return `stremio:///detail/series/${cleanImdb}`
    }
    return `stremio:///detail/series/tmdb/${tmdbId}`
}

/**
 * Creates a Stremio sharing link for a specific episode
 * @param tmdbId - The TMDB ID of the TV show (fallback)
 * @param season - The season number
 * @param episode - The episode number
 * @param imdbId - The IMDB ID of the TV show (preferred)
 * @returns The sharing URL
 */
export const createEpisodeDeepLink = (tmdbId: number, season: number, episode: number, imdbId?: string): string => {
    if (imdbId) {
        const cleanImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`
        return `stremio:///detail/series/${cleanImdb}/${cleanImdb}:${season}:${episode}`
    }
    return `stremio:///detail/series/tmdb/${tmdbId}/tmdb/${tmdbId}:${season}:${episode}`
}

/**
 * Opens a Stremio sharing link
 * @param url - The sharing URL to open
 */
export const openInStremio = (url: string) => {
    if (!url) return

    window.location.href = url
}
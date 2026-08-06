/**
 * Stremio deep link utilities
 * Functions to construct and handle Stremio app deep links
 * Uses the correct strem.io sharing format
 */

/**
 * Sanitizes a title for use in Stremio URLs
 * @param title - The title to sanitize
 * @returns The sanitized title
 */
const sanitizeTitle = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    || 'unknown'
}

/**
 * Creates a Stremio sharing link for a movie
 * @param tmdbId - The TMDB ID of the movie
 * @param title - The title of the movie (for the URL)
 * @returns The sharing URL
 */
export const createMovieDeepLink = (tmdbId: number, title?: string): string => {
  const safeTitle = title ? sanitizeTitle(title) : 'movie'
  return `https://www.strem.io/s/movie/${safeTitle}-${tmdbId}`
}

/**
 * Creates a Stremio sharing link for a TV show
 * @param tmdbId - The TMDB ID of the TV show
 * @param title - The title of the TV show (for the URL)
 * @returns The sharing URL
 */
export const createTVShowDeepLink = (tmdbId: number, title?: string): string => {
  const safeTitle = title ? sanitizeTitle(title) : 'series'
  return `https://www.strem.io/s/series/${safeTitle}-${tmdbId}`
}

/**
 * Creates a Stremio sharing link for a specific episode
 * @param tmdbId - The TMDB ID of the TV show
 * @param title - The title of the TV show (for the URL)
 * @param season - The season number
 * @param episode - The episode number
 * @returns The sharing URL
 */
export const createEpisodeDeepLink = (tmdbId: number, season: number, episode: number, title?: string): string => {
  const safeTitle = title ? sanitizeTitle(title) : 'series'
  return `https://www.strem.io/s/series/${safeTitle}-${tmdbId}:${season}:${episode}`
}

/**
 * Opens a Stremio sharing link
 * @param sharingLink - The sharing URL to open
 */
export const openInStremio = (sharingLink: string): void => {
  window.open(sharingLink, '_blank')
}
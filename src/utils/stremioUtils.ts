/**
 * Stremio deep link utilities
 * Functions to construct and handle Stremio app deep links
 * Uses the correct strem.io sharing format with IMDB IDs
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
 * Extracts numeric ID from IMDB ID (removes 'tt' prefix if present)
 * @param imdbId - The IMDB ID (with or without 'tt' prefix)
 * @returns The numeric ID
 */
const extractImdbId = (imdbId?: string): string => {
  if (!imdbId) return ''
  return imdbId.replace(/^tt/, '')
}

/**
 * Creates a Stremio sharing link for a movie
 * @param tmdbId - The TMDB ID of the movie (fallback)
 * @param imdbId - The IMDB ID of the movie (preferred)
 * @param title - The title of the movie (for the URL)
 * @returns The sharing URL
 */
export const createMovieDeepLink = (tmdbId: number, imdbId?: string, title?: string): string => {
  const safeTitle = title ? sanitizeTitle(title) : 'movie'
  const id = imdbId ? extractImdbId(imdbId) : tmdbId.toString()
  return `https://www.strem.io/s/movie/${safeTitle}-${id}`
}

/**
 * Creates a Stremio sharing link for a TV show
 * @param tmdbId - The TMDB ID of the TV show (fallback)
 * @param imdbId - The IMDB ID of the TV show (preferred)
 * @param title - The title of the TV show (for the URL)
 * @returns The sharing URL
 */
export const createTVShowDeepLink = (tmdbId: number, imdbId?: string, title?: string): string => {
  const safeTitle = title ? sanitizeTitle(title) : 'series'
  const id = imdbId ? extractImdbId(imdbId) : tmdbId.toString()
  return `https://www.strem.io/s/series/${safeTitle}-${id}`
}

/**
 * Creates a Stremio sharing link for a specific episode
 * @param tmdbId - The TMDB ID of the TV show (fallback)
 * @param imdbId - The IMDB ID of the TV show (preferred)
 * @param season - The season number
 * @param episode - The episode number
 * @param title - The title of the TV show (for the URL)
 * @returns The sharing URL
 */
export const createEpisodeDeepLink = (tmdbId: number, season: number, episode: number, imdbId?: string, title?: string): string => {
  const safeTitle = title ? sanitizeTitle(title) : 'series'
  const id = imdbId ? extractImdbId(imdbId) : tmdbId.toString()
  return `https://www.strem.io/s/series/${safeTitle}-${id}:${season}:${episode}`
}

/**
 * Opens a Stremio sharing link
 * @param sharingLink - The sharing URL to open
 */
export const openInStremio = (sharingLink: string): void => {
  window.open(sharingLink, '_blank')
}
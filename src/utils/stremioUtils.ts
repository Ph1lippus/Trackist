/**
 * Stremio deep link utilities
 * Functions to construct and handle Stremio app deep links
 */

/**
 * Creates a Stremio deep link for a movie
 * @param tmdbId - The TMDB ID of the movie
 * @returns The deep link URL
 */
export const createMovieDeepLink = (tmdbId: number): string => {
  return `stremio://detail/movie/tmdb:${tmdbId}`
}

/**
 * Creates a Stremio deep link for a TV show
 * @param tmdbId - The TMDB ID of the TV show
 * @returns The deep link URL
 */
export const createTVShowDeepLink = (tmdbId: number): string => {
  return `stremio://detail/series/tmdb:${tmdbId}`
}

/**
 * Creates a Stremio deep link for a specific episode
 * @param tmdbId - The TMDB ID of the TV show
 * @param season - The season number
 * @param episode - The episode number
 * @returns The deep link URL
 */
export const createEpisodeDeepLink = (tmdbId: number, season: number, episode: number): string => {
  return `stremio://detail/series/tmdb:${tmdbId}:${season}:${episode}`
}

/**
 * Opens a Stremio deep link with fallback to web version
 * @param deepLink - The deep link URL to open
 * @param webFallback - The web URL to use as fallback (optional)
 */
export const openInStremio = (deepLink: string, webFallback?: string): void => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  
  try {
    // Try to open the deep link
    window.location.href = deepLink
    
    // If on mobile and we have a fallback, set a timeout to try the web version
    if (isMobile && webFallback) {
      setTimeout(() => {
        // If the deep link didn't work, open the web version
        window.open(webFallback, '_blank')
      }, 2000)
    }
  } catch (error) {
    console.error('Failed to open Stremio link:', error)
    
    // Fallback to web version if available
    if (webFallback) {
      window.open(webFallback, '_blank')
    }
  }
}

/**
 * Creates a web fallback URL for Stremio
 * @param type - 'movie' or 'series'
 * @param tmdbId - The TMDB ID
 * @param season - Optional season number for series
 * @param episode - Optional episode number for series
 * @returns The web URL
 */
export const createStremioWebUrl = (
  type: 'movie' | 'series',
  tmdbId: number,
  season?: number,
  episode?: number
): string => {
  const baseUrl = 'https://web.stremio.com'
  
  if (type === 'movie') {
    return `${baseUrl}/#/detail/movie/tmdb:${tmdbId}`
  } else if (type === 'series') {
    if (season !== undefined && episode !== undefined) {
      return `${baseUrl}/#/detail/series/tmdb:${tmdbId}:${season}:${episode}`
    }
    return `${baseUrl}/#/detail/series/tmdb:${tmdbId}`
  }
  
  return baseUrl
}
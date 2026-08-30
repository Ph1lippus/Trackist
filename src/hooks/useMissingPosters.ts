import { useEffect, useState, useRef } from 'react'
import { getMovieDetails, getTVShowDetails, getBestPoster } from '../services/tmdbService'

interface PosterCandidate {
    tmdb_id?: number | null
    media_type?: string | null
    poster_path?: string | null
}

const MAX_LOOKUPS_PER_MOUNT = 40

export const useMissingPosters = (items: PosterCandidate[]): Record<number, string | null> => {
    const [posters, setPosters] = useState<Record<number, string | null>>({})
    const inFlight = useRef<Set<number>>(new Set())

    useEffect(() => {
        const missing = new Map<number, string>()
        for (const item of items) {
            if (!item.tmdb_id || item.poster_path) continue
            if (inFlight.current.has(item.tmdb_id)) continue
            if (!missing.has(item.tmdb_id)) {
                missing.set(item.tmdb_id, item.media_type || '')
            }
        }

        if (missing.size === 0) return

        let launched = 0
        missing.forEach(async (mediaType, id) => {
            if (launched >= MAX_LOOKUPS_PER_MOUNT) return
            launched++
            inFlight.current.add(id)

            let resolved: string | null = null
            try {
                if (mediaType === 'tv' || mediaType === 'anime') {
                    const details = await getTVShowDetails(id)
                    resolved = getBestPoster(details?.images?.posters) || details?.poster_path || null
                } else {
                    const details = await getMovieDetails(id)
                    resolved = getBestPoster(details?.images?.posters) || details?.poster_path || null
                }
            } catch (error) {
                console.error('Failed to resolve missing poster:', id, error)
            }
            setPosters(prev => ({ ...prev, [id]: resolved }))
        })
    }, [items])

    return posters
}
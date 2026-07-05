const ANILIST_API = 'https://graphql.anilist.co'

const SEARCH_QUERY = `
query ($query: String) {
    Page(page: 1, perPage: 20) {
        media(search: $query, type: ANIME) {
            id
            title {
                romaji
                english
                native
            }
            coverImage {
                large
            }
            description
            episodes
            status
            startDate { year }
            averageScore
            genres
        }
    }
}
`

export interface AnilistResult {
    id: number
    title: {
        romaji: string
        english: string | null
        native: string | null
    }
    coverImage?: {
        large?: string
    }
    description?: string
    episodes: number | null
    status: string
    startDate?: { year: number | null }
    averageScore: number | null
    genres: string[]
}

export const searchAnime = async (query: string): Promise<AnilistResult[]> => {
    const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            query: SEARCH_QUERY,
            variables: { query }
        })
    })

    const data = await response.json()
    return data?.data?.Page?.media || []
}

const POPULAR_QUERY = `
query {
    Page(page: 1, perPage: 20) {
        media(type: ANIME, sort: POPULARITY_DESC) {
            id
            title {
                romaji
                english
                native
            }
            coverImage {
                large
            }
            description
            episodes
            status
            startDate { year }
            averageScore
            genres
        }
    }
}
`

export const getPopularAnime = async (): Promise<AnilistResult[]> => {
    const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            query: POPULAR_QUERY
        })
    })

    const data = await response.json()
    return data?.data?.Page?.media || []
}

export const getAnilistImageUrl = (url: string | null) => {
    if (!url) return null
    return url.replace('medium', 'large')
}
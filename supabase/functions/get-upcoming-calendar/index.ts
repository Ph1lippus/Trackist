 import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const WATCHLIST_PAGE_SIZE = 1000
const TMDB_CONCURRENCY = 6

if (!TMDB_API_KEY) {
  throw new Error('TMDB_API_KEY is not set')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

interface TVShowRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  last_season_number?: number | null
}

interface MovieRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  release_date?: string | null
}

interface TMDBEpisode {
  id: number
  episode_number: number
  name?: string
  air_date?: string | null
  still_path?: string | null
}

interface TMDBSeasonResponse {
  episodes?: TMDBEpisode[]
}

interface CalendarItem {
  id: string
  media_type: 'tv' | 'movie'
  tmdb_id: number
  watchlist_id: string
  title: string
  poster_path: string | null
  air_date?: string
  release_date?: string
  season_number?: number
  episode_number?: number
  episode_title?: string
  still_path?: string | null
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function fetchAllRows<T>(query: any): Promise<T[]> {
  const rows: T[] = []
  let page = 0

  while (true) {
    const { data, error } = await query
      .range(page * WATCHLIST_PAGE_SIZE, (page + 1) * WATCHLIST_PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data as T[])
    if (data.length < WATCHLIST_PAGE_SIZE) break
    page++
  }

  return rows
}

async function mapWithConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= values.length) return
      results[index] = await worker(values[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker())
  )
  return results
}

const getUTCDateString = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are not set')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const todayStr = getUTCDateString(new Date())

    // Fetch the complete user watchlist in pages. Anime is intentionally not included.
    const [tvShows, movies] = await Promise.all([
      fetchAllRows<TVShowRow>(
        supabase
          .from('watchlist')
          .select('id, tmdb_id, title, poster_path, last_season_number')
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .order('updated_at', { ascending: false })
      ),
      fetchAllRows<MovieRow>(
        supabase
          .from('watchlist')
          .select('id, tmdb_id, title, poster_path, release_date')
          .eq('user_id', userId)
          .eq('media_type', 'movie')
          .gte('release_date', todayStr)
          .order('release_date', { ascending: true })
      ),
    ])

    // Watched episodes are deliberately not queried. Upcoming data is date-based and
    // past entries naturally disappear on the next day, keeping this request fast.
    const seasonResults = await mapWithConcurrency(
      tvShows,
      async (show): Promise<{ show: TVShowRow; seasonNumber: number; episodes: TMDBEpisode[] }> => {
        const seasonNumber = show.last_season_number && show.last_season_number > 0
          ? show.last_season_number
          : 1

        if (!show.tmdb_id) return { show, seasonNumber, episodes: [] }

        try {
          const data = await fetchJSON<TMDBSeasonResponse>(
            `${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
          )
          return { show, seasonNumber, episodes: data.episodes || [] }
        } catch (error) {
          console.error(`Failed to fetch season ${seasonNumber} for ${show.title}:`, error)
          return { show, seasonNumber, episodes: [] }
        }
      },
      TMDB_CONCURRENCY
    )

    const upcoming: CalendarItem[] = []

    for (const { show, seasonNumber, episodes } of seasonResults) {
      if (!show.tmdb_id) continue

      for (const episode of episodes) {
        // Include today's items and future items. Items naturally age out tomorrow.
        if (!episode.air_date || episode.air_date < todayStr) continue

        upcoming.push({
          id: `${show.id}-${seasonNumber}-${episode.episode_number}`,
          media_type: 'tv',
          tmdb_id: show.tmdb_id,
          watchlist_id: show.id,
          title: show.title,
          poster_path: show.poster_path,
          air_date: episode.air_date,
          season_number: seasonNumber,
          episode_number: episode.episode_number,
          episode_title: episode.name,
          still_path: episode.still_path,
        })
      }
    }

    for (const movie of movies) {
      if (!movie.tmdb_id || !movie.release_date || movie.release_date < todayStr) continue

      upcoming.push({
        id: movie.id,
        media_type: 'movie',
        tmdb_id: movie.tmdb_id,
        watchlist_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date,
      })
    }

    const uniqueUpcoming = Array.from(
      new Map(upcoming.map(item => [item.id, item])).values()
    )

    uniqueUpcoming.sort((a, b) => {
      const dateA = a.media_type === 'tv' ? (a.air_date || '') : (a.release_date || '')
      const dateB = b.media_type === 'tv' ? (b.air_date || '') : (b.release_date || '')
      const dateDifference = dateA.localeCompare(dateB)
      if (dateDifference !== 0) return dateDifference
      if (a.media_type !== b.media_type) return a.media_type === 'movie' ? -1 : 1
      return a.title.localeCompare(b.title)
    })

    return new Response(JSON.stringify({ upcoming: uniqueUpcoming }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
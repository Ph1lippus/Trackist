import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

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

interface TMDBSessionResponse {
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
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB request failed with status ${res.status}`)
  return res.json() as Promise<T>
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400, headers: corsHeaders })
    }

    // Create Supabase admin client (READ-ONLY — we never write to the database)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ─── Step A: Fetch tracked TMDB IDs (TV + upcoming movies concurrently) ───
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const [tvResult, movieResult] = await Promise.all([
      supabase
        .from('watchlist')
        .select('id, tmdb_id, title, poster_path, last_season_number')
        .eq('user_id', userId)
        .eq('media_type', 'tv'),
      supabase
        .from('watchlist')
        .select('id, tmdb_id, title, poster_path, release_date')
        .eq('user_id', userId)
        .eq('media_type', 'movie')
        .gte('release_date', todayStr)
    ])

    if (tvResult.error || movieResult.error) {
      return new Response(
        JSON.stringify({ error: tvResult.error?.message || movieResult.error?.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    const tvShows = (tvResult.data || []) as TVShowRow[]
    const movies = (movieResult.data || []) as MovieRow[]

    // Build a set of watched episodes (watchlist_id-season-episode) so we can
    // exclude already-watched episodes from the calendar.
    const watchedKeys = new Set<string>()
    const watchlistIds = tvShows.map(s => s.id)
    if (watchlistIds.length > 0) {
      const { data: watchedEpisodes, error: watchedError } = await supabase
        .from('watchlist_episodes')
        .select('watchlist_id, season_number, episode_number')
        .in('watchlist_id', watchlistIds)

      if (!watchedError && watchedEpisodes) {
        for (const ep of watchedEpisodes) {
          watchedKeys.add(`${ep.watchlist_id}-${ep.season_number}-${ep.episode_number}`)
        }
      }
    }

    // ─── Step B: Concurrently fetch all season schedules from TMDB ────────────
    // Promise.all fires every request simultaneously — no slow sequential loops,
    // no setTimeout delays.
    const seasonResults = await Promise.all(
      tvShows.map(async (show): Promise<{ show: TVShowRow; seasonNumber: number; episodes: TMDBEpisode[] }> => {
        const seasonNumber = show.last_season_number && show.last_season_number > 0 ? show.last_season_number : 1
        if (!show.tmdb_id) return { show, seasonNumber, episodes: [] }

        try {
          const { episodes } = await fetchJSON<TMDBSessionResponse>(
            `${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
          )
          return { show, seasonNumber, episodes: episodes || [] }
        } catch (err) {
          console.error(`Failed to fetch season ${seasonNumber} for ${show.title}:`, err)
          return { show, seasonNumber, episodes: [] }
        }
      })
    )

    // ─── Step C: Filter in memory — keep ONLY air_date >= today, unwatched ────
    const upcoming: CalendarItem[] = []

    for (const { show, seasonNumber, episodes } of seasonResults) {
      if (!show.tmdb_id) continue

      for (const ep of episodes) {
        if (!ep.air_date || ep.air_date < todayStr) continue
        if (watchedKeys.has(`${show.id}-${seasonNumber}-${ep.episode_number}`)) continue

        upcoming.push({
          id: `${show.id}-${seasonNumber}-${ep.episode_number}`,
          media_type: 'tv',
          tmdb_id: show.tmdb_id,
          watchlist_id: show.id,
          title: show.title,
          poster_path: show.poster_path,
          air_date: ep.air_date,
          season_number: seasonNumber,
          episode_number: ep.episode_number,
          episode_title: ep.name,
          still_path: ep.still_path
        })
      }
    }

    for (const movie of movies) {
      if (!movie.tmdb_id || !movie.release_date) continue
      upcoming.push({
        id: movie.id,
        media_type: 'movie',
        tmdb_id: movie.tmdb_id,
        watchlist_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date
      })
    }

    // Sort by date ascending (closest first)
    upcoming.sort((a, b) => {
      const dateA = a.media_type === 'tv' ? (a.air_date || '') : (a.release_date || '')
      const dateB = b.media_type === 'tv' ? (b.air_date || '') : (b.release_date || '')
      return dateA.localeCompare(dateB)
    })

    // ─── Step D: Return compressed JSON — NO database writes ─────────────────
    return new Response(
      JSON.stringify({ upcoming }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
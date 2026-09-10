 import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

 const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
 const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
 const TVMAZE_BASE_URL = 'https://api.tvmaze.com'
const WATCHLIST_PAGE_SIZE = 1000
  const TVMAZE_CONCURRENCY = 6
  const TVMAZE_MAX_RETRIES = 3
  const TVMAZE_RETRY_DELAYS_MS = [1000, 2500, 5000]

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
   digital_release_date?: string | null
 }

 interface TVMazeEpisode {
   season: number
   episode: number
   name?: string
   airstamp: string | null
   still_path?: string | null
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
   release_type?: 'theatrical' | 'digital'
   airstamp?: string
   season_number?: number
   episode_number?: number
   episode_title?: string
   still_path?: string | null
 }

 async function fetchJSON<T>(url: string): Promise<T> {
   const response = await fetch(url)
   if (!response.ok) {
     throw new Error(`Request failed with status ${response.status}`)
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

 async function getTMDBExternalIds(tmdbId: number): Promise<{ imdb_id?: string } | null> {
   try {
     const data = await fetchJSON<{ imdb_id?: string }>(
       `${TMDB_BASE_URL}/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
     )
     return data
   } catch {
     return null
   }
 }

  async function fetchTVMazeJson(url: string): Promise<Response | null> {
    for (let attempt = 0; attempt <= TVMAZE_MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url)
        if (res.status === 429) {
          if (attempt < TVMAZE_MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, TVMAZE_RETRY_DELAYS_MS[attempt]))
            continue
          }
          console.warn('[TVMaze] rate limited after retries', url)
          return null
        }
        return res.ok ? res : null
      } catch {
        if (attempt < TVMAZE_MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, TVMAZE_RETRY_DELAYS_MS[attempt]))
          continue
        }
        console.warn('[TVMaze] request failed after retries', url)
        return null
      }
    }
    return null
  }

  async function fetchTVMazeSchedule(tmdbId: number): Promise<TVMazeEpisode[]> {
    const external = await getTMDBExternalIds(tmdbId)
    if (!external?.imdb_id) return []

    const look = await fetchTVMazeJson(`${TVMAZE_BASE_URL}/lookup/shows?imdb=${external.imdb_id}`)
    if (!look) {
      console.warn('[TVMaze] lookup failed', tmdbId)
      return []
    }
    const show = (await look.json()) as { id?: number }
    if (!show.id) return []

    const res = await fetchTVMazeJson(`${TVMAZE_BASE_URL}/shows/${show.id}/episodes`)
    if (!res) {
      console.warn('[TVMaze] episodes fetch failed', tmdbId)
      return []
    }
   const entries = (await res.json()) as {
     season?: number
     number?: number | null
     name?: string | null
     airstamp?: string | null
     image?: { medium?: string | null; original?: string | null } | null
   }[]

   // Skip specials: TVmaze lists them as season 0 with number null, which
   // would otherwise surface as S0E0 items on the calendar.
   return entries
     .filter(entry => (entry.season ?? 0) > 0 && (entry.number ?? 0) > 0)
     .map(entry => ({
       season: entry.season ?? 0,
       episode: entry.number ?? 0,
       name: entry.name ?? undefined,
       airstamp: entry.airstamp ?? null,
       still_path: entry.image?.original ?? entry.image?.medium ?? null,
     }))
 }

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
            .select('id, tmdb_id, title, poster_path, release_date, digital_release_date')
            .eq('user_id', userId)
            .eq('media_type', 'movie')
            .or(`release_date.gte.${todayStr},digital_release_date.gte.${todayStr}`)
            .order('release_date', { ascending: true })
        ),
     ])

     const scheduleResults = await mapWithConcurrency(
       tvShows,
       async (show): Promise<{ show: TVShowRow; episodes: TVMazeEpisode[] }> => {
         if (!show.tmdb_id) return { show, episodes: [] }

         try {
           const episodes = await fetchTVMazeSchedule(show.tmdb_id)
           return { show, episodes }
         } catch (error) {
           console.error(`Failed to fetch TVMaze schedule for ${show.title}:`, error)
           return { show, episodes: [] }
         }
       },
       TVMAZE_CONCURRENCY
     )

     const upcoming: CalendarItem[] = []

     for (const { show, episodes } of scheduleResults) {
       if (!show.tmdb_id) continue

       for (const episode of episodes) {
         if (!episode.airstamp) continue

         const airstampDate = getUTCDateString(new Date(episode.airstamp))
         if (airstampDate < todayStr) continue

         upcoming.push({
           id: `${show.id}-${episode.season}-${episode.episode}`,
           media_type: 'tv',
           tmdb_id: show.tmdb_id,
           watchlist_id: show.id,
           title: show.title,
           poster_path: show.poster_path,
           airstamp: episode.airstamp,
           air_date: airstampDate,
           season_number: episode.season,
           episode_number: episode.episode,
           episode_title: episode.name,
           still_path: episode.still_path,
         })
       }
     }

      for (const movie of movies) {
        if (!movie.tmdb_id) continue

        const theatricalDate = movie.release_date
        const digitalDate = movie.digital_release_date

        if (theatricalDate && theatricalDate >= todayStr) {
          upcoming.push({
            id: `${movie.id}-theatrical`,
            media_type: 'movie',
            tmdb_id: movie.tmdb_id,
            watchlist_id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: theatricalDate,
            release_type: 'theatrical',
          })
        }

        if (digitalDate && digitalDate >= todayStr && digitalDate !== theatricalDate) {
          upcoming.push({
            id: `${movie.id}-digital`,
            media_type: 'movie',
            tmdb_id: movie.tmdb_id,
            watchlist_id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: digitalDate,
            release_type: 'digital',
          })
        }
      }

     const uniqueUpcoming = Array.from(
       new Map(upcoming.map(item => [item.id, item])).values()
     )

     uniqueUpcoming.sort((a, b) => {
       const dateA = a.media_type === 'tv' ? (a.airstamp || a.air_date || '') : (a.release_date || '')
       const dateB = b.media_type === 'tv' ? (b.airstamp || b.air_date || '') : (b.release_date || '')
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

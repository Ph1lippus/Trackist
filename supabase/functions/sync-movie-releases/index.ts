import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const GMAP_PAGE_SIZE = 1000
const TMDB_CONCURRENCY = 6
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

interface MovieRow {
  id: string
  tmdb_id: number
  country_code: string | null
  release_date?: string | null
}

interface TMDBReleaseDate {
  iso_3166_1: string
  release_date: string
  type: number
  note?: string
}

interface TMDBReleaseDatesResponse {
  id: number
  results: TMDBReleaseDate[]
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

interface PagedQuery<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
    range(start: number, end: number): PagedQuery<T>
}

async function fetchAllRows<T>(query: PagedQuery<T>): Promise<T[]> {
  const rows: T[] = []
  let page = 0

  while (true) {
    const { data, error } = await query
      .range(page * GMAP_PAGE_SIZE, (page + 1) * GMAP_PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data as T[])
    if (data.length < GMAP_PAGE_SIZE) break
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are not set')
    }
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured')
    }

    const cronSecret = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('Authorization')
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : ''
    const isCron = cronSecret ? req.headers.get('x-cron-secret') === cronSecret : false
    const isService = bearer === supabaseServiceKey

    if (!isCron && !isService) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: users } = await supabase
      .from('profiles')
      .select('id, country_code')
      .not('country_code', 'is', null)

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: 'No users with country code' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    let totalUpdated = 0
    let totalErrors = 0

    for (const user of users) {
      const userId = user.id
      const countryCode = (user.country_code || 'PT').toUpperCase()

      try {
        const movies: MovieRow[] = await fetchAllRows<MovieRow>(
          supabase
            .from('watchlist')
            .select('id, tmdb_id, release_date')
            .eq('user_id', userId)
            .eq('media_type', 'movie')
            .not('tmdb_id', 'is', null)
            .or(`digital_release_date.is.null,release_date.is.null,last_provider_sync.is.null,last_provider_sync.lt.${new Date(Date.now() - STALE_AFTER_MS).toISOString()}`)
        )

        if (movies.length === 0) continue

        const results = await mapWithConcurrency(
          movies,
          async (movie): Promise<{ id: string; digitalDate: string | null; theatricalDate: string | null }> => {
            if (!movie.tmdb_id) return { id: movie.id, digitalDate: null, theatricalDate: null }

            try {
              const data = await fetchJSON<TMDBReleaseDatesResponse>(
                `${TMDB_BASE_URL}/movie/${movie.tmdb_id}/release_dates?api_key=${TMDB_API_KEY}`
              )

              const countryResults = data.results.filter(r => r.iso_3166_1 === countryCode)
              if (countryResults.length === 0) return { id: movie.id, digitalDate: null, theatricalDate: null }

              const allReleases = countryResults.flatMap(r => r.release_dates || [])

              const digitalReleases = allReleases
                .filter(rd => rd.type === 4 && rd.release_date)
                .sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())

              const digitalDate = digitalReleases[0]?.release_date
                ? digitalReleases[0].release_date.split('T')[0]
                : null

              // Types 1=Premiere, 2=Theatrical limited, 3=Theatrical wide
              const theatricalReleases = allReleases
                .filter(rd => (rd.type === 1 || rd.type === 2 || rd.type === 3) && rd.release_date)
                .sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())

              const theatricalDate = theatricalReleases[0]?.release_date
                ? theatricalReleases[0].release_date.split('T')[0]
                : null

              return { id: movie.id, digitalDate, theatricalDate }
            } catch (error) {
              console.error(`Failed to fetch release dates for movie ${movie.tmdb_id}:`, error)
              return { id: movie.id, digitalDate: null, theatricalDate: null }
            }
          },
          TMDB_CONCURRENCY
        )

        for (const { id, digitalDate, theatricalDate } of results) {
          const update: Record<string, unknown> = { last_provider_sync: new Date().toISOString() }
          if (digitalDate) {
            update.digital_release_date = digitalDate
          }
          if (theatricalDate) {
            // Only overwrite release_date if it's missing or different from what's stored
            const movie = movies.find(m => m.id === id)
            if (!movie?.release_date || movie.release_date !== theatricalDate) {
              update.release_date = theatricalDate
            }
          }

          const { error } = await supabase
            .from('watchlist')
            .update(update)
            .eq('id', id)

          if (!error) totalUpdated++
          else totalErrors++
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to process user ${userId}:`, error)
        totalErrors++
      }
    }

    return new Response(
      JSON.stringify({ updated: totalUpdated, errors: totalErrors, message: 'Movie release sync complete' }),
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
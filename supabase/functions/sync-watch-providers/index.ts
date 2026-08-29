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

interface WatchlistItem {
  id: string
  tmdb_id: number
  media_type: 'tv' | 'movie'
  country_code: string | null
}

interface TMDBWatchProvidersResponse {
  id: number
  results: Record<string, {
    flatrate?: { provider_name: string; logo_path: string; provider_id: number }[]
    rent?: { provider_name: string; logo_path: string; provider_id: number }[]
    buy?: { provider_name: string; logo_path: string; provider_id: number }[]
  }>
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

function extractProviders(providers: TMDBWatchProvidersResponse['results'], countryCode: string): {
  flatrate: { name: string; logo: string }[]
  rent: { name: string; logo: string }[]
  buy: { name: string; logo: string }[]
} | null {
  const countryProviders = providers?.[countryCode]
  if (!countryProviders) return null

  return {
    flatrate: countryProviders.flatrate?.map(p => ({ name: p.provider_name, logo: p.logo_path })) || [],
    rent: countryProviders.rent?.map(p => ({ name: p.provider_name, logo: p.logo_path })) || [],
    buy: countryProviders.buy?.map(p => ({ name: p.provider_name, logo: p.logo_path })) || [],
  }
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
        const items: WatchlistItem[] = await fetchAllRows<WatchlistItem>(
          supabase
            .from('watchlist')
            .select('id, tmdb_id, media_type')
            .eq('user_id', userId)
            .in('media_type', ['tv', 'movie'])
            .not('tmdb_id', 'is', null)
        )

        if (items.length === 0) continue

        const results = await mapWithConcurrency(
          items,
          async (item): Promise<{ id: string; providers: object | null }> => {
            if (!item.tmdb_id) return { id: item.id, providers: null }

            try {
              const endpoint = item.media_type === 'tv' ? 'tv' : 'movie'
              const data = await fetchJSON<TMDBWatchProvidersResponse>(
                `${TMDB_BASE_URL}/${endpoint}/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`
              )

              const providers = extractProviders(data.results, countryCode)
              return { id: item.id, providers }
            } catch (error) {
              console.error(`Failed to fetch providers for ${item.media_type} ${item.tmdb_id}:`, error)
              return { id: item.id, providers: null }
            }
          },
          TMDB_CONCURRENCY
        )

        for (const { id, providers } of results) {
          if (providers) {
            const { error } = await supabase
              .from('watchlist')
              .update({ 
                watch_providers: providers,
                last_provider_sync: new Date().toISOString()
              })
              .eq('id', id)

            if (!error) totalUpdated++
            else totalErrors++
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to process user ${userId}:`, error)
        totalErrors++
      }
    }

    return new Response(
      JSON.stringify({ updated: totalUpdated, errors: totalErrors, message: 'Watch providers sync complete' }),
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
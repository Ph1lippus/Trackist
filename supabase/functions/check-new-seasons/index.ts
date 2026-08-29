import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_CONCURRENCY = 5

interface TMDBTVDetails {
  number_of_seasons: number
  seasons: { season_number: number }[]
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

function extractProviders(providers: TMDBWatchProvidersResponse['results'], countryCode: string): object | null {
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

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration')
    }

    const cronSecret = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('Authorization')
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : ''
    const isCron = cronSecret ? req.headers.get('x-cron-secret') === cronSecret : false
    const isService = bearer === supabaseServiceKey

    let targetUserId: string | null = null
    if (!isCron && !isService) {
      const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader || '' } }
      })
      const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: corsHeaders,
        })
      }
      targetUserId = user.id
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let userIds: string[]
    if (targetUserId) {
      userIds = [targetUserId]
    } else {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('country_code', 'is', null)
      userIds = (profiles || []).map(p => p.id)
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ updated: 0, errors: 0, message: 'No users to process' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    let totalUpdated = 0
    let totalErrors = 0
    let providersUpdated = 0

    for (const userId of userIds) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('country_code')
          .eq('id', userId)
          .single()

        const countryCode = (profile?.country_code || 'PT').toUpperCase()

        const { data: shows, error: fetchError } = await supabaseAdmin
          .from('watchlist')
          .select('*')
          .eq('user_id', userId)
          .eq('media_type', 'tv')

        if (fetchError) throw fetchError
        if (!shows || shows.length === 0) continue

        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

        const showsToProcess = shows.filter(show => {
          const lastCheck = show.last_season_check as string | undefined
          return !lastCheck || lastCheck <= sixHoursAgo
        })

        if (showsToProcess.length === 0) continue

        const results = await mapWithConcurrency(
          showsToProcess,
          async (show): Promise<{ updated: boolean; providersSynced: boolean }> => {
            const tmdbId = show.tmdb_id as number | undefined
            if (!tmdbId) return { updated: false, providersSynced: false }

            try {
              const tmdbResponse = await fetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`)
              if (!tmdbResponse.ok) {
                throw new Error(`TMDB responded with status ${tmdbResponse.status}`)
              }

              const details: TMDBTVDetails = await tmdbResponse.json()
              const currentTotalSeasons = details.number_of_seasons || 1
              const storedLastSeason = (show.last_season_number as number) || 1

              const hasNewSeason = currentTotalSeasons > storedLastSeason
              let providersSynced = false

              if (hasNewSeason) {
                const updates: Record<string, unknown> = {
                  last_season_number: currentTotalSeasons,
                  total_seasons: currentTotalSeasons,
                  last_season_check: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  next_air_at: null,
                  last_notified_ref: null,
                }

                const showStatus = show.status as string | undefined
                if (showStatus === 'completed' || showStatus === 'caught_up') {
                  updates.status = 'watching'
                }

                const { error: updateError } = await supabaseAdmin
                  .from('watchlist')
                  .update(updates)
                  .eq('id', show.id as string)

                if (updateError) throw updateError

                try {
                  const providersData = await fetchJSON<TMDBWatchProvidersResponse>(
                    `${TMDB_BASE_URL}/tv/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`
                  )
                  const providers = extractProviders(providersData.results, countryCode)
                  if (providers) {
                    await supabaseAdmin
                      .from('watchlist')
                      .update({ 
                        watch_providers: providers,
                        last_provider_sync: new Date().toISOString()
                      })
                      .eq('id', show.id as string)
                    providersSynced = true
                  }
                } catch (e) {
                  console.error(`Failed to sync providers for ${tmdbId}:`, e)
                }
              } else {
                const { error: updateError } = await supabaseAdmin
                  .from('watchlist')
                  .update({ last_season_check: new Date().toISOString() })
                  .eq('id', show.id as string)

                if (updateError) throw updateError
              }

              return { updated: hasNewSeason, providersSynced }
            } catch (err) {
              console.error(`Failed to process show ${tmdbId}:`, err)
              throw err
            }
          },
          TMDB_CONCURRENCY
        )

        for (const res of results) {
          if (res.updated) totalUpdated++
          if (res.providersSynced) providersUpdated++
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to process user ${userId}:`, error)
        totalErrors++
      }
    }

    return new Response(
      JSON.stringify({ 
        updated: totalUpdated, 
        providers_updated: providersUpdated,
        errors: totalErrors, 
        message: 'Season check complete' 
      }),
      { status: 200, headers: corsHeaders }
    )

  } catch (err) {
    console.error('Edge function error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
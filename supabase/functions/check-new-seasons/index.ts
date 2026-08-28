import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

interface TMDBTVDetails {
  number_of_seasons: number
  seasons: { season_number: number }[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
    if (!TMDB_API_KEY) {
      return new Response(JSON.stringify({ error: 'TMDB_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = user.id

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: shows, error: fetchError } = await supabaseAdmin
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('media_type', 'tv')

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!shows || shows.length === 0) {
      return new Response(JSON.stringify({ updated: 0, errors: 0, message: 'No shows found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let updated = 0
    let errors = 0

    const processShow = async (show: Record<string, unknown>): Promise<boolean> => {
      const tmdbId = show.tmdb_id as number | undefined
      if (!tmdbId) return false

      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      const lastCheck = show.last_season_check as string | undefined
      if (lastCheck && lastCheck > sixHoursAgo) {
        return false
      }

      try {
        const tmdbResponse = await fetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`)
        if (!tmdbResponse.ok) {
          throw new Error(`TMDB responded with status ${tmdbResponse.status}`)
        }

        const details: TMDBTVDetails = await tmdbResponse.json()
        const currentTotalSeasons = details.number_of_seasons || 1
        const storedLastSeason = (show.last_season_number as number) || 1

        const hasNewSeason = currentTotalSeasons > storedLastSeason

        if (hasNewSeason) {
          const updates: Record<string, unknown> = {
            last_season_number: currentTotalSeasons,
            total_seasons: currentTotalSeasons,
            last_season_check: new Date().toISOString(),
            updated_at: new Date().toISOString()
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
        } else {
          const { error: updateError } = await supabaseAdmin
            .from('watchlist')
            .update({ last_season_check: new Date().toISOString() })
            .eq('id', show.id as string)

          if (updateError) throw updateError
        }

        return true
      } catch (err) {
        console.error(`Failed to process show ${tmdbId}:`, err)
        throw err
      }
    }

    const BATCH_SIZE = 5
    for (let i = 0; i < shows.length; i += BATCH_SIZE) {
      const batch = shows.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map(show => processShow(show))
      )

      for (const res of results) {
        if (res.status === 'fulfilled') {
          if (res.value) updated++
        } else {
          errors++
        }
      }

      if (i + BATCH_SIZE < shows.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return new Response(JSON.stringify({ updated, errors, message: 'Check complete' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Edge function error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

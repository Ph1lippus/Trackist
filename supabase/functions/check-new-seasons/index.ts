import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

if (!TMDB_API_KEY) {
  throw new Error('TMDB_API_KEY is not set')
}

interface TMDBSeason {
  season_number: number
  episode_count?: number
}

interface TMDBTVDetails {
  number_of_seasons: number
  seasons: TMDBSeason[]
}

interface TMDBSeasonDetails {
  episodes: Array<{
    id: number
    episode_number: number
    season_number: number
    name: string
    still_path?: string
    overview?: string
    vote_average?: number
    air_date?: string
    runtime?: number
  }>
}

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const { userId } = await req.json()

    if (!userId) {
      return new Response('userId is required', { status: 400 })
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    let updated = 0
    let errors = 0

    // Fetch all TV shows for the user
    const { data: shows, error: fetchError } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('media_type', 'tv')

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (!shows || shows.length === 0) {
      return new Response(JSON.stringify({ updated: 0, errors: 0, message: 'No shows found' }))
    }

    // Process each show
    for (const show of shows) {
      if (!show.tmdb_id) continue

      try {
        // Check if we've checked this show recently (within last 6 hours)
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        if (show.last_season_check && show.last_season_check > sixHoursAgo) {
          continue // Skip, already checked recently
        }

        // Fetch TMDB details
        const tmdbResponse = await fetch(
          `${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`
        )

        if (!tmdbResponse.ok) {
          errors++
          continue
        }

        const details: TMDBTVDetails = await tmdbResponse.json()
        const currentTotalSeasons = details.number_of_seasons || 1

        // Always fetch the latest season's episodes to ensure data is current
        const latestSeason = currentTotalSeasons

        // Update the watchlist with the current season number and check timestamp
        const { error: updateError } = await supabase
          .from('watchlist')
          .update({
            last_season_number: currentTotalSeasons,
            total_seasons: currentTotalSeasons,
            last_season_check: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', show.id)

        if (updateError) {
          errors++
          continue
        }

        // Fetch and save episodes for the latest season
        const seasonResponse = await fetch(
          `${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${latestSeason}?api_key=${TMDB_API_KEY}`
        )

        if (!seasonResponse.ok) {
          errors++
          continue
        }

        const seasonData: TMDBSeasonDetails = await seasonResponse.json()
        const episodes = seasonData.episodes || []

        for (const ep of episodes) {
          await supabase
            .from('watchlist_episodes')
            .upsert({
              watchlist_id: show.id,
              season_number: latestSeason,
              episode_number: ep.episode_number,
              tmdb_episode_id: ep.id,
              title: ep.name,
              still_path: ep.still_path,
              overview: ep.overview,
              vote_average: ep.vote_average,
              air_date: ep.air_date,
              runtime: ep.runtime,
              watched: false
            }, {
              onConflict: 'watchlist_id,season_number,episode_number'
            })
        }

        updated++

        // If the show was completed, move it back to watching
        if (show.status === 'completed') {
          await supabase
            .from('watchlist')
            .update({ status: 'watching', updated_at: new Date().toISOString() })
            .eq('id', show.id)
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        console.error(`Failed to check show ${show.title}:`, err)
        errors++
      }
    }

    return new Response(
      JSON.stringify({ updated, errors, message: 'Check complete' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

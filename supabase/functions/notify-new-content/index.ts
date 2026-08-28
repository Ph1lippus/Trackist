import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const WATCHLIST_PAGE_SIZE = 1000
const TMDB_CONCURRENCY = 6

interface TVShowRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  status: string | null
  last_season_number?: number | null
}

interface MovieRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  release_date?: string | null
}

interface SubscriptionRow {
  id: string
  endpoint: string
  keys: { p256dh?: string; auth?: string }
}

interface TMDBEpisode {
  id: number
  episode_number: number
  name?: string
  air_date?: string | null
  still_path?: string | null
}

interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  icon?: string
}

const getUTCDateString = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are not set')
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

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return new Response(JSON.stringify({ error: 'VAPID configuration missing' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const todayStr = getUTCDateString(new Date())

    const { data: subRows } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    const userIds = Array.from(new Set((subRows || []).map((row) => row.user_id as string)))
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ users_processed: 0, notifications_sent: 0, errors: 0 }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    let notificationsSent = 0
    let errors = 0
    let usersProcessed = 0
    let staleSubscriptionsRemoved = 0

    for (const userId of userIds) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('notify_new_episode, notify_new_season, notify_release_date')
          .eq('id', userId)
          .maybeSingle()

        const prefs = profile ?? { notify_new_episode: true, notify_new_season: true, notify_release_date: true }

        const wantEpisode = prefs.notify_new_episode !== false
        const wantSeason = prefs.notify_new_season !== false
        const wantRelease = prefs.notify_release_date !== false

        if (!wantEpisode && !wantSeason && !wantRelease) continue

        const [tvShows, movies] = await Promise.all([
          wantEpisode || wantSeason
            ? fetchAllRows<TVShowRow>(
                supabase
                  .from('watchlist')
                  .select('id, tmdb_id, title, poster_path, status, last_season_number')
                  .eq('user_id', userId)
                  .eq('media_type', 'tv')
              )
            : Promise.resolve([]),
          wantRelease
            ? fetchAllRows<MovieRow>(
                supabase
                  .from('watchlist')
                  .select('id, tmdb_id, title, poster_path, release_date')
                  .eq('user_id', userId)
                  .eq('media_type', 'movie')
              )
            : Promise.resolve([]),
        ])

        const notifications: PushPayload[] = []
        const seenTags = new Set<string>()
        const addNotification = (payload: PushPayload) => {
          if (seenTags.has(payload.tag)) return
          seenTags.add(payload.tag)
          notifications.push(payload)
        }

        if (tvShows.length > 0) {
          const seasonResults = await mapWithConcurrency(
            tvShows,
            async (show): Promise<{ show: TVShowRow; seasonNumber: number; episodes: TMDBEpisode[] }> => {
              const seasonNumber = show.last_season_number && show.last_season_number > 0
                ? show.last_season_number
                : 1

              if (!show.tmdb_id) return { show, seasonNumber, episodes: [] }

              try {
                const data = await fetchJSON<{ episodes?: TMDBEpisode[] }>(
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

          for (const { show, seasonNumber, episodes } of seasonResults) {
            if (!show.tmdb_id) continue

            for (const episode of episodes) {
              if (!episode.air_date || episode.air_date !== todayStr) continue

              const firstEpisodeOfSeason = episode.episode_number === 1
              const userWasCaughtUp = show.status === 'caught_up' || show.status === 'completed'

              if (wantEpisode) {
                addNotification({
                  title: show.title,
                  body: firstEpisodeOfSeason
                    ? `S${seasonNumber} premieres today`
                    : `New episode S${seasonNumber}E${episode.episode_number}${episode.name ? ` — ${episode.name}` : ''}`,
                  url: `/tv/${show.tmdb_id}`,
                  tag: `episode:${show.id}`,
                  icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                })
              }

              if (wantSeason && firstEpisodeOfSeason && userWasCaughtUp) {
                addNotification({
                  title: show.title,
                  body: `New season S${seasonNumber} premieres today`,
                  url: `/tv/${show.tmdb_id}`,
                  tag: `season:${show.id}`,
                  icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                })
              }
            }
          }
        }

        if (wantRelease) {
          for (const movie of movies) {
            if (!movie.tmdb_id || movie.release_date !== todayStr) continue

            addNotification({
              title: movie.title,
              body: 'Releases today',
              url: `/movie/${movie.tmdb_id}`,
              tag: `movie:${movie.id}`,
              icon: movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : undefined,
            })
          }
        }

        if (notifications.length === 0) continue

        const { data: subscriptions } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, keys')
          .eq('user_id', userId)

        if (!subscriptions || subscriptions.length === 0) continue

        usersProcessed++

        for (const notification of notifications) {
          for (const sub of subscriptions as SubscriptionRow[]) {
            if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue

            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
                },
                JSON.stringify(notification),
                { TTL: 60 * 60 * 24 * 3 }
              )
              notificationsSent++
            } catch (error) {
              const statusCode = (error as { statusCode?: number }).statusCode
              if (statusCode === 404 || statusCode === 410) {
                const { error: deleteError } = await supabase
                  .from('push_subscriptions')
                  .delete()
                  .eq('id', sub.id)
                if (!deleteError) staleSubscriptionsRemoved++
              } else {
                console.error(`Failed to send push to ${sub.endpoint}:`, error)
                errors++
              }
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 50))
      } catch (error) {
        console.error(`Failed to process user ${userId}:`, error)
        errors++
      }
    }

    return new Response(
      JSON.stringify({
        users_processed: usersProcessed,
        notifications_sent: notificationsSent,
        stale_subscriptions_removed: staleSubscriptionsRemoved,
        errors,
      }),
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
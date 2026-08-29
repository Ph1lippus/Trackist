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
const GMAP_PAGE_SIZE = 1000
const TMDB_CONCURRENCY = 6
const SCHEDULE_THROTTLE_MS = 60 * 60 * 1000

interface TVShowRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  status: string | null
  last_season_number?: number | null
  next_air_at?: string | null
  last_notified_ref?: string | null
  last_season_check?: string | null
  watch_providers?: Record<string, unknown>
}

interface MovieRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  release_date?: string | null
  digital_release_date?: string | null
  next_air_at?: string | null
  last_notified_ref?: string | null
  last_movie_notified_ref?: string | null
  watch_providers?: Record<string, unknown>
}

interface SubscriptionRow {
  id: string
  endpoint: string
  keys: { p256dh?: string; auth?: string }
}

interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  icon?: string
}

interface TMDBEpisode {
  id: number
  episode_number: number
  name?: string
  air_date?: string | null
  still_path?: string | null
}

interface WatchProviderResponse {
  results?: Record<string, {
    flatrate?: { provider_name: string; logo_path: string }[]
    rent?: { provider_name: string; logo_path: string }[]
    buy?: { provider_name: string; logo_path: string }[]
  }>
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

function todayInTimezone(timezone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return getUTCDateString(now)
  }
}

function tomorrowInTimezone(timezone: string, now: Date = new Date()): string {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return todayInTimezone(timezone, tomorrow)
}

function formatProviders(providers: Record<string, unknown> | null | undefined): string {
  if (!providers || typeof providers !== 'object') return ''
  const result = providers as WatchProviderResponse
  const names: string[] = []
  for (const country of Object.values(result)) {
    if (country.flatrate) names.push(...country.flatrate.map(p => p.provider_name))
    if (country.rent) names.push(...country.rent.map(p => p.provider_name))
    if (country.buy) names.push(...country.buy.map(p => p.provider_name))
  }
  const unique = [...new Set(names)]
  return unique.length > 0 ? ` on ${unique.join(', ')}` : ''
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

    let targetUserId: string | null = null
    if (!isCron) {
      try {
        const body = await req.json()
        targetUserId = body.userId || null
      } catch {
        // body parse failed, continue with cron/service auth
      }
    }

    if (!isCron && !isService && !targetUserId) {
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

    const now = new Date()

    let userIds: string[]
    if (targetUserId) {
      userIds = [targetUserId]
    } else {
      const { data: subRows } = await supabase
        .from('push_subscriptions')
        .select('user_id')
      userIds = Array.from(new Set((subRows || []).map((row) => row.user_id as string)))
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ users_processed: 0, notifications_sent: 0, errors: 0 }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, timezone, country_code, notify_new_episode, notify_new_season, notify_release_date, movie_notify_on_digital')
      .in('id', userIds)

    const profileMap = new Map<string, Record<string, unknown>>(
      (profileRows || []).map((p) => [p.id as string, p as Record<string, unknown>])
    )

    let notificationsSent = 0
    let errors = 0
    let usersProcessed = 0
    let itemsScheduled = 0
    let staleSubscriptionsRemoved = 0

    for (const userId of userIds) {
      try {
        const profile = profileMap.get(userId) ?? {}
        const timezone = typeof profile.timezone === 'string' ? profile.timezone : 'UTC'
        const wantEpisode = profile.notify_new_episode !== false
        const wantSeason = profile.notify_new_season !== false
        const wantRelease = profile.notify_release_date !== false
        const movieDigitalOnly = profile.movie_notify_on_digital !== false

        if (!wantEpisode && !wantSeason && !wantRelease) continue

        const todayStr = todayInTimezone(timezone, now)
        const tomorrowStr = tomorrowInTimezone(timezone, now)

        const [tvShows, movies] = await Promise.all([
          (wantEpisode || wantSeason)
            ? fetchAllRows<TVShowRow>(
                supabase
                  .from('watchlist')
                  .select('id, tmdb_id, title, poster_path, status, last_season_number, next_air_at, last_notified_ref, last_season_check, watch_providers')
                  .eq('user_id', userId)
                  .eq('media_type', 'tv')
                  .or(`next_air_at.is.null,next_air_at.lte.${tomorrowStr}`)
              )
            : Promise.resolve([]),
          wantRelease
            ? fetchAllRows<MovieRow>(
                supabase
                  .from('watchlist')
                  .select('id, tmdb_id, title, poster_path, release_date, digital_release_date, next_air_at, last_notified_ref, last_movie_notified_ref, watch_providers')
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
                const episodes = data.episodes || []
                if (episodes.length === 0 && seasonNumber > 1) {
                  try {
                    const nextSeasonData = await fetchJSON<{ episodes?: TMDBEpisode[] }>(
                      `${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${seasonNumber + 1}?api_key=${TMDB_API_KEY}`
                    )
                    if (nextSeasonData.episodes && nextSeasonData.episodes.length > 0) {
                      return { show, seasonNumber: seasonNumber + 1, episodes: nextSeasonData.episodes }
                    }
                  } catch {
                    // Ignore error, fall through to return original season
                  }
                }
                return { show, seasonNumber, episodes }
              } catch (error) {
                console.error(`Failed to fetch season ${seasonNumber} for ${show.title}:`, error)
                return { show, seasonNumber, episodes: [] }
              }
            },
            TMDB_CONCURRENCY
          )

          for (const { show, seasonNumber, episodes } of seasonResults) {
            if (!show.tmdb_id || episodes.length === 0) continue

            const sorted = [...episodes].sort((a, b) => {
              const da = a.air_date || ''
              const db = b.air_date || ''
              return da < db ? -1 : da > db ? 1 : a.episode_number - b.episode_number
            })

            const dueEpisodes = sorted.filter((ep) =>
              ep.air_date && (ep.air_date === todayStr || ep.air_date === tomorrowStr)
            )

            if (dueEpisodes.length === 0) {
              if (!show.next_air_at) {
                const lastCheck = show.last_season_check ? new Date(show.last_season_check).getTime() : 0
                const nextUnreleased = sorted.find((ep) =>
                  ep.air_date && (ep.air_date === todayStr || ep.air_date === tomorrowStr || ep.air_date > todayStr)
                )
                if (Date.now() - lastCheck > SCHEDULE_THROTTLE_MS) {
                  await supabase
                    .from('watchlist')
                    .update({ next_air_at: nextUnreleased?.air_date ?? null, last_season_check: now.toISOString() })
                    .eq('id', show.id)
                  if (nextUnreleased) itemsScheduled++
                }
              }
              continue
            }

            const firstDue = dueEpisodes[0]
            const isPremiere = firstDue.episode_number === 1 &&
              (show.status === 'caught_up' || show.status === 'completed') &&
              wantSeason

            if (isPremiere) {
              const seasonRef = `S${seasonNumber}premiere:${firstDue.air_date}`
              if (show.last_notified_ref !== seasonRef) {
                const providerStr = formatProviders(show.watch_providers)
                addNotification({
                  title: show.title,
                  body: `New season · S${seasonNumber}${firstDue.name ? ` — ${firstDue.name}` : ''}${providerStr}`,
                  url: `/tv/${show.tmdb_id}`,
                  tag: `season:${show.id}:${seasonRef}`,
                  icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                })
                await supabase
                  .from('watchlist')
                  .update({ last_notified_ref: seasonRef })
                  .eq('id', show.id)
              }
            } else if (wantEpisode) {
              if (dueEpisodes.length === 1) {
                const ep = dueEpisodes[0]
                const newRef = `S${seasonNumber}E${ep.episode_number}:${ep.air_date}`
                if (show.last_notified_ref !== newRef) {
                  const providerStr = formatProviders(show.watch_providers)
                  addNotification({
                    title: show.title,
                    body: `S${seasonNumber} · E${ep.episode_number}${ep.name ? ` — ${ep.name}` : ''}${providerStr}`,
                    url: `/tv/${show.tmdb_id}`,
                    tag: `episode:${show.id}:${newRef}`,
                    icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                  })
                  await supabase
                    .from('watchlist')
                    .update({ last_notified_ref: newRef })
                    .eq('id', show.id)
                }
              } else {
                const epCount = dueEpisodes.length
                const seasonRef = `S${seasonNumber}multi:${todayStr}`
                if (show.last_notified_ref !== seasonRef) {
                  const providerStr = formatProviders(show.watch_providers)
                  addNotification({
                    title: show.title,
                    body: `Season ${seasonNumber} (${epCount} episodes) now available${providerStr}`,
                    url: `/tv/${show.tmdb_id}`,
                    tag: `season:${show.id}:${seasonRef}`,
                    icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                  })
                  await supabase
                    .from('watchlist')
                    .update({ last_notified_ref: seasonRef })
                    .eq('id', show.id)
                }
              }
            }

            const lastCheck = show.last_season_check ? new Date(show.last_season_check).getTime() : 0
            if (Date.now() - lastCheck > SCHEDULE_THROTTLE_MS) {
              const nextUnreleased = sorted.find((ep) =>
                ep.air_date && ep.air_date > tomorrowStr
              )
              await supabase
                .from('watchlist')
                .update({ next_air_at: nextUnreleased?.air_date ?? null, last_season_check: now.toISOString() })
                .eq('id', show.id)
              if (nextUnreleased) itemsScheduled++
            }
          }
        }

        if (wantRelease) {
          for (const movie of movies) {
            if (!movie.tmdb_id) continue

            const digitalDate = movie.digital_release_date
            const theatricalDate = movie.release_date
            const notifyDate = movieDigitalOnly ? digitalDate : (digitalDate || theatricalDate)

            if (!notifyDate) continue

            const newRef = notifyDate
            const due = notifyDate === todayStr

            if (due && movie.last_movie_notified_ref !== newRef) {
              const providerStr = formatProviders(movie.watch_providers)
              addNotification({
                title: movie.title,
                body: `Now available digitally${providerStr}`,
                url: `/movie/${movie.tmdb_id}`,
                tag: `movie:${movie.id}:${newRef}`,
                icon: movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : undefined,
              })
              await supabase
                .from('watchlist')
                .update({ last_movie_notified_ref: newRef })
                .eq('id', movie.id)
            }

            if (!movie.next_air_at && notifyDate > todayStr) {
              await supabase
                .from('watchlist')
                .update({ next_air_at: notifyDate })
                .eq('id', movie.id)
              itemsScheduled++
            } else if (movie.last_movie_notified_ref === notifyDate && movie.next_air_at) {
              await supabase
                .from('watchlist')
                .update({ next_air_at: null })
                .eq('id', movie.id)
            }
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
        items_scheduled: itemsScheduled,
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
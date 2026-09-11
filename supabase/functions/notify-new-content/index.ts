import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushNotification } from './web-push.ts'
import { sendNativeNotification } from './native-fcm.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const GMAP_PAGE_SIZE = 1000
const USER_CONCURRENCY = 6
const FETCH_CONCURRENCY = 12
const PUSH_CONCURRENCY = 4
const FETCH_TIMEOUT_MS = 4000
const SCHEDULE_STALE_MS = 6 * 60 * 60 * 1000
const NOTIFICATION_CHECK_THROTTLE_MS = 15 * 60 * 1000
const HYDRATE_BUDGET_MS = 70_000
const MAX_INVOCATION_MS = 98_000

let invocationStart = 0

interface TVShowRow {
  id: string
  tmdb_id: number | null
  title: string
  poster_path: string | null
  status: string | null
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
  platform?: string
  token?: string
}

interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  icon?: string
  image?: string
}

interface PendingWrite {
  id: string
  patch: Record<string, unknown>
}

interface NotifyItem extends PushPayload {
  write?: PendingWrite
}

interface TVMazeEpisode {
  season: number
  episode: number
  name?: string
  airstamp: string | null
}

interface RunStats {
  notificationsSent: number
  errors: number
  usersProcessed: number
  itemsScheduled: number
  totalScheduled: number
  staleSubscriptionsRemoved: number
  skippedThrottled: number
  showsHydrated: number
}

const getUTCDateString = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
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

const TVMAZE_BASE_URL = 'https://api.tvmaze.com'
const TVMAZE_MAX_RETRIES = 2
const TVMAZE_RETRY_DELAYS_MS = [300, 800]

async function getTMDBExternalIds(tmdbId: number): Promise<{ imdb_id?: string } | null> {
  try {
    return await fetchJSON<{ imdb_id?: string }>(
      `${TMDB_BASE_URL}/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
    )
  } catch {
    return null
  }
}

async function fetchTVMazeJson(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= TVMAZE_MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url)
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

/**
 * Fetch episode data for a show.
 *
 * Returns `[]` ONLY when the schedule is *known* to be empty (no IMDb id, or
 * not present on TVMaze). Source failures (network errors, 404/429 after
 * retries) THROW so the caller can fall back to a generic "airing today"
 * notification and the schedule is NOT marked as checked -- it gets retried
 * next run instead of being silently "done".
 */
async function fetchTVMazeScheduleInner(tmdbId: number): Promise<TVMazeEpisode[]> {
  const external = await getTMDBExternalIds(tmdbId)
  if (!external?.imdb_id) return []

  const look = await fetchTVMazeJson(`${TVMAZE_BASE_URL}/lookup/shows?imdb=${external.imdb_id}`)
  if (!look) throw new Error(`[TVMaze] lookup failed for tmdb ${tmdbId}`)
  const show = (await look.json()) as { id?: number }
  if (!show.id) return []

  const res = await fetchTVMazeJson(`${TVMAZE_BASE_URL}/shows/${show.id}/episodes`)
  if (!res) throw new Error(`[TVMaze] episodes fetch failed for tmdb ${tmdbId}`)
  const entries = (await res.json()) as {
    season?: number
    number?: number | null
    name?: string | null
    airstamp?: string | null
  }[]

  // Skip specials: TVmaze lists them as season 0 with number null.
  return entries
    .filter(entry => (entry.season ?? 0) > 0 && (entry.number ?? 0) > 0)
    .map(entry => ({
      season: entry.season ?? 0,
      episode: entry.number ?? 0,
      name: entry.name ?? undefined,
      airstamp: entry.airstamp ?? null,
    }))
}

// Run-scoped, globally deduped schedule cache. One unique show is fetched once
// per invocation no matter how many users track it -- the old code fetched the
// same show once per user, which is what caused the multi-user startup to die.
const tvmazeCache = new Map<number, TVMazeEpisode[]>()
const tvmazeInFlight = new Map<number, Promise<TVMazeEpisode[]>>()
const scheduleWrittenSinceHydrate = new Set<number>()
const hydratedUniqueShows = new Set<number>()

let activeFetches = 0
const fetchWaiters: (() => void)[] = []

function acquireFetchSlot(): Promise<void> {
  if (activeFetches < FETCH_CONCURRENCY) {
    activeFetches++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => fetchWaiters.push(resolve))
}

function releaseFetchSlot(): void {
  const next = fetchWaiters.shift()
  if (next) next()
  else activeFetches--
}

async function fetchTVMazeSchedule(tmdbId: number): Promise<TVMazeEpisode[]> {
  const cached = tvmazeCache.get(tmdbId)
  if (cached) return cached
  const inFlight = tvmazeInFlight.get(tmdbId)
  if (inFlight) return inFlight

  const promise = (async () => {
    await acquireFetchSlot()
    try {
      const episodes = await fetchTVMazeScheduleInner(tmdbId)
      tvmazeCache.set(tmdbId, episodes)
      return episodes
    } finally {
      releaseFetchSlot()
      tvmazeInFlight.delete(tmdbId)
    }
  })()

  tvmazeInFlight.set(tmdbId, promise)
  return promise
}

function computeNextAirDate(episodes: TVMazeEpisode[], now: Date): string | null {
  const startOfTodayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const sorted = [...episodes]
    .filter(ep => ep.airstamp)
    .sort((a, b) => a.airstamp!.localeCompare(b.airstamp!))
  for (const ep of sorted) {
    const t = Date.parse(ep.airstamp!)
    if (!Number.isNaN(t) && t >= startOfTodayUTC) {
      return getUTCDateString(new Date(t))
    }
  }
  return null
}

// Fetch the schedule for a show (once, globally deduped) and persist the
// derived next_air_at/last_season_check back to every watchlist row for that
// show. Throws on source failures so the caller can fall back to a generic
// notification and the schedule is retried on the next run.
async function getTVMazeScheduleWithWrite(
  supabase: ReturnType<typeof createClient>,
  tmdbId: number
): Promise<TVMazeEpisode[]> {
  if (Date.now() - invocationStart > HYDRATE_BUDGET_MS) return []

  const episodes = await fetchTVMazeSchedule(tmdbId)

  if (!scheduleWrittenSinceHydrate.has(tmdbId)) {
    scheduleWrittenSinceHydrate.add(tmdbId)
    const now = new Date()
    const nextAir = computeNextAirDate(episodes, now)
    const patch: Record<string, unknown> = { last_season_check: now.toISOString() }
    if (nextAir !== null) {
      patch.next_air_at = nextAir
    } else {
      // Known-empty schedule (series finished or not on TVMaze): stop treating
      // it as pending and persist so it is not re-fetched every single run.
      patch.next_air_at = null
    }
    await supabase
      .from('watchlist')
      .update(patch)
      .eq('tmdb_id', tmdbId)
  }

  return episodes
}

function getLocalDateFromAirstamp(airstamp: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(airstamp))
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return getUTCDateString(new Date(airstamp))
  }
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

/**
 * An episode/movie is due when its local date (profile timezone) is today or
 * tomorrow. Both stages are always due: the dedup refs (`last_notified_ref` /
 * `last_movie_notified_ref`) already guarantee exactly one notification per
 * episode per stage, and this function is driven by the hourly cron rather
 * than app opens - so both "Coming tomorrow" and "Airing today" fire on their
 * own days regardless of when the user opens the app.
 */
function isDueForUserDate(dateString: string, timezone: string, now: Date): boolean {
  const localToday = todayInTimezone(timezone, now)
  const localTomorrow = tomorrowInTimezone(timezone, now)
  return dateString === localToday || dateString === localTomorrow
}

function formatProviders(providers: Record<string, unknown> | null | undefined): string {
  if (!providers || typeof providers !== 'object') return ''
  const p = providers as { flatrate?: { name: string }[]; rent?: { name: string }[]; buy?: { name: string }[] }
  const names: string[] = []
  if (p.flatrate) names.push(...p.flatrate.map(x => x.name))
  if (p.rent) names.push(...p.rent.map(x => x.name))
  if (p.buy) names.push(...p.buy.map(x => x.name))
  const unique = [...new Set(names)]
  return unique.length > 0 ? ` on ${unique.join(', ')}` : ''
}

function getMovieNotifiedRefs(lastRef: string | null | undefined): string[] {
  if (!lastRef) return []
  if (lastRef.startsWith('[')) {
    try {
      return JSON.parse(lastRef)
    } catch {
      return []
    }
  }
  return [lastRef]
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
    let testMode = false
    let requestBody: Record<string, unknown> | null = null
    let callerUserId: string | null = null
    if (!isCron) {
      try {
        requestBody = await req.json()
        targetUserId = typeof requestBody.userId === 'string' ? requestBody.userId : null
        testMode = !!requestBody.test
      } catch {
        // body parse failed, continue with cron/service auth
      }
    }

    if (!isCron && !isService) {
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
      if (!bearer || !supabaseAnonKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: corsHeaders,
        })
      }

      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: { user: caller }, error: authError } = await authClient.auth.getUser(bearer)
      if (authError || !caller) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: corsHeaders,
        })
      }
      callerUserId = caller.id
    }

    if (!isCron && !isService && !targetUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    if (targetUserId && callerUserId && targetUserId !== callerUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const sendToSubscription = async (
      sub: SubscriptionRow,
      payload: PushPayload
    ): Promise<void> => {
      if (sub.platform === 'native') {
        if (!sub.token) return
        await sendNativeNotification(sub.token, {
          title: payload.title,
          body: payload.body,
          url: payload.url,
          tag: payload.tag,
        })
        return
      }
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return
      if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
        throw new Error('Web push is not configured (missing VAPID settings)')
      }
      await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        JSON.stringify(payload),
        { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey }
      )
    }

    if (testMode) {
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'test mode requires a userId' }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      let testSent = 0
      let testErrors = 0
      const { data: testSubscriptions } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, keys, platform, token')
        .eq('user_id', targetUserId)

      for (const sub of (testSubscriptions || []) as SubscriptionRow[]) {
        try {
          await sendToSubscription(sub, {
            title: 'Track1st',
            body: `Test notification · ${new Date().toISOString()}`,
            url: '/settings',
            tag: `test:${targetUserId}:${new Date().toISOString()}`,
          })
          testSent++
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id)
          } else {
            console.error(`Failed to send test push to ${sub.platform}/${sub.endpoint || sub.token}:`, error)
          }
          testErrors++
        }
      }

      return new Response(
        JSON.stringify({ test_notifications_sent: testSent, errors: testErrors }),
        { status: 200, headers: corsHeaders }
      )
    }

    const now = new Date()
    invocationStart = Date.now()
    const isManual = !!targetUserId

    const stats: RunStats = {
      notificationsSent: 0,
      errors: 0,
      usersProcessed: 0,
      itemsScheduled: 0,
      totalScheduled: 0,
      staleSubscriptionsRemoved: 0,
      skippedThrottled: 0,
      showsHydrated: 0,
    }

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
      return new Response(JSON.stringify({
        users_processed: 0,
        notifications_sent: 0,
        errors: 0,
        items_scheduled: 0,
        total_scheduled: 0,
        stale_subscriptions_removed: 0,
        shows_hydrated: 0,
      }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, timezone, country_code, notify_hour, notify_new_episode, notify_new_season, notify_release_date, movie_notify_on_digital')
      .in('id', userIds)

    const { data: recentRuns } = await supabase
      .from('notification_check_runs')
      .select('user_id, last_completed_at')
      .in('user_id', userIds)

    const recentRunMap = new Map<string, number>(
      (recentRuns || []).map((run) => [run.user_id as string, new Date(run.last_completed_at as string).getTime()])
    )

    const profileMap = new Map<string, Record<string, unknown>>(
      (profileRows || []).map((p) => [p.id as string, p as Record<string, unknown>])
    )

    const pendingRunUpserts: { user_id: string; last_completed_at: string }[] = []

    const processUserId = async (userId: string): Promise<void> => {
      try {
        if (!isManual && Date.now() - invocationStart > MAX_INVOCATION_MS) {
          console.warn('Time budget exceeded, stopping before user', userId)
          return
        }

        const lastCompletedAt = recentRunMap.get(userId) || 0
        // Manual "Check Now" bypasses the throttle so the button always works.
        // Dedup refs still prevent duplicates.
        if (!isManual && Date.now() - lastCompletedAt < NOTIFICATION_CHECK_THROTTLE_MS) {
          stats.skippedThrottled++
          return
        }

        const profile = profileMap.get(userId) ?? {}
        const timezone = typeof profile.timezone === 'string' ? profile.timezone : 'UTC'
        const wantEpisode = profile.notify_new_episode !== false
        const wantSeason = profile.notify_new_season !== false
        const wantRelease = profile.notify_release_date !== false
        const movieDigitalOnly = profile.movie_notify_on_digital !== false

        if (!wantEpisode && !wantSeason && !wantRelease) return

        const todayStr = todayInTimezone(timezone, now)
        const tomorrowStr = tomorrowInTimezone(timezone, now)
        const staleCutoff = new Date(Date.now() - SCHEDULE_STALE_MS).toISOString()

        const [tvShows, movies] = await Promise.all([
          (wantEpisode || wantSeason)
            ? fetchAllRows<TVShowRow>(
                supabase
                  .from('watchlist')
                  .select('id, tmdb_id, title, poster_path, status, next_air_at, last_notified_ref, last_season_check, watch_providers')
                  .eq('user_id', userId)
                  .eq('media_type', 'tv')
                  .not('tmdb_id', 'is', null)
                  .or(`next_air_at.lte.${tomorrowStr},last_season_check.is.null,last_season_check.lt.${staleCutoff}`)
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

        const notifications: NotifyItem[] = []
        const seenTags = new Set<string>()
        const addNotification = (item: NotifyItem): NotifyItem | null => {
          if (seenTags.has(item.tag)) return null
          seenTags.add(item.tag)
          notifications.push(item)
          return item
        }

        const movieRefUpdates = new Map<string, { refs: string[]; existingRefs: string }>()

        for (const show of tvShows) {
          if (!show.tmdb_id) continue

          let episodes: TVMazeEpisode[] = []
          try {
            episodes = await getTVMazeScheduleWithWrite(supabase, show.tmdb_id)
            if (episodes.length > 0) hydratedUniqueShows.add(show.tmdb_id)
          } catch (error) {
            console.error(`Failed to fetch TVMaze schedule for ${show.title}:`, error)
          }

          // Fallback: TVMaze unreachable but the stored next_air_at says this
          // show is due -- still notify so a source outage never blocks delivery.
          if (episodes.length === 0) {
            if (show.next_air_at) {
              const bucket = show.next_air_at === todayStr
                ? 'today'
                : show.next_air_at === tomorrowStr
                  ? 'tomorrow'
                  : null
              if (bucket) {
                const ref = `air:${show.next_air_at}:${bucket}`
                if (show.last_notified_ref !== ref) {
                  const providerStr = formatProviders(show.watch_providers)
                  const bucketLabel = bucket === 'today' ? 'Airing today' : 'Coming tomorrow'
                  addNotification({
                    title: show.title,
                    body: `${bucketLabel}${providerStr}`,
                    url: `/tv/${show.tmdb_id}`,
                    tag: `tv:${show.id}:${ref}`,
                    icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                    image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
                    write: { id: show.id, patch: { last_notified_ref: ref } },
                  })
                }
              }
            }
            continue
          }

          const validEpisodes = episodes.filter(ep => ep.airstamp)
          if (validEpisodes.length === 0) continue

          const sorted = [...validEpisodes].sort((a, b) => {
            return a.airstamp!.localeCompare(b.airstamp!)
          })

          const dueEpisodes = sorted.filter((ep) => {
            if (!ep.airstamp) return false
            const localDate = getLocalDateFromAirstamp(ep.airstamp, timezone)
            return isDueForUserDate(localDate, timezone, now)
          })

          if (dueEpisodes.length === 0) continue

          const firstDue = dueEpisodes[0]
          const firstDueLocalDate = getLocalDateFromAirstamp(firstDue.airstamp!, timezone)
          const firstDueBucket = firstDueLocalDate === todayStr ? 'today' : 'tomorrow'
          const isPremiere = firstDue.episode === 1 &&
            (show.status === 'caught_up' || show.status === 'completed') &&
            wantSeason

          let addedItem: NotifyItem | null = null

          if (isPremiere) {
            const seasonRef = `S${firstDue.season}premiere:${firstDueLocalDate}:${firstDueBucket}`
            const legacyRef = `S${firstDue.season}premiere:${firstDueLocalDate}`
            const alreadyNotified = show.last_notified_ref === seasonRef ||
              (firstDueBucket === 'tomorrow' && show.last_notified_ref === legacyRef)
            if (!alreadyNotified) {
              const providerStr = formatProviders(show.watch_providers)
              const bucketLabel = firstDueBucket === 'today' ? 'Premieres today' : 'Coming tomorrow'
              addedItem = addNotification({
                title: show.title,
                body: `${bucketLabel}${providerStr} • ${firstDue.name ? firstDue.name : `Season ${firstDue.season} premiere`}`,
                url: `/tv/${show.tmdb_id}`,
                tag: `season:${show.id}:${seasonRef}`,
                icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
                write: { id: show.id, patch: { last_notified_ref: seasonRef } },
              })
            }
          } else if (wantEpisode) {
            if (dueEpisodes.length === 1) {
              const ep = dueEpisodes[0]
              const epLocalDate = getLocalDateFromAirstamp(ep.airstamp!, timezone)
              const newRef = `S${ep.season}E${ep.episode}:${epLocalDate}:${firstDueBucket}`
              const legacyRef = `S${ep.season}E${ep.episode}:${epLocalDate}`
              const alreadyNotified = show.last_notified_ref === newRef ||
                (firstDueBucket === 'tomorrow' && show.last_notified_ref === legacyRef)
              if (!alreadyNotified) {
                const providerStr = formatProviders(show.watch_providers)
                const bucketLabel = firstDueBucket === 'today' ? 'Airing today' : 'Coming tomorrow'
                addedItem = addNotification({
                  title: show.title,
                  body: `${bucketLabel}${providerStr} • ${ep.name ? ep.name : `Episode ${ep.episode}`}`,
                  url: `/tv/${show.tmdb_id}`,
                  tag: `episode:${show.id}:${newRef}`,
                  icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                  image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
                  write: { id: show.id, patch: { last_notified_ref: newRef } },
                })
              }
            } else {
              const epCount = dueEpisodes.length
              const seasonRef = `S${firstDue.season}multi:${firstDueBucket}:${firstDueBucket === 'today' ? todayStr : tomorrowStr}`
              const legacyRef = `S${firstDue.season}multi:${todayStr}`
              const alreadyNotified = show.last_notified_ref === seasonRef ||
                (firstDueBucket === 'tomorrow' && show.last_notified_ref === legacyRef)
              if (!alreadyNotified) {
                const providerStr = formatProviders(show.watch_providers)
                const bucketLabel = dueEpisodes.some((episode) => {
                  if (!episode.airstamp) return false
                  const localDate = getLocalDateFromAirstamp(episode.airstamp, timezone)
                  return localDate === todayStr
                }) ? 'Airing today' : 'Coming tomorrow'
                addedItem = addNotification({
                  title: show.title,
                  body: `${bucketLabel}${providerStr} • ${epCount} episodes arriving`,
                  url: `/tv/${show.tmdb_id}`,
                  tag: `season:${show.id}:${seasonRef}`,
                  icon: show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : undefined,
                  image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
                  write: { id: show.id, patch: { last_notified_ref: seasonRef } },
                })
              }
            }
          }

          if (addedItem) {
            const nextUnreleased = sorted.find((ep) => {
              if (!ep.airstamp) return false
              const localDate = getLocalDateFromAirstamp(ep.airstamp, timezone)
              return localDate > tomorrowStr
            })
            if (nextUnreleased) {
              stats.itemsScheduled++
            }
          }
        }

        if (wantRelease) {
          for (const movie of movies) {
            if (!movie.tmdb_id) continue

            const digitalDate = movie.digital_release_date
            const theatricalDate = movie.release_date

            const releases = [
              { date: theatricalDate, type: 'theatrical' as const, label: 'In cinema' },
              { date: digitalDate, type: 'digital' as const, label: 'Digital' },
            ]

            if (!movieDigitalOnly) {
              releases.splice(1, 1)
            }

            const pendingRefs: string[] = []

            for (const { date, type, label } of releases) {
              if (!date) continue

              const notificationStage = date === todayStr ? 'today' : 'tomorrow'
              const newRef = `${type}:${date}:${notificationStage}`
              const existingRefs = getMovieNotifiedRefs(movie.last_movie_notified_ref)
              const alreadyNotified = existingRefs.includes(newRef) ||
                (notificationStage === 'tomorrow' && existingRefs.some(ref => ref.startsWith(`${type}:${date}`)))
              const due = isDueForUserDate(date, timezone, now)

              if (due && !alreadyNotified) {
                // Streaming watch providers only make sense for the digital
                // release - never append them to the cinema line.
                const providerStr = type === 'digital'
                  ? formatProviders(movie.watch_providers)
                  : ''
                const bucketLabel = date === todayStr ? `${label} today` : `${label} tomorrow`
                addNotification({
                  title: movie.title,
                  body: `${bucketLabel}${providerStr}`,
                  url: `/movie/${movie.tmdb_id}`,
                  tag: `movie:${movie.id}:${newRef}`,
                  icon: movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : undefined,
                  image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
                })
                pendingRefs.push(newRef)
              }
            }

            if (pendingRefs.length > 0) {
              movieRefUpdates.set(movie.id, {
                refs: pendingRefs,
                existingRefs: movie.last_movie_notified_ref || '[]',
              })
            }

            const futureDates = releases
              .map(r => r.date)
              .filter((d): d is string => !!d && d > todayStr)
              .sort()

            if (!movie.next_air_at && futureDates.length > 0) {
              await supabase
                .from('watchlist')
                .update({ next_air_at: futureDates[0] })
                .eq('id', movie.id)
              stats.itemsScheduled++
            } else if (movie.next_air_at) {
              const existingRefs = getMovieNotifiedRefs(movie.last_movie_notified_ref)
              const notifiedDates = existingRefs
                .map(ref => ref.match(/^(theatrical|digital):([^:]+):/)?.[2])
                .filter((d): d is string => !!d)
              const allFutureNotified = futureDates.every(d => notifiedDates.includes(d))
              if (allFutureNotified && futureDates.length > 0) {
                await supabase
                  .from('watchlist')
                  .update({ next_air_at: null })
                  .eq('id', movie.id)
              }
            }
          }
        }

        if (notifications.length === 0) {
          pendingRunUpserts.push({ user_id: userId, last_completed_at: now.toISOString() })
          return
        }

        const { data: subscriptions } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, keys, platform, token')
          .eq('user_id', userId)

        if (!subscriptions || subscriptions.length === 0) {
          pendingRunUpserts.push({ user_id: userId, last_completed_at: now.toISOString() })
          return
        }

        stats.usersProcessed++

        await mapWithConcurrency(
          notifications,
          async (notification) => {
            let delivered = false
            for (const sub of subscriptions as SubscriptionRow[]) {
              try {
                await sendToSubscription(sub, { ...notification, write: undefined })
                stats.notificationsSent++
                delivered = true
              } catch (error) {
                const statusCode = (error as { statusCode?: number }).statusCode
                if (statusCode === 404 || statusCode === 410) {
                  const { error: deleteError } = await supabase
                    .from('push_subscriptions')
                    .delete()
                    .eq('id', sub.id)
                  if (!deleteError) stats.staleSubscriptionsRemoved++
                } else {
                  console.error(`Failed to send push to ${sub.platform}/${sub.endpoint || sub.token}:`, error)
                  stats.errors++
                }
              }
            }

            if (delivered && notification.write) {
              await supabase
                .from('watchlist')
                .update(notification.write.patch)
                .eq('id', notification.write.id)
            }
          },
          PUSH_CONCURRENCY
        )

        for (const [movieId, { refs, existingRefs }] of movieRefUpdates) {
          const prev = existingRefs.startsWith('[') ? JSON.parse(existingRefs) : (existingRefs ? [existingRefs] : [])
          const combined = [...new Set([...prev, ...refs])]
          await supabase
            .from('watchlist')
            .update({ last_movie_notified_ref: JSON.stringify(combined) })
            .eq('id', movieId)
        }

        pendingRunUpserts.push({ user_id: userId, last_completed_at: now.toISOString() })
      } catch (error) {
        console.error(`Failed to process user ${userId}:`, error)
        stats.errors++
      }
    }

    if (targetUserId) {
      await processUserId(targetUserId)

      const profile = profileMap.get(targetUserId) ?? {}
      const timezone = typeof profile.timezone === 'string' ? profile.timezone : 'UTC'
      const tomorrowStr = tomorrowInTimezone(timezone, now)
      const { count } = await supabase
        .from('watchlist')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId)
        .not('next_air_at', 'is', null)
        .gt('next_air_at', tomorrowStr)
      stats.totalScheduled = count ?? 0
    } else {
      await mapWithConcurrency(userIds, processUserId, USER_CONCURRENCY)
    }

    // Batch all throttle upserts in one round trip.
    if (pendingRunUpserts.length > 0) {
      const { error: upsertError } = await supabase
        .from('notification_check_runs')
        .upsert(pendingRunUpserts)
      if (upsertError) {
        console.error('Failed to persist notification_check_runs:', upsertError)
        stats.errors++
      }
    }

    stats.showsHydrated = hydratedUniqueShows.size

    console.log(`notify-new-content done in ${Date.now() - invocationStart}ms`, JSON.stringify(stats))

    return new Response(
      JSON.stringify({
        users_processed: stats.usersProcessed,
        notifications_sent: stats.notificationsSent,
        items_scheduled: stats.itemsScheduled,
        total_scheduled: stats.totalScheduled,
        stale_subscriptions_removed: stats.staleSubscriptionsRemoved,
        shows_hydrated: stats.showsHydrated,
        users_throttled: stats.skippedThrottled,
        errors: stats.errors,
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
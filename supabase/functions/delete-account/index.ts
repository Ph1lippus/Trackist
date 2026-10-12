// Deletes a user's account and every row that belongs to it.
//
// Two callers:
//   - the user, deleting their own account from Settings
//   - an admin, deleting someone else's from /admin
//
// Every delete runs through the service-role client. The old version used the
// caller's own session, so Row Level Security silently blocked the deletes and
// the function still answered `{ success: true }`. That left accounts intact
// while reporting success.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nonce',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Note the spelling: "track1st", not "trackist". The old list used the wrong
// domain, so every production request was rejected with 403 before it ran.
const allowedOrigins = [
  'https://track1st.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  // Capacitor serves the native app from this origin.
  'https://localhost',
  'capacitor://localhost',
]

// `.in()` builds a query string, so a few hundred UUIDs overflow the URL.
// Chunking keeps each request well inside the limit.
const CHUNK = 50

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const chunked = <T>(items: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const origin = req.headers.get('Origin') || req.headers.get('Referer') || ''
  const isAllowed = allowedOrigins.some((allowed) => origin.startsWith(allowed))
  if (!isAllowed) {
    return json({ error: `Origin not allowed: ${origin || '(none)'}` }, 403)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return json({ error: 'Server misconfigured' }, 500)
  }

  // One client with the caller's token identifies them; a second with the
  // service role does the writing.
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })

  try {
    const { data: { user: callerUser }, error: callerError } = await caller.auth.getUser()
    if (callerError || !callerUser) return json({ error: 'Unauthorized' }, 401)

    const { data: callerProfile } = await caller
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle()

    const isAdmin = callerProfile?.role === 'admin'

    let targetUserId = callerUser.id

    const raw = req.method === 'POST' ? await req.text() : ''
    if (raw) {
      let body: { userId?: string } = {}
      try {
        body = JSON.parse(raw)
      } catch {
        return json({ error: 'Invalid JSON body' }, 400)
      }

      if (body.userId && body.userId !== callerUser.id) {
        if (!isAdmin) return json({ error: 'Not allowed to delete another account' }, 403)
        targetUserId = body.userId
      }
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const failures: string[] = []

    // Records a failure instead of aborting, so one blocked table cannot leave
    // the account half-deleted with no explanation.
    const step = async (label: string, run: () => Promise<{ error: { message: string } | null }>) => {
      const { error } = await run()
      if (error) {
        console.error(`delete-account: ${label} failed:`, error.message)
        failures.push(`${label}: ${error.message}`)
      }
    }

    // Children first, so foreign keys never block the parent delete.
    const { data: watchlists } = await admin
      .from('watchlist')
      .select('id')
      .eq('user_id', targetUserId)
    const watchlistIds = (watchlists ?? []).map((w) => w.id as string)
    for (const ids of chunked(watchlistIds)) {
      await step('watchlist_episodes', () =>
        admin.from('watchlist_episodes').delete().in('watchlist_id', ids))
    }

    const { data: lists } = await admin.from('lists').select('id').eq('user_id', targetUserId)
    const listIds = (lists ?? []).map((l) => l.id as string)
    for (const ids of chunked(listIds)) {
      await step('list_items', () => admin.from('list_items').delete().in('list_id', ids))
      await step('list_follows', () => admin.from('list_follows').delete().in('list_id', ids))
    }

    await step('list_follows (follower)', () =>
      admin.from('list_follows').delete().eq('user_id', targetUserId))
    await step('watchlist', () => admin.from('watchlist').delete().eq('user_id', targetUserId))
    await step('lists', () => admin.from('lists').delete().eq('user_id', targetUserId))
    await step('user_follows', () =>
      admin.from('user_follows').delete().or(`follower_id.eq.${targetUserId},followed_id.eq.${targetUserId}`))
    await step('profiles', () => admin.from('profiles').delete().eq('id', targetUserId))
    await step('user_sessions', () => admin.from('user_sessions').delete().eq('user_id', targetUserId))
    await step('user_mfa_backup_codes', () =>
      admin.from('user_mfa_backup_codes').delete().eq('user_id', targetUserId))
    await step('push_subscriptions', () =>
      admin.from('push_subscriptions').delete().eq('user_id', targetUserId))
    await step('notification_check_runs', () =>
      admin.from('notification_check_runs').delete().eq('user_id', targetUserId))
    await step('auth_audit_log', () => admin.from('auth_audit_log').delete().eq('user_id', targetUserId))
    await step('blocked_ips', () => admin.from('blocked_ips').delete().eq('created_by', targetUserId))

    const { error: authError } = await admin.auth.admin.deleteUser(targetUserId)
    if (authError) {
      console.error('delete-account: auth.admin.deleteUser failed:', authError.message)
      failures.push(`auth user: ${authError.message}`)
    }

    if (failures.length > 0) {
      return json({
        error: 'Account data could not be fully removed.',
        details: failures,
      }, 500)
    }

    return json({ success: true })
  } catch (error) {
    console.error('delete-account: unexpected error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
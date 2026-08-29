# Trackist Notification System - Deployment Guide

## Overview
This guide covers the complete setup for the new hourly notification system with timezone awareness, provider detection, digital movie release tracking, and manual "Check Now" functionality.

---

## 1. Database Migration

Run the following SQL in **Supabase Dashboard → SQL Editor**:

```sql
-- File: supabase/migrations/20260829_notification_enhancements.sql

-- 1. Profiles: notification preferences + timezone + country
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS notify_hour time DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS country_code char(2) DEFAULT 'PT',
ADD COLUMN IF NOT EXISTS movie_notify_on_digital boolean DEFAULT true;

-- 2. Watchlist: movie digital release tracking + provider cache
ALTER TABLE watchlist 
ADD COLUMN IF NOT EXISTS digital_release_date date,
ADD COLUMN IF NOT EXISTS last_movie_notified_ref text,
ADD COLUMN IF NOT EXISTS watch_providers jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_provider_sync timestamptz;

-- 3. Indexes for hourly query performance
CREATE INDEX IF NOT EXISTS idx_watchlist_next_air_at ON watchlist (next_air_at) WHERE media_type = 'tv';
CREATE INDEX IF NOT EXISTS idx_watchlist_digital_release ON watchlist (digital_release_date) WHERE media_type = 'movie';
CREATE INDEX IF NOT EXISTS idx_watchlist_last_provider_sync ON watchlist (last_provider_sync);

-- 4. Fix existing users with default UTC timezone
UPDATE profiles SET timezone = 'Europe/Lisbon', country_code = 'PT' 
WHERE timezone = 'UTC' OR timezone IS NULL;
```

---

## 2. Environment Variables (Required)

Add these to **Supabase Dashboard → Edge Functions → Environment Variables**:

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `TMDB_API_KEY` | TMDB API v3 key | https://www.themoviedb.org/settings/api |
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (secret) | Supabase Dashboard → Settings → API |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key | Generate with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key | Same as above |
| `VAPID_SUBJECT` | VAPID subject (mailto: or https://) | e.g., `mailto:admin@yourdomain.com` |


| `CRON_SECRET` | Secret for cron authentication | Generate random string: `openssl rand -hex 32` |

**Frontend (.env):**
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_TMDB_API_KEY=your_tmdb_key
VITE_PUSH_VAPID_PUBLIC_KEY=your_vapid_public_key
```

---

## 3. Edge Function Deployment

Deploy all 4 functions via **Supabase CLI** or Dashboard:

```bash
# Deploy all functions
supabase functions deploy notify-new-content
supabase functions deploy sync-movie-releases
supabase functions deploy sync-watch-providers
supabase functions deploy check-new-seasons
```

Or use the Dashboard: **Edge Functions → Create new function** for each.

---

## 4. Cron Job Configuration

In **Supabase Dashboard → Edge Functions → Cron Jobs**, add these 4 schedules:

| Function | Schedule (UTC) | Description |
|----------|----------------|-------------|
| `notify-new-content` | `0 * * * *` (hourly) | Main notification check - runs every hour |
| `sync-movie-releases` | `0 3 * * *` (03:00 UTC) | Sync digital release dates for movies |
| `sync-watch-providers` | `0 4 * * *` (04:00 UTC) | Sync streaming/rent/buy providers |
| `check-new-seasons` | `0 5 * * *` (05:00 UTC) | Check for new TV seasons |

**For each cron job, add header:**
```
x-cron-secret: YOUR_CRON_SECRET_VALUE
```

---

## 5. VAPID Key Generation

```bash
npx web-push generate-vapid-keys
```

Output:
```
Public Key:  BXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Private Key: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Add both to Supabase Edge Function environment variables.

---

## 6. Initial Data Backfill (Run Once After Deploy)

In **Supabase Dashboard → SQL Editor**, run:

```sql
-- Reset all TV shows to trigger backfill on next hourly run
UPDATE watchlist 
SET next_air_at = NULL, 
    last_season_check = NOW() - INTERVAL '2 hours'
WHERE media_type = 'tv';

-- Trigger provider sync for all users (optional - will run daily via cron)
-- This can also be done manually via the "Check Now" button in Settings
```

Then manually trigger each function once to populate initial data:
- `sync-movie-releases` (populates `digital_release_date`)
- `sync-watch-providers` (populates `watch_providers`)
- `check-new-seasons` (updates `last_season_number`)

---

## 7. Features Enabled

### TV Shows (Hourly Checks)
- Checks every hour for episodes airing **today or tomorrow** in user's timezone
- Bundles multiple episodes from same show into single notification
- Includes streaming providers in notification body
- Handles anime (stored as `media_type='tv'`) identically

### Movies (Daily + Hourly)
- `sync-movie-releases` finds **Digital (Type 4)** releases only - ignores theatrical
- Notifies when movie hits streaming/rental in user's country
- Includes all providers (flatrate + rent + buy)

### Timezone & Country
- Auto-detected on first notification enable
- Manually overrideable in Settings
- 400+ timezones searchable
- 250 countries searchable

### Manual "Check Now"
- Button in Settings → Notifications
- Triggers immediate check for current user only
- Shows results: notifications sent, items scheduled

---

## 7. Verification Checklist

After deployment, verify:

- [ ] Run migration SQL successfully
- [ ] All 4 edge functions deployed without errors
- [ ] 4 cron jobs created with correct schedules and `x-cron-secret` header
- [ ] Environment variables set in Supabase Edge Functions
- [ ] Frontend .env has `VITE_PUSH_VAPID_PUBLIC_KEY`
- [ ] Test user: enable notifications in Settings
- [ ] Test user: timezone auto-detects correctly
- [ ] Test user: "Check Now" button works
- [ ] Check Supabase logs for hourly function runs
- [ ] Verify `next_air_at` gets populated for TV shows
- [ ] Verify `digital_release_date` populated for movies
- [ ] Verify `watch_providers` populated for both

---

## 8. Troubleshooting

### No notifications received
1. Check cron job logs in Supabase Dashboard → Edge Functions → Logs
2. Verify `push_subscriptions` table has entries for user
3. Check user profile has `notify_new_episode = true`
4. Verify timezone/country_code are set

### Wrong episodes notified
1. Check `last_season_number` matches TMDB current season
2. Run `check-new-seasons` manually to update
3. Verify TMDB air dates are correct for the show

### Movies not notifying for digital release
1. Check `digital_release_date` column populated
2. Verify `movie_notify_on_digital = true` in profile
3. Check `sync-movie-releases` cron ran successfully
4. Verify TMDB release dates have Type 4 (Digital) for user's country

### Providers not showing
1. Check `watch_providers` column populated
2. Verify `sync-watch-providers` cron ran
3. Check TMDB watch/providers has data for user's country

---

## 9. Rate Limits

| Operation | Frequency | TMDB Calls/Run |
|-----------|-----------|----------------|
| notify-new-content | Hourly | ~200-500 (only due shows) |
| sync-movie-releases | Daily | ~1 per movie |
| sync-watch-providers | Daily | ~1 per item |
| check-new-seasons | Daily | ~1 per show |

**Well within TMDB limits** (40 req/10s = 14,400/hr)

---

## 10. Future Enhancements (Not Implemented)

- Per-show custom notification time
- Episode air time precision (TMDB doesn't provide exact times)
- Rich push notifications with images
- In-app notification center
- Email fallback for critical alerts
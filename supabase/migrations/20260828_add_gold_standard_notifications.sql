-- Migration: Gold-standard scheduled push notifications for Track1st
-- Paste this into the Supabase SQL Editor and run it.
--
-- What this adds (ONLY new columns on existing tables — NO new tables):
--   1. watchlist.next_air_at       - when the NEXT episode / release is due (per item, overwritten).
--   2. watchlist.last_notified_ref - dedup marker (e.g. 'S3E7', 'S2premiere', '2026-09-01').
--   3. profiles.timezone           - user's local timezone (auto-detected from browser).
--   4. A tiny filtered index so the frequent scheduler query stays cheap.
--
-- Why this is DB-light: these columns are OVERWRITTEN in place, never appended to.
-- One small value per watchlist item / per user = a few KB total even for large
-- libraries. There is deliberately NO growing notification log table.
--
-- Existing tables (push_subscriptions, watchlist, profiles) are unchanged otherwise.

-- ---------------------------------------------------------------------------
-- 1. Scheduling + dedup markers on watchlist
--    next_air_at stores the local air/release DATE (YYYY-MM-DD) of the next
--    episode/movie release. It is compared per-user in their own timezone,
--    which keeps scheduling correct regardless of UTC offset. Stored as text
--    to match TMDB's date-only strings and avoid any timezone-instant bugs.
-- ---------------------------------------------------------------------------
alter table public.watchlist
  add column if not exists next_air_at text,
  add column if not exists last_notified_ref text;

-- ---------------------------------------------------------------------------
-- 2. Per-user timezone (auto-detected from the browser when notifications are
--    enabled; used by the scheduler so "released today" and "airing now" are
--    interpreted in the user's own local time).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists timezone text default 'UTC';

-- ---------------------------------------------------------------------------
-- 3. Tiny filtered index for the frequent (every 15-30 min) scheduler lookup.
-- ---------------------------------------------------------------------------
create index if not exists idx_watchlist_next_air_due
  on public.watchlist(user_id, media_type)
  where next_air_at is not null;

-- ---------------------------------------------------------------------------
-- NOTE: No data removal is required. The old daily-batch behavior stored nothing
-- in the DB (notifications were computed on demand), so there is no history to
-- purge. push_subscriptions works exactly as before.
-- ---------------------------------------------------------------------------

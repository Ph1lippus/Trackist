-- Migration: New Architecture - watchlist_episodes stores ONLY watched episodes
-- 1. Add 'caught_up' to watchlist status check constraint
-- 2. Ensure watchlist_episodes has no watched/watched_at columns

-- Step 1: Alter watchlist status constraint to include 'caught_up'
ALTER TABLE public.watchlist 
DROP CONSTRAINT IF EXISTS watchlist_status_check;

ALTER TABLE public.watchlist 
ADD CONSTRAINT watchlist_status_check 
CHECK (status = ANY (ARRAY['planning'::text, 'watching'::text, 'completed'::text, 'dropped'::text, 'caught_up'::text]));

-- Step 2: Drop watched and watched_at columns from watchlist_episodes if they exist
ALTER TABLE public.watchlist_episodes 
DROP COLUMN IF EXISTS watched;

ALTER TABLE public.watchlist_episodes 
DROP COLUMN IF EXISTS watched_at;

-- Step 3: Add a unique constraint on (watchlist_id, season_number, episode_number) 
-- to prevent duplicate entries (same episode can't be watched twice)
ALTER TABLE public.watchlist_episodes 
DROP CONSTRAINT IF EXISTS watchlist_episodes_unique;

ALTER TABLE public.watchlist_episodes 
ADD CONSTRAINT watchlist_episodes_unique 
UNIQUE (watchlist_id, season_number, episode_number);
-- Add denormalized progress columns to watchlist table
-- Run this in Supabase SQL Editor

-- Add columns for watched episode count and next episode
ALTER TABLE public.watchlist
ADD COLUMN IF NOT EXISTS watched_episodes_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_season_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS next_episode_number integer DEFAULT 1;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_watchlist_user_status ON public.watchlist(user_id, status);

-- Comments
COMMENT ON COLUMN public.watchlist.watched_episodes_count IS 'Cached count of watched episodes from watchlist_episodes table';
COMMENT ON COLUMN public.watchlist.next_season_number IS 'Cached next episode season number';
COMMENT ON COLUMN public.watchlist.next_episode_number IS 'Cached next episode episode number';

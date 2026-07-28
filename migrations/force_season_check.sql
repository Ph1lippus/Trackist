-- Force all TV shows to have stale last_season_check (older than 6 hours)
-- This will trigger the Edge Function immediately when users visit Upcoming page

UPDATE public.watchlist
SET last_season_check = NOW() - INTERVAL '7 hours'
WHERE media_type = 'tv';

-- Verify
SELECT COUNT(*) as stale_shows
FROM public.watchlist
WHERE media_type = 'tv'
  AND last_season_check < NOW() - INTERVAL '6 hours';

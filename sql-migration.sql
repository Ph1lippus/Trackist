-- Migration: Add database trigger to automatically update total_episodes and total_seasons
-- when a TV show is added to the watchlist (via the backend)
-- Run this in your Supabase SQL editor

-- Function to set default episode/season values for TV shows
CREATE OR REPLACE FUNCTION public.set_tv_show_defaults()
RETURNS TRIGGER AS $$
BEGIN
    -- Only apply to TV and anime media types
    IF NEW.media_type IN ('tv', 'anime') THEN
        -- If total_episodes is NULL or 0, set a default
        IF NEW.total_episodes IS NULL OR NEW.total_episodes = 0 THEN
            NEW.total_episodes := 0;
        END IF;
        
        -- If total_seasons is NULL or 0, set a default
        IF NEW.total_seasons IS NULL OR NEW.total_seasons = 0 THEN
            NEW.total_seasons := 1;
        END IF;
        
        -- If current_episode is NULL, set to 0
        IF NEW.current_episode IS NULL THEN
            NEW.current_episode := 0;
        END IF;
        
        -- If current_season is NULL, set to 1
        IF NEW.current_season IS NULL THEN
            NEW.current_season := 1;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS trg_set_tv_show_defaults ON public.watchlist;

-- Create the trigger
CREATE TRIGGER trg_set_tv_show_defaults
    BEFORE INSERT ON public.watchlist
    FOR EACH ROW
    EXECUTE FUNCTION public.set_tv_show_defaults();

-- Function to prevent duplicate episodes
CREATE OR REPLACE FUNCTION public.prevent_duplicate_episodes()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete existing episode with same season_number and episode_number for the same watchlist_id
    DELETE FROM public.watchlist_episodes
    WHERE watchlist_id = NEW.watchlist_id
      AND season_number = NEW.season_number
      AND episode_number = NEW.episode_number
      AND id != NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS trg_prevent_duplicate_episodes ON public.watchlist_episodes;

-- Create the trigger
CREATE TRIGGER trg_prevent_duplicate_episodes
    AFTER INSERT ON public.watchlist_episodes
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_duplicate_episodes();
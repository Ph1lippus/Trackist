-- Migration: Create get_my_watch_statistics function
-- This function calculates total episodes watched and watch time for a user

CREATE OR REPLACE FUNCTION public.get_my_watch_statistics()
RETURNS TABLE (
    total_episodes_watched bigint,
    total_watch_time_minutes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::bigint as total_episodes_watched,
        COALESCE(SUM(COALESCE(we.runtime, 0)), 0)::bigint as total_watch_time_minutes
    FROM public.watchlist_episodes we
    INNER JOIN public.watchlist w ON w.id = we.watchlist_id
    WHERE w.user_id = auth.uid();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_watch_statistics() TO authenticated;
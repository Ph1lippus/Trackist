-- Notification System Enhancements Migration
-- Run this in Supabase SQL Editor

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

-- 4. Helper: map timezone to country code (for auto-detect fallback)
-- This is a reference table, not created in DB - used in client code

-- 5. Update existing users' timezone if still default UTC (run after deploy)
-- UPDATE profiles SET timezone = 'Europe/Lisbon' WHERE timezone = 'UTC' OR timezone IS NULL;
-- UPDATE profiles SET country_code = 'PT' WHERE country_code = 'PT' AND (timezone = 'Europe/Lisbon' OR timezone = 'Europe/London');
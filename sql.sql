-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- ============================================================
-- PROFILES TABLE (with function creation)
-- ============================================================

-- Create the function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON profiles FOR DELETE USING (auth.uid() = id);

-- Anyone can view public profile data (for followers)
CREATE POLICY "Anyone can view public profiles" ON profiles FOR SELECT USING (true);

-- Index
CREATE INDEX idx_profiles_user_id ON profiles(id);

-- Trigger for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON USER SIGN-UP
-- ============================================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, display_name, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'username',
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        ),
        NEW.created_at,
        NEW.created_at
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on auth.users after insert
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

CREATE TABLE public.watchlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text, 'anime'::text])),
  tmdb_id integer,
  anilist_id integer,
  title text NOT NULL,
  poster_path text,
  overview text,
  release_date text,
  vote_average real,
  total_seasons integer DEFAULT 1,
  total_episodes integer DEFAULT 0,
  current_season integer DEFAULT 1,
  current_episode integer DEFAULT 0,
  status text DEFAULT 'planning'::text CHECK (status = ANY (ARRAY['planning'::text, 'watching'::text, 'completed'::text, 'dropped'::text])),
  rating integer CHECK (rating >= 0 AND rating <= 10),
  notes text,
  started_watching_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_watched_at timestamp with time zone,
  added_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watchlist_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watchlist_episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL,
  season_number integer NOT NULL DEFAULT 1,
  episode_number integer NOT NULL,
  tmdb_episode_id integer,
  anilist_episode_id integer,
  title text,
  still_path text,
  overview text,
  vote_average real,
  air_date date,
  runtime integer,
  watched boolean DEFAULT false,
  watched_at timestamp with time zone,
  user_rating integer CHECK (user_rating >= 0 AND user_rating <= 10),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watchlist_episodes_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_episodes_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES public.watchlist(id)
);


-- ============================================================
-- TRACKIST SOCIAL & BADGE SYSTEM (Complete)
-- ============================================================

-- ============================================================
-- 1. USER FOLLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_follow UNIQUE (follower_id, followed_id),
    CONSTRAINT no_self_follow CHECK (follower_id != followed_id)
);

-- ============================================================
-- 2. LISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 3. LIST ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS list_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv', 'anime')),
    tmdb_id INTEGER NOT NULL,
    anilist_id INTEGER,
    title TEXT NOT NULL,
    poster_path TEXT,
    overview TEXT,
    release_date TEXT,
    vote_average REAL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    watched_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_list_item UNIQUE (list_id, tmdb_id, media_type)
);

-- ============================================================
-- 4. VIEWING HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS viewing_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv', 'anime')),
    tmdb_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    poster_path TEXT,
    watched_date DATE NOT NULL DEFAULT CURRENT_DATE,
    list_item_id UUID REFERENCES list_items(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_watch_date UNIQUE (user_id, tmdb_id, watched_date)
);

-- ============================================================
-- 5. BADGES (with list_streak in constraint)
-- ============================================================

CREATE TABLE IF NOT EXISTS badges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    category TEXT CHECK (category IN ('streak', 'watch_count', 'list_completion', 'social', 'list_streak')),
    requirement_type TEXT CHECK (requirement_type IN ('streak_days', 'total_watches', 'list_count', 'list_completed', 'followers', 'list_streak_days')),
    requirement_value INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 6. USER BADGES
-- ============================================================

CREATE TABLE IF NOT EXISTS user_badges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_badge UNIQUE (user_id, badge_id)
);

-- ============================================================
-- 7. LIST FOLLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS list_follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_list_follow UNIQUE (user_id, list_id)
);

-- ============================================================
-- 8. DEFAULT BADGES
-- ============================================================

INSERT INTO badges (name, description, category, requirement_type, requirement_value) VALUES
-- Streak badges (overall)
('First Streak', 'Watch something for 3 days in a row', 'streak', 'streak_days', 3),
('Week Streak', 'Watch something for 7 days in a row', 'streak', 'streak_days', 7),
('Two Week Streak', 'Watch something for 14 days in a row', 'streak', 'streak_days', 14),
('Month Streak', 'Watch something for 30 days in a row', 'streak', 'streak_days', 30),
('Two Month Streak', 'Watch something for 60 days in a row', 'streak', 'streak_days', 60),
('Quarter Streak', 'Watch something for 90 days in a row', 'streak', 'streak_days', 90),
('Half Year Streak', 'Watch something for 180 days in a row', 'streak', 'streak_days', 180),
('Year Streak', 'Watch something for 365 days in a row', 'streak', 'streak_days', 365),
('Two Year Streak', 'Watch something for 730 days in a row', 'streak', 'streak_days', 730),

-- List Streak badges
('List Streak 3', 'Watch from the same list for 3 days in a row', 'list_streak', 'list_streak_days', 3),
('List Streak 7', 'Watch from the same list for 7 days in a row', 'list_streak', 'list_streak_days', 7),
('List Streak 14', 'Watch from the same list for 14 days in a row', 'list_streak', 'list_streak_days', 14),
('List Streak 30', 'Watch from the same list for 30 days in a row', 'list_streak', 'list_streak_days', 30),

-- Watch count badges
('First Watch', 'Watch your first movie or show', 'watch_count', 'total_watches', 1),
('5 Watched', 'Watch 5 movies or shows', 'watch_count', 'total_watches', 5),
('10 Watched', 'Watch 10 movies or shows', 'watch_count', 'total_watches', 10),
('25 Watched', 'Watch 25 movies or shows', 'watch_count', 'total_watches', 25),
('50 Watched', 'Watch 50 movies or shows', 'watch_count', 'total_watches', 50),
('75 Watched', 'Watch 75 movies or shows', 'watch_count', 'total_watches', 75),
('100 Watched', 'Watch 100 movies or shows', 'watch_count', 'total_watches', 100),
('250 Watched', 'Watch 250 movies or shows', 'watch_count', 'total_watches', 250),
('500 Watched', 'Watch 500 movies or shows', 'watch_count', 'total_watches', 500),
('750 Watched', 'Watch 750 movies or shows', 'watch_count', 'total_watches', 750),
('1000 Watched', 'Watch 1000 movies or shows', 'watch_count', 'total_watches', 1000),
('2500 Watched', 'Watch 2500 movies or shows', 'watch_count', 'total_watches', 2500),
('5000 Watched', 'Watch 5000 movies or shows', 'watch_count', 'total_watches', 5000),
('10000 Watched', 'Watch 10000 movies or shows', 'watch_count', 'total_watches', 10000),

-- List badges
('First List', 'Create your first list', 'list_completion', 'list_count', 1),
('5 Lists', 'Create 5 lists', 'list_completion', 'list_count', 5),
('10 Lists', 'Create 10 lists', 'list_completion', 'list_count', 10),
('25 Lists', 'Create 25 lists', 'list_completion', 'list_count', 25),
('50 Lists', 'Create 50 lists', 'list_completion', 'list_count', 50),
('100 Lists', 'Create 100 lists', 'list_completion', 'list_count', 100),

-- List Completion badges
('First List Complete', 'Complete all items in your first list', 'list_completion', 'list_completed', 1),
('5 Lists Complete', 'Complete 5 lists', 'list_completion', 'list_completed', 5),
('10 Lists Complete', 'Complete 10 lists', 'list_completion', 'list_completed', 10),
('25 Lists Complete', 'Complete 25 lists', 'list_completion', 'list_completed', 25),

-- Social badges
('First Follower', 'Get your first follower', 'social', 'followers', 1),
('5 Followers', 'Get 5 followers', 'social', 'followers', 5),
('10 Followers', 'Get 10 followers', 'social', 'followers', 10),
('25 Followers', 'Get 25 followers', 'social', 'followers', 25),
('50 Followers', 'Get 50 followers', 'social', 'followers', 50),
('100 Followers', 'Get 100 followers', 'social', 'followers', 100);

-- ============================================================
-- 9. TRIGGERS & FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION update_list_item_watched()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.list_item_id IS NOT NULL THEN
        UPDATE list_items
        SET watched_at = NEW.watched_date
        WHERE id = NEW.list_item_id
        AND watched_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_viewing_history_insert
AFTER INSERT ON viewing_history
FOR EACH ROW
EXECUTE FUNCTION update_list_item_watched();

CREATE OR REPLACE FUNCTION check_list_completion()
RETURNS TRIGGER AS $$
DECLARE
    total_items INT;
    watched_items INT;
BEGIN
    SELECT COUNT(*) INTO total_items
    FROM list_items
    WHERE list_id = NEW.list_id;

    SELECT COUNT(*) INTO watched_items
    FROM list_items
    WHERE list_id = NEW.list_id
    AND watched_at IS NOT NULL;

    IF total_items > 0 AND total_items = watched_items THEN
        UPDATE lists
        SET completed_at = NOW()
        WHERE id = NEW.list_id
        AND completed_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_list_item_update
AFTER UPDATE OF watched_at ON list_items
FOR EACH ROW
EXECUTE FUNCTION check_list_completion();

-- ============================================================
-- 10. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON user_follows(followed_id);
CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
CREATE INDEX IF NOT EXISTS idx_lists_is_public ON lists(is_public);
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_tmdb_id ON list_items(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_list_items_watched_at ON list_items(watched_at);
CREATE INDEX IF NOT EXISTS idx_viewing_history_user_date ON viewing_history(user_id, watched_date);
CREATE INDEX IF NOT EXISTS idx_viewing_history_user_tmdb ON viewing_history(user_id, tmdb_id);
CREATE INDEX IF NOT EXISTS idx_viewing_history_list_item ON viewing_history(list_item_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_list_follows_user_id ON list_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_list_follows_list_id ON list_follows(list_id);

-- ============================================================
-- 11. RLS POLICIES
-- ============================================================

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view follows" ON user_follows FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON user_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow others" ON user_follows FOR DELETE USING (auth.uid() = follower_id);

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view public lists" ON lists FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users can insert own lists" ON lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lists" ON lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lists" ON lists FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view public list items" ON list_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_items.list_id AND (lists.is_public = true OR lists.user_id = auth.uid()))
);
CREATE POLICY "Users can insert own list items" ON list_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_items.list_id AND lists.user_id = auth.uid())
);
CREATE POLICY "Users can update own list items" ON list_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_items.list_id AND lists.user_id = auth.uid())
);
CREATE POLICY "Users can delete own list items" ON list_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_items.list_id AND lists.user_id = auth.uid())
);

ALTER TABLE viewing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own viewing history" ON viewing_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own viewing history" ON viewing_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own viewing history" ON viewing_history FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view badges" ON badges FOR SELECT USING (true);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own badges" ON user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own badges" ON user_badges FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE list_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own list follows" ON list_follows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view public list follows" ON list_follows FOR SELECT USING (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_follows.list_id AND lists.is_public = true)
);
CREATE POLICY "Users can follow lists" ON list_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unfollow lists" ON list_follows FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 12. VIEWS (with SECURITY INVOKER)
-- ============================================================

CREATE OR REPLACE VIEW user_streak WITH (security_invoker = true) AS
WITH daily_watches AS (
    SELECT DISTINCT watched_date
    FROM viewing_history
    WHERE user_id = auth.uid()
    ORDER BY watched_date DESC
),
streak_calc AS (
    SELECT 
        watched_date,
        ROW_NUMBER() OVER (ORDER BY watched_date DESC) AS rn
    FROM daily_watches
)
SELECT COUNT(*) AS current_streak
FROM streak_calc
WHERE watched_date = CURRENT_DATE - (rn - 1) * INTERVAL '1 day';

CREATE OR REPLACE VIEW user_total_watches WITH (security_invoker = true) AS
SELECT 
    user_id,
    COUNT(*) AS total_watches
FROM viewing_history
GROUP BY user_id;

CREATE OR REPLACE VIEW list_stats WITH (security_invoker = true) AS
SELECT 
    l.id,
    l.title,
    l.description,
    l.is_public,
    l.user_id,
    l.completed_at,
    COUNT(DISTINCT li.id) AS item_count,
    COUNT(DISTINCT li.watched_at) AS watched_count,
    COUNT(DISTINCT lf.user_id) AS follower_count,
    CASE 
        WHEN COUNT(DISTINCT li.id) > 0 
        AND COUNT(DISTINCT li.watched_at) = COUNT(DISTINCT li.id) 
        THEN true 
        ELSE false 
    END AS is_completed
FROM lists l
LEFT JOIN list_items li ON l.id = li.list_id
LEFT JOIN list_follows lf ON l.id = lf.list_id
GROUP BY l.id;

CREATE OR REPLACE VIEW user_follower_counts WITH (security_invoker = true) AS
SELECT 
    followed_id AS user_id,
    COUNT(*) AS follower_count
FROM user_follows
GROUP BY followed_id;

CREATE OR REPLACE VIEW list_streak WITH (security_invoker = true) AS
WITH daily_list_watches AS (
    SELECT 
        vh.user_id,
        vh.watched_date,
        li.list_id
    FROM viewing_history vh
    JOIN list_items li ON vh.list_item_id = li.id
    WHERE vh.user_id = auth.uid()
    GROUP BY vh.user_id, vh.watched_date, li.list_id
    ORDER BY vh.watched_date DESC
),
streak_calc AS (
    SELECT 
        list_id,
        watched_date,
        ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY watched_date DESC) AS rn
    FROM daily_list_watches
)
SELECT 
    list_id,
    COUNT(*) AS current_streak
FROM streak_calc
WHERE watched_date = CURRENT_DATE - (rn - 1) * INTERVAL '1 day'
GROUP BY list_id;
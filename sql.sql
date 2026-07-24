-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
CREATE TABLE public.user_follows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  followed_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (id),
  CONSTRAINT user_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id),
  CONSTRAINT user_follows_followed_id_fkey FOREIGN KEY (followed_id) REFERENCES auth.users(id)
);
CREATE TABLE public.lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  is_public boolean DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lists_pkey PRIMARY KEY (id),
  CONSTRAINT lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.list_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text, 'anime'::text])),
  tmdb_id integer NOT NULL,
  anilist_id integer,
  title text NOT NULL,
  poster_path text,
  overview text,
  release_date text,
  vote_average real,
  added_at timestamp with time zone DEFAULT now(),
  watched_at timestamp with time zone,
  CONSTRAINT list_items_pkey PRIMARY KEY (id),
  CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id)
);
CREATE TABLE public.viewing_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text, 'anime'::text])),
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  poster_path text,
  watched_date date NOT NULL DEFAULT CURRENT_DATE,
  list_item_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT viewing_history_pkey PRIMARY KEY (id),
  CONSTRAINT viewing_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT viewing_history_list_item_id_fkey FOREIGN KEY (list_item_id) REFERENCES public.list_items(id)
);
CREATE TABLE public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  category text CHECK (category = ANY (ARRAY['streak'::text, 'watch_count'::text, 'list_completion'::text, 'social'::text, 'list_streak'::text])),
  requirement_type text CHECK (requirement_type = ANY (ARRAY['streak_days'::text, 'total_watches'::text, 'list_count'::text, 'list_completed'::text, 'followers'::text, 'list_streak_days'::text])),
  requirement_value integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT badges_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL,
  earned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id)
);
CREATE TABLE public.list_follows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  list_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT list_follows_pkey PRIMARY KEY (id),
  CONSTRAINT list_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT list_follows_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
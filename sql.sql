-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.watchlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text])),
  tmdb_id integer,
  title text NOT NULL,
  poster_path text,
  overview text,
  release_date text,
  vote_average real,
  total_seasons integer DEFAULT 1,
  total_episodes integer DEFAULT 0,
  current_season integer DEFAULT 1,
  current_episode integer DEFAULT 0,
  status text DEFAULT 'planning'::text CHECK (status = ANY (ARRAY['planning'::text, 'watching'::text, 'completed'::text, 'dropped'::text, 'caught_up'::text])),
  started_watching_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_watched_at timestamp with time zone,
  added_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_season_number integer DEFAULT 1,
  last_season_check timestamp with time zone,
  watched_episodes_count integer DEFAULT 0,
  next_season_number integer DEFAULT 1,
  next_episode_number integer DEFAULT 1,
  CONSTRAINT watchlist_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watchlist_episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL,
  season_number integer NOT NULL DEFAULT 1,
  episode_number integer NOT NULL,
  tmdb_episode_id integer,
  title text,
  still_path text,
  overview text,
  vote_average real,
  air_date date,
  runtime integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watchlist_episodes_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_episodes_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES public.watchlist(id),
  CONSTRAINT watchlist_episodes_watchlist_id_season_episode_key UNIQUE (watchlist_id, season_number, episode_number)
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
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text])),
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  poster_path text,
  overview text,
  release_date text,
  vote_average real,
  added_at timestamp with time zone DEFAULT now(),
  watched_at timestamp with time zone,
  position integer DEFAULT 0,
  CONSTRAINT list_items_pkey PRIMARY KEY (id),
  CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id)
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
  role text NOT NULL DEFAULT 'user'::text,
  show_stremio_button boolean NOT NULL DEFAULT false,
  show_letterbox_button boolean NOT NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
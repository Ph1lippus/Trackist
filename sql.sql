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
  status text DEFAULT 'planning'::text CHECK (status = ANY (ARRAY['planning'::text, 'watching'::text, 'paused'::text, 'completed'::text, 'dropped'::text, 'caught_up'::text])),
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
  next_air_at text,
  last_notified_ref text,
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
  display_name text UNIQUE,
  bio text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role text NOT NULL DEFAULT 'user'::text,
  show_stremio_button boolean NOT NULL DEFAULT false,
  show_letterbox_button boolean NOT NULL DEFAULT false,
  show_media_card_icons boolean NOT NULL DEFAULT false,
  notify_new_episode boolean NOT NULL DEFAULT true,
  notify_new_season boolean NOT NULL DEFAULT true,
  notify_release_date boolean NOT NULL DEFAULT true,
  timezone text DEFAULT 'UTC'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text NOT NULL,
  device_info jsonb,
  ip_hash text,
  location text,
  created_at timestamp with time zone DEFAULT now(),
  last_active timestamp with time zone DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_mfa_backup_codes (
  user_id uuid NOT NULL,
  codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_mfa_backup_codes_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_mfa_backup_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.auth_audit_log (
  id bigint NOT NULL DEFAULT nextval('auth_audit_log_id_seq'::regclass),
  user_id uuid,
  event_type text NOT NULL,
  ip_hash text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  risk_score integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT auth_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT auth_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.blocked_ips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL UNIQUE,
  reason text NOT NULL,
  attempt_count integer DEFAULT 0,
  blocked_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  created_by uuid,
  CONSTRAINT blocked_ips_pkey PRIMARY KEY (id),
  CONSTRAINT blocked_ips_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(keys) = 'object'::text),
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  last_seen timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);



Policies
Manage Row Level Security policies for your tables

Docs

schema

public

Filter tables and policies
auth_audit_log

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins can view all audit logs
SELECT	
public


Service role can insert audit logs
INSERT	
public


Users can view own audit logs
SELECT	
public

blocked_ips

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins can manage blocked IPs
ALL	
public

list_follows

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can follow lists
INSERT	
public


Users can unfollow lists
DELETE	
public


Users can view own list follows
SELECT	
public


Users can view public list follows
SELECT	
public

list_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own list items
DELETE	
public


Users can insert own list items
INSERT	
public


Users can update own list items
UPDATE	
public


Users can view public list items
SELECT	
public

lists

Disable RLS

Create policy

Name	Command	Applied to	Actions

Public read lists
SELECT	
public


Users can delete own lists
DELETE	
public


Users can insert own lists
INSERT	
public


Users can update own lists
UPDATE	
public


Users can view public lists
SELECT	
public

profiles

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins can update roles
UPDATE	
authenticated


Admins can view all profiles
SELECT	
authenticated


Anyone can view public profiles
SELECT	
public


Users can delete own profile
DELETE	
public


Users can insert own profile
INSERT	
public


Users can update own profile
UPDATE	
authenticated


Users can view own profile
SELECT	
authenticated


Users manage own profile
ALL	
public

user_follows

Disable RLS

Create policy

Name	Command	Applied to	Actions

Anyone can view follows
SELECT	
public


Users can follow others
INSERT	
public


Users can unfollow others
DELETE	
public


Users manage own follows
ALL	
public

user_mfa_backup_codes

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can insert own backup codes
INSERT	
public


Users can update own backup codes
UPDATE	
public


Users can view own backup codes
SELECT	
public

user_sessions

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own sessions
DELETE	
public


Users can insert own sessions
INSERT	
public


Users can update own sessions
UPDATE	
public


Users can view own sessions
SELECT	
public

watchlist

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins can view all watchlist items
SELECT	
authenticated


Public read watchlist
SELECT	
public


Users can delete own watchlist
DELETE	
public


Users can insert own watchlist
INSERT	
public


Users can update own watchlist
UPDATE	
public


Users can view own watchlist
SELECT	
public


Users manage own watchlist
ALL	
public

watchlist_episodes

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins can view all watchlist episodes
SELECT	
authenticated


Users can delete own episodes
DELETE	
public


Users can insert own episodes
INSERT	
public


Users can update own episodes
UPDATE	
public


Users can view own episodes
SELECT	
public





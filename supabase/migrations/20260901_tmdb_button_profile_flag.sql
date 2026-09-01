-- Add TMDB detail action toggle to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_tmdb_button boolean NOT NULL DEFAULT false;

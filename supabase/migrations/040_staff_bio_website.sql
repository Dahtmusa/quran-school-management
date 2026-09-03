-- Migration 040: Add bio and show_on_website to staff profiles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio            text,
  ADD COLUMN IF NOT EXISTS show_on_website boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

-- Migration 052: Add qualifications, experience, subjects columns
-- to both staff profiles and leadership team profiles.
-- These columns were referenced in queries but never created, causing
-- loadStaffProfiles() to silently return [] for all admin pages.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS experience     text,
  ADD COLUMN IF NOT EXISTS subjects       text;

ALTER TABLE public.public_team_profiles
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS experience     text,
  ADD COLUMN IF NOT EXISTS subjects       text;

NOTIFY pgrst, 'reload schema';

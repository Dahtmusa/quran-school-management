-- Migration 062: Add State of Origin and Local Government Area to student profiles.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS state_of_origin  text,
  ADD COLUMN IF NOT EXISTS local_government text;

-- Migration 039: Extended student profile, report card, and admissions fields

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS blood_group              text,
  ADD COLUMN IF NOT EXISTS genotype                 text,
  ADD COLUMN IF NOT EXISTS home_address             text,
  ADD COLUMN IF NOT EXISTS nationality              text DEFAULT 'Nigerian',
  ADD COLUMN IF NOT EXISTS parent_name              text,
  ADD COLUMN IF NOT EXISTS parent_phone             text,
  ADD COLUMN IF NOT EXISTS parent_email             text,
  ADD COLUMN IF NOT EXISTS guardian_name            text,
  ADD COLUMN IF NOT EXISTS guardian_phone           text,
  ADD COLUMN IF NOT EXISTS guardian_email           text,
  ADD COLUMN IF NOT EXISTS guardian_relationship    text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name   text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone  text;

ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS next_term_start  date,
  ADD COLUMN IF NOT EXISTS day_fee          numeric(10,2),
  ADD COLUMN IF NOT EXISTS boarding_fee     numeric(10,2),
  ADD COLUMN IF NOT EXISTS principal_remark text;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS genotype    text;

NOTIFY pgrst, 'reload schema';

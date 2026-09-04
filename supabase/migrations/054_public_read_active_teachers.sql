-- Migration 054: Allow public (anon) reads of active teacher profiles.
--
-- loadPublicTeachers() on the public homepage runs as an anonymous visitor.
-- No SELECT policy existed for anon on the profiles table, so the query
-- returned [] — making the Teaching Staff section show no teachers publicly.

CREATE POLICY "public read active teachers"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (role = 'teacher' AND employment_status = 'active');

NOTIFY pgrst, 'reload schema';

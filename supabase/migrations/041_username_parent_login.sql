-- Migration 041: Username login for teachers + parent phone login support

-- Add username column to profiles (unique, nullable)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Ensure parents can read their own parent_students rows
DROP POLICY IF EXISTS "parents read own parent links" ON public.parent_students;
CREATE POLICY "parents read own parent links" ON public.parent_students
  FOR SELECT TO authenticated
  USING (
    parent_id = auth.uid()
    OR public.my_role() IN ('super_admin','admin','principal','admissions','finance')
  );

NOTIFY pgrst, 'reload schema';

-- Migration 037: Fix my_role() returning NULL for all users.
--
-- Root cause: public.profiles has RLS enabled but no SELECT policy allows
-- a user to read their own row. my_role() calls
--   SELECT role FROM profiles WHERE id = auth.uid()
-- which RLS blocks, so it returns NULL for every user. Every downstream
-- RLS check that depends on my_role() then silently fails.
--
-- Fix: add the missing "users read own profile" policy.
-- This one policy restores correct role-based access across the entire system:
-- evaluation campaigns, evaluations, students, calendar, fees, etc.

DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins should also be able to read all profiles (needed for staff management).
-- Use a safe pattern: check role via a security-definer helper to avoid
-- recursive RLS on profiles itself.
CREATE OR REPLACE FUNCTION public.is_admin_role()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role IN ('super_admin','admin','principal')
  FROM public.profiles
  WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin_role());

NOTIFY pgrst, 'reload schema';

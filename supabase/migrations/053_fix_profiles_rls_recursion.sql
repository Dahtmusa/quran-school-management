-- Migration 053: Fix infinite recursion in profiles RLS.
--
-- The "admins read profiles" policy used my_role() which is SECURITY INVOKER.
-- my_role() does: SELECT role FROM profiles WHERE id = auth.uid()
-- That inner SELECT triggers RLS on profiles again, which calls my_role() again
-- → PostgreSQL detects infinite recursion and aborts with an error.
-- The error is silently swallowed in loadStaffProfiles(), returning [].
-- Result: admins see 0 teachers / 0 staff everywhere in the admin panel.
--
-- Fix: use a SECURITY DEFINER helper that bypasses RLS when reading profiles,
-- breaking the recursion chain.

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

DROP POLICY IF EXISTS "admins read profiles" ON public.profiles;
CREATE POLICY "admins read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin_role());

NOTIFY pgrst, 'reload schema';

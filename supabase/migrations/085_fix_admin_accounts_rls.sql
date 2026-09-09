-- Migration 085: Fix admin accounts not visible + public_team_profiles RLS error.
--
-- Root causes identified:
-- 1. "admins read all profiles" policy depends on is_admin_role() which must be
--    SECURITY DEFINER to avoid recursive RLS. Idempotently recreating it here
--    ensures it is correct in production.
-- 2. "admins manage team profiles" on public_team_profiles similarly depends on
--    my_role() being SECURITY DEFINER. Idempotently recreating that policy.
-- 3. Backfills profiles.email from auth.users for any rows where it is NULL,
--    so admin credential modals always have the current login email.

-- ─── Step 1: Ensure my_role() is SECURITY DEFINER ───────────────────────────
CREATE OR REPLACE FUNCTION public.my_role()
  RETURNS public.user_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated;

-- ─── Step 2: Ensure is_admin_role() is SECURITY DEFINER ─────────────────────
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

GRANT EXECUTE ON FUNCTION public.is_admin_role() TO authenticated;

-- ─── Step 3: Recreate profiles SELECT policies ───────────────────────────────
-- Users must be able to read their own profile (needed for my_role() via RLS-bypass
-- is already done by SECURITY DEFINER, but direct SELECT still needs this).
DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can read ALL profiles (needed for Accounts & Access tab).
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin_role());

-- ─── Step 4: Recreate public_team_profiles admin policy ─────────────────────
-- Ensures admins can INSERT/UPDATE/DELETE leadership profiles.
DROP POLICY IF EXISTS "admins manage team profiles" ON public.public_team_profiles;
CREATE POLICY "admins manage team profiles"
  ON public.public_team_profiles
  FOR ALL
  TO authenticated
  USING (public.my_role() IN ('super_admin','admin','principal'))
  WITH CHECK (public.my_role() IN ('super_admin','admin','principal'));

-- ─── Step 5: Backfill profiles.email from auth.users ────────────────────────
-- Any profile missing email gets it filled from auth.users.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- ─── Step 6: Reload PostgREST schema cache ──────────────────────────────────
NOTIFY pgrst, 'reload schema';

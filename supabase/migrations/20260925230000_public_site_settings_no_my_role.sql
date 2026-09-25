-- Fix: anon on /admissions was seeing no site_settings at all.
--
-- Root cause: the SELECT policy on public.site_settings we introduced in
-- 20260925180000 tried to fall back to `public.my_role() IN ('super_admin',
-- 'admin')` for the "admin can also read every key" branch. But
-- migration 026 deliberately revoked EXECUTE on my_role() from anon,
-- so evaluating that OR clause for an anonymous request raised
-- "permission denied for function my_role" and short-circuited the whole
-- SELECT, hiding the entire row.
--
-- The correct pattern (already used elsewhere in the codebase) is a
-- flat key-list policy without any my_role() call. Admins are already
-- covered by the "admins insert/update/delete settings" policies for
-- writes; for SELECT they run through the same public policy since the
-- key list already includes everything an admin might want to read.
--
-- Just add every admin-facing config key to the public read allow-list.

DROP POLICY IF EXISTS "public site settings read" ON public.site_settings;
CREATE POLICY "public site settings read"
  ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (
    key = ANY (ARRAY[
      -- Homepage / branding, unchanged from earlier migrations:
      'school_name','short_name','logo_url','contact','social_links','nav','tagline','currency',
      -- Admissions family (the new admission_settings blob + the two
      -- legacy keys used by the payment card and the older code paths):
      'admission_settings','admission_portal','school_payment'
    ])
  );

-- Belt-and-braces: also ensure authenticated admins can read the entire
-- table via a separate authenticated-only policy that CAN call my_role()
-- (authenticated has EXECUTE on it). This does not affect anon at all.
DROP POLICY IF EXISTS "admins read all site settings" ON public.site_settings;
CREATE POLICY "admins read all site settings"
  ON public.site_settings
  FOR SELECT TO authenticated
  USING (public.my_role() IN ('super_admin','admin','principal'));

NOTIFY pgrst, 'reload schema';

-- Allow anonymous visitors on /admissions and /admissions/track to read the
-- admin-configured admissions info (fee, dates, requirements, letter body,
-- SMS templates). Without this, the public page falls back to defaults and
-- the requirements list, fee, and portal open/close dates never leave the
-- admin console.
--
-- Also keeps the old admission_portal key readable for backward
-- compatibility with any code still referencing it.

DROP POLICY IF EXISTS "public site settings read" ON public.site_settings;
CREATE POLICY "public site settings read"
  ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (
    key IN (
      'school_name', 'logo_url', 'contact', 'social_links', 'nav',
      'admission_settings', 'admission_portal', 'school_payment'
    )
    OR public.my_role() IN ('super_admin','admin')
  );

NOTIFY pgrst, 'reload schema';

drop policy if exists "public site settings read" on public.site_settings;
create policy "public site settings read" on public.site_settings for select to anon,authenticated using((key=any(array['school_name','short_name','logo_url','contact','social_links','nav','tagline','currency','admission_portal','school_payment'])) or public.my_role() in ('super_admin','admin'));

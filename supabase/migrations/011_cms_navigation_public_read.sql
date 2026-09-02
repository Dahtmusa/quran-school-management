drop policy if exists "public site settings read" on public.site_settings;
create policy "public site settings read" on public.site_settings for select to anon,authenticated using (key in ('school_name','logo_url','contact','social_links','nav') or public.my_role() in ('super_admin','admin'));

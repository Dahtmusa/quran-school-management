revoke execute on function public.my_role() from public;
revoke execute on function public.my_role() from anon;
grant execute on function public.my_role() to authenticated;

drop policy if exists "public homepage read" on public.homepage_sections;
create policy "public homepage read" on public.homepage_sections for select to anon,authenticated using (visible=true);

drop policy if exists "public site settings read" on public.site_settings;
create policy "public site settings read" on public.site_settings for select to anon,authenticated using (key=any(array['school_name','short_name','logo_url','contact','social_links','nav','tagline','currency','admission_portal','school_payment']));

drop policy if exists "public published team profiles" on public.public_team_profiles;
create policy "public published team profiles" on public.public_team_profiles for select to anon,authenticated using (published=true);

drop policy if exists "public can view published alumni" on public.alumni_profiles;
create policy "public can view published alumni" on public.alumni_profiles for select to anon,authenticated using (published=true);

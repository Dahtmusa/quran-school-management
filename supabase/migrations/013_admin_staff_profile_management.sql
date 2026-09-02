create policy "admins update staff profiles" on public.profiles for update to authenticated using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));
grant select, update on public.profiles to authenticated;

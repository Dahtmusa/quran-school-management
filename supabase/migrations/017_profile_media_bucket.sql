insert into storage.buckets(id,name,public) values('school-profile-media','school-profile-media',true) on conflict (id) do update set public=true;
drop policy if exists "profile media upload" on storage.objects;
create policy "profile media upload" on storage.objects for insert to authenticated with check(bucket_id='school-profile-media' and public.my_role() in ('teacher','super_admin','admin','principal','admissions'));
drop policy if exists "profile media delete" on storage.objects;
create policy "profile media delete" on storage.objects for delete to authenticated using(bucket_id='school-profile-media' and public.my_role() in ('teacher','super_admin','admin','principal','admissions'));

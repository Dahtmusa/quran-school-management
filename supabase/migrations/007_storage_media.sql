-- Private school media bucket. Public pages should receive signed URLs only for CMS-approved media.
insert into storage.buckets (id,name,public)
values ('school-media','school-media',false)
on conflict (id) do update set public=false;

create policy "admins upload school media" on storage.objects
for insert to authenticated
with check (bucket_id='school-media' and public.my_role() in ('super_admin','admin','principal'));

create policy "admins update school media" on storage.objects
for update to authenticated
using (bucket_id='school-media' and public.my_role() in ('super_admin','admin','principal'))
with check (bucket_id='school-media' and public.my_role() in ('super_admin','admin','principal'));

create policy "admins delete school media" on storage.objects
for delete to authenticated
using (bucket_id='school-media' and public.my_role() in ('super_admin','admin','principal'));

create policy "admins read school media" on storage.objects
for select to authenticated
using (bucket_id='school-media' and public.my_role() in ('super_admin','admin','principal'));

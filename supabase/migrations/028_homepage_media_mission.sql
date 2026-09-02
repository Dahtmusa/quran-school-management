-- Rich public homepage media gallery and mission/vision content.
create table if not exists public.homepage_media (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Student Activities',
  media_type text not null check (media_type in ('image','video')),
  public_url text not null,
  storage_path text,
  alt_text text,
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homepage_media enable row level security;

drop policy if exists "public homepage media read" on public.homepage_media;
create policy "public homepage media read" on public.homepage_media
  for select to anon, authenticated using (visible = true);

drop policy if exists "admins manage homepage media" on public.homepage_media;
create policy "admins manage homepage media" on public.homepage_media
  for all to authenticated
  using (public.my_role() in ('super_admin','admin','principal'))
  with check (public.my_role() in ('super_admin','admin','principal'));

create index if not exists homepage_media_public_idx
  on public.homepage_media(visible, category, sort_order, created_at desc);

insert into public.homepage_sections(section_key,title,content,sort_order,visible)
values (
  'mission_vision',
  'Our Mission & Vision',
  '{"mission_title":"Our Mission","mission":"To provide a safe, disciplined and nurturing environment where students memorize the Qur''an, deepen their Islamic knowledge, develop excellent character and grow into responsible members of the Ummah.","vision_title":"Our Vision","vision":"To become a trusted centre for Qur''anic excellence, character formation and holistic student development, preparing young people to carry the Qur''an with knowledge, faith and purpose.","cta":"Discover Our Story","cta_href":"/about"}'::jsonb,
  4,
  true
)
on conflict(section_key) do update set
  title = excluded.title,
  content = case when coalesce(public.homepage_sections.content->>'mission','') = '' then excluded.content else public.homepage_sections.content end,
  sort_order = excluded.sort_order,
  visible = true,
  updated_at = now();

update public.homepage_sections
set sort_order = case section_key
  when 'hero' then 1
  when 'features' then 2
  when 'about' then 3
  when 'mission_vision' then 4
  when 'stats' then 5
  when 'programme' then 6
  when 'values' then 7
  when 'campuses' then 8
  when 'news' then 9
  when 'footer' then 10
  else sort_order end,
  updated_at = now();

insert into public.homepage_media(title,description,category,media_type,public_url,visible,sort_order)
select * from (values
  ('Student Activities','Qur''an learning, group study and student life.','Student Activities','image','https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1400&q=85',true,1),
  ('Classrooms','A focused and welcoming environment for daily learning.','Classrooms','image','https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=1400&q=85',true,2),
  ('School Compound','A calm campus environment where students learn and grow.','School Compound','image','https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1400&q=85',true,3),
  ('Qur''an Recitations','Admin can upload student Qur''an recitation videos here.','Qur''an Recitations','image','https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&w=1400&q=85',true,4),
  ('Prayer & Worship','Daily worship and spiritual development are central to school life.','Prayer & Worship','image','https://images.unsplash.com/photo-1542816417-0983673b551e?auto=format&fit=crop&w=1400&q=85',true,5),
  ('Teachers Teaching','Teachers guide students with care, structure and encouragement.','Teachers Teaching','image','https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=85',true,6),
  ('Student Hostels','A supportive residential environment for boarding students.','Student Hostels','image','https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1400&q=85',true,7)
) as seed(title,description,category,media_type,public_url,visible,sort_order)
where not exists (select 1 from public.homepage_media);

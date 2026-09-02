create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  program_year public.program_year,
  capacity smallint,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  primary key(class_id,teacher_id)
);

alter table public.students add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;

create or replace function public.is_teacher_profile(p_id uuid)
returns boolean language sql stable security invoker set search_path=public as $$
  select exists(select 1 from public.profiles where id=p_id and role='teacher');
$$;

create policy "admins manage classes" on public.classes for all to authenticated
using (public.my_role() in ('super_admin','admin','principal'))
with check (public.my_role() in ('super_admin','admin','principal'));
create policy "teachers read assigned classes" on public.classes for select to authenticated
using (exists(select 1 from public.class_teachers ct where ct.class_id=classes.id and ct.teacher_id=auth.uid()));
create policy "admins manage class teachers" on public.class_teachers for all to authenticated
using (public.my_role() in ('super_admin','admin','principal'))
with check (public.my_role() in ('super_admin','admin','principal') and public.is_teacher_profile(teacher_id));
create policy "teachers read own class assignments" on public.class_teachers for select to authenticated
using (teacher_id=auth.uid());

-- Alumni, graduation and certificate records. Content remains admin-controlled.
create table if not exists public.alumni_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete set null,
  full_name text not null,
  graduation_year int not null,
  cohort_name text not null,
  graduation_term text not null,
  final_quran_position text,
  completion_percentage numeric(5,2) not null default 100,
  profile_photo_url text,
  brief_bio text,
  full_bio text,
  published_on_homepage boolean not null default false,
  published boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.graduation_certificates (
  id uuid primary key default gen_random_uuid(),
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  certificate_number text not null unique,
  issued_at date not null,
  template_key text not null default 'quran-completion-classic',
  recipient_name text not null,
  programme_name text not null default 'Two-Year Quran Memorization Programme',
  cohort_name text not null,
  final_term text not null,
  status text not null default 'issued' check (status in ('draft','issued','revoked')),
  pdf_url text,
  created_at timestamptz not null default now()
);

create index if not exists alumni_homepage_idx on public.alumni_profiles(published_on_homepage, published, display_order);
create index if not exists alumni_cohort_idx on public.alumni_profiles(cohort_name, graduation_year);

alter table public.alumni_profiles enable row level security;
alter table public.graduation_certificates enable row level security;

-- Policies are intentionally minimal for the review schema; production policies will map to app roles.
create policy "public can view published alumni" on public.alumni_profiles for select to anon, authenticated
  using (published = true);
create policy "public can view issued certificates" on public.graduation_certificates for select to anon, authenticated
  using (status = 'issued');

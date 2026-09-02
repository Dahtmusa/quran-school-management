alter type public.user_role add value if not exists 'security';
-- v4: security scanning, admin-reviewed attendance notifications, staff discipline,
-- and fully CMS-managed leadership/staff profiles.
create type public.attendance_review_status as enum ('pending','approved','rejected');
create type public.notification_status as enum ('queued','sent','failed','cancelled');
create type public.staff_warning_status as enum ('open','acknowledged','resolved');

alter table public.students add column if not exists scan_code text unique;
alter table public.profiles add column if not exists scan_code text unique;

create table if not exists public.attendance_submissions (
  id uuid primary key default gen_random_uuid(),
  attendance_date date not null,
  submitted_by uuid not null references public.profiles(id),
  source text not null default 'security_scan',
  notes text,
  status public.attendance_review_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.attendance_submissions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  proposed_status public.attendance_status not null default 'present',
  note text,
  notify_parent boolean not null default true,
  unique(submission_id, student_id)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id),
  student_id uuid references public.students(id) on delete set null,
  channel text not null check(channel in ('sms','email','in_app')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'queued',
  provider_message_id text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.staff_discipline_settings (
  id uuid primary key default gen_random_uuid(),
  warning_threshold integer not null default 3 check(warning_threshold > 0),
  fine_amount numeric(12,2) not null default 0 check(fine_amount >= 0),
  currency text not null default 'RWF',
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_warnings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  issued_by uuid not null references public.profiles(id),
  reason text not null,
  warning_number integer not null check(warning_number > 0),
  status public.staff_warning_status not null default 'open',
  fine_amount numeric(12,2) not null default 0,
  issued_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.public_team_profiles (
  id uuid primary key default gen_random_uuid(),
  category text not null check(category in ('leadership','management','staff')),
  full_name text not null,
  role_title text not null,
  photo_url text,
  brief_bio text,
  full_profile jsonb not null default '{}'::jsonb,
  display_on_homepage boolean not null default false,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null unique,
  alt_text text,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.attendance_submissions enable row level security;
alter table public.attendance_submission_items enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.staff_discipline_settings enable row level security;
alter table public.staff_warnings enable row level security;
alter table public.public_team_profiles enable row level security;
alter table public.media_library enable row level security;

create policy "admins manage attendance submissions" on public.attendance_submissions for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "security can create attendance submissions" on public.attendance_submissions for insert to authenticated with check (public.my_role() in ('security','super_admin','admin'));
create policy "admins manage attendance submission items" on public.attendance_submission_items for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "security can create attendance submission items" on public.attendance_submission_items for insert to authenticated with check (exists(select 1 from public.attendance_submissions s where s.id=submission_id and s.submitted_by=auth.uid()));
create policy "admins manage notification outbox" on public.notification_outbox for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "admins manage discipline settings" on public.staff_discipline_settings for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "admins manage staff warnings" on public.staff_warnings for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "public published team profiles" on public.public_team_profiles for select to anon,authenticated using (published=true or public.my_role() in ('super_admin','admin','principal'));
create policy "admins manage team profiles" on public.public_team_profiles for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "public media published via team profiles" on public.media_library for select to anon,authenticated using (true);
create policy "admins manage media" on public.media_library for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

-- Keep attendance notifications behind explicit admin approval.
create or replace function public.approve_attendance_submission(p_submission_id uuid, p_reviewer uuid)
returns void language plpgsql security invoker as $$
declare r record;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Not authorised'; end if;
  if p_reviewer is distinct from auth.uid() then raise exception 'Reviewer must be the authenticated administrator'; end if;
  update public.attendance_submissions set status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id=p_submission_id and status='pending';
  for r in select i.student_id, i.proposed_status, i.note, i.notify_parent from public.attendance_submission_items i where i.submission_id=p_submission_id loop
    insert into public.attendance_records(student_id, recorded_by, attendance_date, status, note)
    select r.student_id, p_reviewer, s.attendance_date, r.proposed_status, r.note from public.attendance_submissions s where s.id=p_submission_id
    on conflict(student_id, attendance_date) do update set status=excluded.status, note=excluded.note, recorded_by=excluded.recorded_by;
    if r.notify_parent and r.proposed_status in ('present','absent','late') then
      insert into public.notification_outbox(recipient_profile_id, student_id, channel, template_key, payload)
      select ps.parent_id, r.student_id, 'sms', 'attendance_status', jsonb_build_object('status',r.proposed_status,'date',(select attendance_date from public.attendance_submissions where id=p_submission_id))
      from public.parent_students ps where ps.student_id=r.student_id;
    end if;
  end loop;
end $$;

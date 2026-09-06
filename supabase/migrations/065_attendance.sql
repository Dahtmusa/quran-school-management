-- 065: Complete attendance system replacement
-- Renames old attendance_records to legacy, creates new production-ready schema

-- ─── Rename old table ───────────────────────────────────────────────────────
alter table if exists public.attendance_records rename to attendance_records_legacy;

-- ─── Configurable statuses ──────────────────────────────────────────────────
create table if not exists public.attendance_statuses (
  code text primary key,
  label text not null,
  color text not null default '#6b7280',
  counts_as_present boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0
);

insert into public.attendance_statuses (code, label, color, counts_as_present, sort_order) values
  ('present',  'Present',       '#16a34a', true,  1),
  ('late',     'Late',          '#d97706', true,  2),
  ('excused',  'Excused',       '#2563eb', false, 3),
  ('sick',     'Sick / Ill',    '#7c3aed', false, 4),
  ('absent',   'Absent',        '#dc2626', false, 5)
on conflict (code) do nothing;

-- ─── Scan points ────────────────────────────────────────────────────────────
create table if not exists public.attendance_scan_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.attendance_scan_points (name, description) values
  ('Main Gate',    'School main entrance gate'),
  ('Boarding',     'Boarding house entry point')
on conflict do nothing;

-- ─── Settings ───────────────────────────────────────────────────────────────
create table if not exists public.attendance_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.attendance_settings (key, value, description) values
  ('duplicate_interval_minutes', '30', 'Minutes within which a second scan for same person+period is rejected as duplicate'),
  ('morning_cutoff_time',        '"09:00"', 'Scans after this time are marked late automatically'),
  ('sms_enabled',                'false', 'Whether SMS notifications are enabled'),
  ('sms_send_on_status',         '["absent","late"]', 'Status codes that trigger an SMS to parents'),
  ('school_day_periods',         '["morning"]', 'Active attendance periods (morning / afternoon / evening)')
on conflict (key) do nothing;

-- ─── Notification templates ─────────────────────────────────────────────────
create table if not exists public.notification_templates (
  code text primary key,
  name text not null,
  template text not null,
  channel text not null default 'sms',
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_templates (code, name, template) values
  ('absent',  'Student Absent',
   'Dear parent, your child {student_name} was marked ABSENT on {date} at {time}. Contact the school if this is unexpected.'),
  ('late',    'Student Late',
   'Dear parent, your child {student_name} arrived LATE on {date} at {time}. Scan time: {scan_time}.'),
  ('excused', 'Absence Excused',
   'Dear parent, your child {student_name}''s absence on {date} has been marked as EXCUSED by the school.')
on conflict (code) do nothing;

-- ─── New attendance_records ──────────────────────────────────────────────────
create table if not exists public.attendance_records (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null,
  person_type    text not null check (person_type in ('student','staff')),
  scanned_at     timestamptz not null default now(),
  attendance_date date not null default current_date,
  status_code    text not null references public.attendance_statuses(code) default 'present',
  period         text not null default 'morning',
  review_status  text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  recorded_by    uuid references auth.users(id),
  scan_point_id  uuid references public.attendance_scan_points(id),
  note           text,
  is_offline_scan boolean not null default false,
  client_scanned_at timestamptz,
  synced_at      timestamptz,
  notification_sent boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (person_id, attendance_date, period)
);

create index if not exists idx_att_records_date    on public.attendance_records(attendance_date);
create index if not exists idx_att_records_person  on public.attendance_records(person_id);
create index if not exists idx_att_records_review  on public.attendance_records(review_status);

-- ─── Review actions ─────────────────────────────────────────────────────────
create table if not exists public.attendance_reviews (
  id              uuid primary key default gen_random_uuid(),
  record_id       uuid not null references public.attendance_records(id) on delete cascade,
  previous_status text,
  new_status      text,
  previous_review text,
  new_review      text,
  action          text not null,
  performed_by    uuid references auth.users(id),
  note            text,
  created_at      timestamptz not null default now()
);

-- ─── SMS notifications ───────────────────────────────────────────────────────
create table if not exists public.attendance_notifications (
  id             uuid primary key default gen_random_uuid(),
  record_id      uuid references public.attendance_records(id) on delete cascade,
  recipient_type text not null default 'parent',
  phone_number   text,
  message        text not null,
  status         text not null default 'pending' check (status in ('pending','sent','delivered','failed')),
  sent_at        timestamptz,
  delivered_at   timestamptz,
  error_message  text,
  retry_count    int not null default 0,
  created_at     timestamptz not null default now()
);

-- ─── Audit logs ─────────────────────────────────────────────────────────────
create table if not exists public.attendance_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  record_id      uuid references public.attendance_records(id) on delete set null,
  user_id        uuid references auth.users(id),
  user_role      text,
  action         text not null,
  previous_value jsonb,
  new_value      jsonb,
  ip_address     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_att_audit_record on public.attendance_audit_logs(record_id);
create index if not exists idx_att_audit_user   on public.attendance_audit_logs(user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.attendance_statuses       enable row level security;
alter table public.attendance_scan_points    enable row level security;
alter table public.attendance_settings       enable row level security;
alter table public.notification_templates    enable row level security;
alter table public.attendance_records        enable row level security;
alter table public.attendance_reviews        enable row level security;
alter table public.attendance_notifications  enable row level security;
alter table public.attendance_audit_logs     enable row level security;

-- Statuses & scan points: all authenticated can read
create policy "auth read statuses"     on public.attendance_statuses    for select to authenticated using (true);
create policy "admins manage statuses" on public.attendance_statuses    for all    to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

create policy "auth read scan points"     on public.attendance_scan_points for select to authenticated using (true);
create policy "admins manage scan points" on public.attendance_scan_points for all    to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

-- Settings: admins read/write, others read
create policy "auth read settings"     on public.attendance_settings for select to authenticated using (true);
create policy "admins write settings"  on public.attendance_settings for all    to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

-- Templates: admins manage
create policy "auth read templates"    on public.notification_templates for select to authenticated using (true);
create policy "admins write templates" on public.notification_templates for all    to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

-- Records: admins see all; security can insert; parents see their children's records
create policy "admins all records"      on public.attendance_records for all    to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));
create policy "security insert records" on public.attendance_records for insert to authenticated with check (public.my_role() in ('security','super_admin','admin','principal'));
create policy "security read records"   on public.attendance_records for select to authenticated using (public.my_role() in ('security','super_admin','admin','principal'));
create policy "parents read own children records" on public.attendance_records for select to authenticated
  using (
    person_type = 'student' and
    exists (
      select 1 from public.parent_students ps
      join public.profiles p on p.id = ps.parent_id
      where ps.student_id = attendance_records.person_id
        and p.id = auth.uid()
    )
  );

-- Reviews & notifications & audit: admins only
create policy "admins all reviews"   on public.attendance_reviews        for all to authenticated using (public.my_role() in ('super_admin','admin','principal'));
create policy "admins all notifs"    on public.attendance_notifications   for all to authenticated using (public.my_role() in ('super_admin','admin','principal'));
create policy "admins all audit"     on public.attendance_audit_logs      for all to authenticated using (public.my_role() in ('super_admin','admin','principal'));

-- Grant service role full access (needed for API routes using service key)
grant all on public.attendance_records       to service_role;
grant all on public.attendance_reviews       to service_role;
grant all on public.attendance_notifications to service_role;
grant all on public.attendance_audit_logs    to service_role;
grant all on public.attendance_settings      to service_role;
grant all on public.attendance_statuses      to service_role;
grant all on public.attendance_scan_points   to service_role;
grant all on public.notification_templates   to service_role;

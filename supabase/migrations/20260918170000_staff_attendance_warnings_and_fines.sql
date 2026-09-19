-- Staff gate attendance warnings and fines
alter table public.attendance_settings
  add column if not exists updated_at timestamptz default now();

insert into public.attendance_settings(key,value,description) values
 ('staff_late_warning_enabled','true','Automatically SMS staff when their configurable late threshold is reached'),
 ('staff_late_warning_threshold','2','Number of late gate scans before an automatic staff warning SMS'),
 ('staff_late_warning_repeat','2','Send another warning after each additional N late scans'),
 ('staff_late_fine_enabled','false','Automatically create a staff attendance fine when the fine threshold is reached'),
 ('staff_late_fine_amount','0','Fine amount in school currency for each qualifying late incident'),
 ('staff_late_fine_threshold','2','Late occurrence number at which fines begin'),
 ('staff_late_count_window_days','30','Number of previous calendar days used to count staff late occurrences'),
 ('staff_late_warning_template','Dear {staff_name}, you have been recorded late {late_count} times in the last {window_days} days. Please report on time. - AMQM','Automatic warning SMS template for staff')
on conflict(key) do nothing;

create table if not exists public.staff_attendance_fines (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.profiles(id) on delete cascade,
 attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
 amount numeric(12,2) not null check(amount >= 0),
 reason text not null,
 status text not null default 'pending' check(status in ('pending','paid','waived')),
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 notes text,
 unique(attendance_record_id)
);

create index if not exists idx_staff_attendance_fines_staff on public.staff_attendance_fines(staff_id,created_at desc);
create index if not exists idx_staff_attendance_fines_status on public.staff_attendance_fines(status);

alter table public.staff_attendance_fines enable row level security;
drop policy if exists "admins manage staff attendance fines" on public.staff_attendance_fines;
create policy "admins manage staff attendance fines"
on public.staff_attendance_fines for all to authenticated
using(public.my_role() in ('super_admin','admin','principal'))
with check(public.my_role() in ('super_admin','admin','principal'));

grant all on public.staff_attendance_fines to service_role;
grant select,insert,update,delete on public.staff_attendance_fines to authenticated;

notify pgrst,'reload schema';
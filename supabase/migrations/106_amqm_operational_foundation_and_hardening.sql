-- AMQM 106: operational foundation and cross-module hardening
-- First Term is an imported historical baseline. Second Term is the first fully digital operational term.

alter table public.terms
  add column if not exists lifecycle_status text not null default 'scheduled',
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id);

alter table public.terms
  drop constraint if exists terms_lifecycle_status_check;
alter table public.terms
  add constraint terms_lifecycle_status_check check (lifecycle_status in ('historical_baseline','historical_closed','scheduled','digital_active','digital_closed'));

update public.terms
set lifecycle_status = case
  when term_number = 1 and is_current = true then 'historical_baseline'
  when term_number > 1 and starts_on > current_date then 'scheduled'
  when term_number > 1 and is_current = true then 'digital_active'
  else lifecycle_status
end
where lifecycle_status = 'scheduled';

-- Term-scoped student enrollment history. Never delete the historical row when a student changes class.
create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  section public.section_type,
  program_year public.program_year,
  teacher_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check(status in ('active','completed','withdrawn','transferred')),
  source text not null default 'operational',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,term_id)
);
create index if not exists idx_student_enrollments_term_class on public.student_enrollments(term_id,class_id);
create index if not exists idx_student_enrollments_student on public.student_enrollments(student_id,term_id desc);
alter table public.student_enrollments enable row level security;
drop policy if exists "admin manage student enrollments" on public.student_enrollments;
create policy "admin manage student enrollments" on public.student_enrollments for all to authenticated
using(public.my_role() in ('super_admin','admin','principal'))
with check(public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "teachers read assigned enrollments" on public.student_enrollments;
create policy "teachers read assigned enrollments" on public.student_enrollments for select to authenticated
using(public.my_role()='teacher' and teacher_id=auth.uid());
drop policy if exists "parents read child enrollments" on public.student_enrollments;
create policy "parents read child enrollments" on public.student_enrollments for select to authenticated
using(public.my_role()='parent' and exists(select 1 from public.parent_students ps where ps.parent_id=auth.uid() and ps.student_id=student_enrollments.student_id));

-- Term-scoped teacher assignment history.
create table if not exists public.term_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  source text not null default 'backfill',
  created_at timestamptz not null default now(),
  unique(term_id,class_id,teacher_id)
);
create index if not exists idx_term_teacher_assignments_teacher on public.term_teacher_assignments(term_id,teacher_id);
alter table public.term_teacher_assignments enable row level security;
drop policy if exists "admins manage term teacher assignments" on public.term_teacher_assignments;
create policy "admins manage term teacher assignments" on public.term_teacher_assignments for all to authenticated
using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "teachers read term teacher assignments" on public.term_teacher_assignments;
create policy "teachers read term teacher assignments" on public.term_teacher_assignments for select to authenticated
using(public.my_role()='teacher' and teacher_id=auth.uid());

-- Immutable baseline snapshot: imported First Term data is preserved independently from live Second Term state.
create table if not exists public.amqm_historical_baselines (
  student_id uuid primary key references public.students(id) on delete cascade,
  baseline_term_id uuid not null references public.terms(id) on delete restrict,
  quran_closing jsonb not null default '{}'::jsonb,
  finance_snapshot jsonb not null default '{}'::jsonb,
  attendance_snapshot jsonb not null default '{}'::jsonb,
  enrollment_snapshot jsonb not null default '{}'::jsonb,
  evaluation_snapshot jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now(),
  captured_by uuid references public.profiles(id),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id)
);
create index if not exists idx_amqm_baselines_term on public.amqm_historical_baselines(baseline_term_id);
alter table public.amqm_historical_baselines enable row level security;
drop policy if exists "admins manage historical baselines" on public.amqm_historical_baselines;
create policy "admins manage historical baselines" on public.amqm_historical_baselines for all to authenticated
using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "parents read historical baseline" on public.amqm_historical_baselines;
create policy "parents read historical baseline" on public.amqm_historical_baselines for select to authenticated
using(public.my_role()='parent' and exists(select 1 from public.parent_students ps where ps.parent_id=auth.uid() and ps.student_id=amqm_historical_baselines.student_id));

-- One structured public news source for homepage and /news.
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'News',
  excerpt text,
  content text,
  image_url text,
  published_on date not null default current_date,
  published boolean not null default false,
  featured boolean not null default false,
  homepage boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_news_posts_public on public.news_posts(published,homepage,published_on desc,display_order);
alter table public.news_posts enable row level security;
drop policy if exists "public read published news" on public.news_posts;
create policy "public read published news" on public.news_posts for select to anon,authenticated using(published=true);
drop policy if exists "admins manage news" on public.news_posts;
create policy "admins manage news" on public.news_posts for all to authenticated
using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));

-- Backfill term history without pretending to know historical class changes that are not stored.
insert into public.student_enrollments(student_id,term_id,class_id,section,program_year,status,source)
select s.id,t.id,s.class_id,s.section,s.program_year,'active','baseline_backfill'
from public.students s
cross join lateral (select id from public.terms where term_number=1 order by starts_on desc limit 1) t
where s.status <> 'deleted'
on conflict(student_id,term_id) do nothing;

insert into public.term_teacher_assignments(term_id,class_id,teacher_id,is_primary,source)
select t.id,ct.class_id,ct.teacher_id,ct.is_primary,'baseline_backfill'
from public.class_teachers ct
cross join lateral (select id from public.terms where term_number=1 order by starts_on desc limit 1) t
on conflict(term_id,class_id,teacher_id) do nothing;

-- Backfill the structured news table from the existing homepage news content.
insert into public.news_posts(title,category,excerpt,image_url,published_on,published,featured,homepage,display_order)
select
  coalesce(item->>'title','AMQM News'),
  coalesce(item->>'date','News'),
  item->>'text',
  item->>'image',
  current_date,
  true,
  false,
  true,
  ord::integer
from public.homepage_sections h
cross join lateral jsonb_array_elements(coalesce(h.content->'items','[]'::jsonb)) with ordinality as x(item,ord)
where h.section_key='news'
  and jsonb_typeof(h.content->'items')='array'
  and not exists (select 1 from public.news_posts n where n.title=coalesce(item->>'title','AMQM News'));

-- Baseline capture is deliberately non-destructive and safe to run repeatedly.
create or replace function public.amqm_capture_historical_baseline()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  first_term uuid;
  student_count integer;
  captured_count integer;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select id into first_term from public.terms where term_number=1 order by starts_on desc limit 1;
  if first_term is null then raise exception 'First Term is not configured'; end if;

  insert into public.amqm_historical_baselines(student_id,baseline_term_id,quran_closing,finance_snapshot,attendance_snapshot,enrollment_snapshot,evaluation_snapshot,captured_at,captured_by)
  select s.id, first_term,
    jsonb_build_object('surah',coalesce(e3.to_surah,s.current_surah),'ayah',coalesce(e3.to_ayah,s.current_ayah),'page',coalesce(e3.to_page,s.current_page),'hizb',s.current_hizb,'direction',s.memorization_direction),
    jsonb_build_object('due',coalesce((select sum(sf.amount_due) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id where sf.student_id=s.id and (fs.term_id=first_term or fs.term_id is null)),0),'paid',coalesce((select sum(p.amount) from public.payments p where p.student_id=s.id and p.voided_at is null and (p.term_id=first_term or p.term_id is null)),0),'outstanding',coalesce((select sum(greatest(sf.amount_due-sf.amount_paid,0)) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id where sf.student_id=s.id and (fs.term_id=first_term or fs.term_id is null)),0)),
    jsonb_build_object('records',coalesce((select count(*) from public.attendance_records ar where ar.person_id=s.id and ar.person_type='student' and ar.attendance_date between (select starts_on from public.terms where id=first_term) and (select ends_on from public.terms where id=first_term)),0),'present',coalesce((select count(*) from public.attendance_records ar join public.attendance_statuses ast on ast.code=ar.status_code where ar.person_id=s.id and ar.person_type='student' and ar.attendance_date between (select starts_on from public.terms where id=first_term) and (select ends_on from public.terms where id=first_term) and ast.counts_as_present),0)),
    jsonb_build_object('class_id',s.class_id,'section',s.section,'program_year',s.program_year),
    coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'number',e.evaluation_number,'status',e.status,'score',e.score,'grade',e.grade,'from_surah',e.from_surah,'from_ayah',e.from_ayah,'to_surah',e.to_surah,'to_ayah',e.to_ayah,'to_page',e.to_page,'memorized_ayahs',e.memorized_ayahs,'memorized_pages',e.memorized_pages) order by e.evaluation_number) from public.evaluations e where e.student_id=s.id and e.campaign_id is null),'[]'::jsonb),
    now(),actor
  from public.students s
  left join lateral (select e.* from public.evaluations e where e.student_id=s.id and e.campaign_id is null and e.evaluation_number=3 and e.status='approved' order by e.approved_at desc nulls last,e.id desc limit 1) e3 on true
  where s.status <> 'deleted'
  on conflict(student_id) do update set baseline_term_id=excluded.baseline_term_id,quran_closing=excluded.quran_closing,finance_snapshot=excluded.finance_snapshot,attendance_snapshot=excluded.attendance_snapshot,enrollment_snapshot=excluded.enrollment_snapshot,evaluation_snapshot=excluded.evaluation_snapshot,captured_at=excluded.captured_at,captured_by=excluded.captured_by;

  select count(*) into student_count from public.students where status='active';
  select count(*) into captured_count from public.amqm_historical_baselines b join public.students s on s.id=b.student_id where s.status='active';
  return jsonb_build_object('active_students',student_count,'baseline_rows',captured_count,'missing_baseline',greatest(student_count-captured_count,0),'first_term_id',first_term);
end $$;
grant execute on function public.amqm_capture_historical_baseline() to authenticated;

create or replace function public.amqm_historical_baseline_readiness()
returns jsonb language sql security definer set search_path=public as $$
with active as (select id from public.students where status='active'),
base as (select b.student_id,b.quran_closing from public.amqm_historical_baselines b join active a on a.id=b.student_id),
missing_quran as (select a.id from active a left join base b on b.student_id=a.id where b.student_id is null or coalesce((b.quran_closing->>'surah')::int,0)=0 or coalesce((b.quran_closing->>'ayah')::int,0)=0),
first_term as (select id from public.terms where term_number=1 order by starts_on desc limit 1)
select jsonb_build_object(
 'active_students',(select count(*) from active),
 'baseline_rows',(select count(*) from base),
 'missing_baseline',(select count(*) from active a left join base b on b.student_id=a.id where b.student_id is null),
 'missing_quran_position',(select count(*) from missing_quran),
 'first_term_id',(select id from first_term),
 'second_term_id',(select id from public.terms where term_number=2 order by starts_on desc limit 1),
 'ready',((select count(*) from active)=(select count(*) from base) and (select count(*) from missing_quran)=0 and (select id from first_term) is not null and (select id from public.terms where term_number=2 order by starts_on desc limit 1) is not null)
);$$;
grant execute on function public.amqm_historical_baseline_readiness() to authenticated;

-- The only supported First-Term -> Second-Term transition for the new digital school.
create or replace function public.amqm_close_historical_first_term_start_second(p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  first_term uuid; second_term uuid; readiness jsonb; actor uuid := auth.uid();
  r record;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select id into first_term from public.terms where term_number=1 order by starts_on desc limit 1;
  select id into second_term from public.terms where term_number=2 order by starts_on desc limit 1;
  if first_term is null or second_term is null then raise exception 'First and Second Term must both be configured before the digital school can start'; end if;

  perform public.amqm_capture_historical_baseline();
  readiness := public.amqm_historical_baseline_readiness();
  if not coalesce((readiness->>'ready')::boolean,false) then raise exception 'Historical baseline is not ready: %', readiness; end if;

  update public.terms set is_current=false where is_current=true;
  update public.terms set lifecycle_status='historical_closed',closed_at=now(),closed_by=actor,is_current=false where id=first_term;
  update public.terms set lifecycle_status='digital_active',is_current=true where id=second_term;

  insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,status)
  select b.student_id,second_term,(b.quran_closing->>'surah')::smallint,(b.quran_closing->>'ayah')::smallint,(b.quran_closing->>'page')::smallint,'open'
  from public.amqm_historical_baselines b
  join public.students s on s.id=b.student_id and s.status='active'
  on conflict(student_id,term_id) do update set opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,opening_page=excluded.opening_page,status='open';

  -- Keep current official position synchronized to the verified historical closing position.
  for r in select student_id,quran_closing from public.amqm_historical_baselines loop
    update public.students set current_surah=(r.quran_closing->>'surah')::smallint,current_ayah=(r.quran_closing->>'ayah')::smallint,current_page=(r.quran_closing->>'page')::smallint,current_hizb=coalesce(current_hizb,(r.quran_closing->>'hizb')::smallint) where id=r.student_id;
  end loop;

  perform public.sync_term_invoices(second_term);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_data)
  values(actor,'historical_first_term_closed_second_term_started','term',second_term,jsonb_build_object('first_term_id',first_term,'second_term_id',second_term,'notes',p_notes));

  return jsonb_build_object('success',true,'first_term_id',first_term,'second_term_id',second_term,'message','Historical First Term archived. Second Term is now the first fully digital operational term.');
end $$;
grant execute on function public.amqm_close_historical_first_term_start_second(text) to authenticated;

-- Teacher attendance: boarding attendance is recorded by the assigned class teacher.
create or replace function public.teacher_record_boarding_attendance(p_student_id uuid,p_status_code text default 'present',p_period text default 'morning',p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; role_name text; section_name text;
begin
  select public.my_role() into role_name;
  if role_name <> 'teacher' then raise exception 'Teacher access required'; end if;
  select section::text into section_name from public.students where id=p_student_id and status='active';
  if section_name is null then raise exception 'Active student not found'; end if;
  if lower(section_name) <> 'boarding' then raise exception 'Class teachers may record this attendance workflow for boarding students only'; end if;
  if not exists(select 1 from public.teacher_students ts where ts.teacher_id=auth.uid() and ts.student_id=p_student_id) then raise exception 'Student is not assigned to this teacher'; end if;
  if not exists(select 1 from public.attendance_statuses where code=p_status_code and is_active=true) then raise exception 'Invalid attendance status'; end if;
  insert into public.attendance_records(person_id,person_type,scanned_at,attendance_date,status_code,period,review_status,recorded_by,note)
  values(p_student_id,'student',now(),(now() at time zone 'Africa/Lagos')::date,p_status_code,p_period,'pending',auth.uid(),p_note)
  on conflict(person_id,attendance_date,period) do update set status_code=excluded.status_code,recorded_by=excluded.recorded_by,note=excluded.note,scanned_at=excluded.scanned_at,review_status='pending'
  returning id into rid;
  insert into public.attendance_audit_logs(record_id,user_id,user_role,action,new_value) values(rid,auth.uid(),'teacher','teacher_boarding_attendance',jsonb_build_object('status',p_status_code,'period',p_period));
  return rid;
end $$;
grant execute on function public.teacher_record_boarding_attendance(uuid,text,text,text) to authenticated;

-- Critical indexes for current-term operational queries.
create index if not exists idx_evaluations_term_status_teacher on public.evaluations(term_id,status,teacher_id,evaluation_number);
create index if not exists idx_evaluations_campaign_teacher on public.evaluations(campaign_id,teacher_id,status);
create index if not exists idx_attendance_person_date_period on public.attendance_records(person_id,attendance_date,period);
create index if not exists idx_attendance_date_status on public.attendance_records(attendance_date,status_code,review_status);
create index if not exists idx_student_fees_student_structure on public.student_fees(student_id,fee_structure_id);
create index if not exists idx_payments_student_term_paid on public.payments(student_id,term_id,paid_on);
create index if not exists idx_parent_students_student_parent on public.parent_students(student_id,parent_id);
create index if not exists idx_teacher_students_teacher_student on public.teacher_students(teacher_id,student_id);
create index if not exists idx_calendar_term_type_start on public.school_calendar_events(term_id,event_type,starts_on);
create index if not exists idx_invoices_term_status_student on public.invoices(term_id,status,student_id);

-- Classes are archived, never physically deleted through normal application code.
alter table public.classes add column if not exists archived_at timestamptz;
alter table public.classes add column if not exists archived_by uuid references public.profiles(id);

-- Staff lifecycle uses employment_status; this index keeps active directory queries cheap.
create index if not exists idx_profiles_role_employment on public.profiles(role,employment_status);

-- Immutable audit trail for critical administrative changes.
create or replace function public.amqm_audit_critical_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); action_name text; entity uuid;
begin
  action_name := tg_op || '_critical_change';
  entity := coalesce(new.id,old.id);
  if tg_table_name='payments' and (new.voided_at is distinct from old.voided_at or new.amount is distinct from old.amount) then action_name := 'payment_critical_change'; end if;
  if tg_table_name='profiles' and (new.role is distinct from old.role or new.employment_status is distinct from old.employment_status) then action_name := 'staff_access_change'; end if;
  if tg_table_name='students' and (new.class_id is distinct from old.class_id or new.section is distinct from old.section or new.status is distinct from old.status) then action_name := 'student_operational_change'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data) values(actor,tg_table_name||':'||action_name,tg_table_name,entity,to_jsonb(old),to_jsonb(new));
  return new;
end $$;

drop trigger if exists amqm_audit_payment_changes on public.payments;
create trigger amqm_audit_payment_changes after update on public.payments for each row execute function public.amqm_audit_critical_change();
drop trigger if exists amqm_audit_profile_changes on public.profiles;
create trigger amqm_audit_profile_changes after update on public.profiles for each row when (old.role is distinct from new.role or old.employment_status is distinct from new.employment_status) execute function public.amqm_audit_critical_change();
drop trigger if exists amqm_audit_student_operational_changes on public.students;
create trigger amqm_audit_student_operational_changes after update on public.students for each row when (old.class_id is distinct from new.class_id or old.section is distinct from new.section or old.status is distinct from new.status) execute function public.amqm_audit_critical_change();

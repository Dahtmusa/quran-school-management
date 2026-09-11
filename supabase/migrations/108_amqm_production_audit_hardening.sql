-- AMQM 108: production audit hardening
-- Correct operational dashboard semantics and prepare (without activating) Second Term.

create or replace function public.amqm_admin_dashboard_snapshot()
returns jsonb language plpgsql security definer set search_path=public as $$
declare tid uuid; lifecycle text; begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select id,lifecycle_status into tid,lifecycle from public.terms where is_current=true order by starts_on desc limit 1;
  return jsonb_build_object(
    'term_id',tid,
    'term', (select jsonb_build_object('id',t.id,'name',t.name,'term_number',t.term_number,'starts_on',t.starts_on,'ends_on',t.ends_on,'lifecycle_status',t.lifecycle_status) from public.terms t where t.id=tid),
    'is_historical_baseline', lifecycle='historical_baseline',
    'students',(select count(*) from public.students s where s.status='active'),
    'day_students',(select count(*) from public.students s where s.status='active' and s.section::text='day'),
    'boarding_students',(select count(*) from public.students s where s.status='active' and s.section::text='boarding'),
    'active_staff',(select count(*) from public.profiles p where p.employment_status='active' and p.role<>'parent'),
    'teachers',(select count(*) from public.profiles p where p.employment_status='active' and p.role='teacher'),
    'evaluations_total',(select count(*) from public.evaluations e where e.term_id=tid),
    'evaluations_pending',(select count(*) from public.evaluations e where e.term_id=tid and e.status='pending_approval'),
    'evaluations_approved',(select count(*) from public.evaluations e where e.term_id=tid and e.status='approved'),
    'attendance_today',(select count(distinct a.person_id) from public.attendance_records a join public.students s on s.id=a.person_id and s.status='active' where a.attendance_date=(now() at time zone 'Africa/Lagos')::date and a.person_type='student'),
    'attendance_present_today',(select count(distinct a.person_id) from public.attendance_records a join public.students s on s.id=a.person_id and s.status='active' join public.attendance_statuses st on st.code=a.status_code where a.attendance_date=(now() at time zone 'Africa/Lagos')::date and a.person_type='student' and st.counts_as_present),
    'fees_due',(select coalesce(sum(sf.amount_due),0) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id join public.students s on s.id=sf.student_id and s.status='active' where fs.term_id=tid),
    'fees_paid',(select coalesce(sum(sf.amount_paid),0) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id join public.students s on s.id=sf.student_id and s.status='active' where fs.term_id=tid),
    'fee_students',(select count(distinct sf.student_id) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id join public.students s on s.id=sf.student_id and s.status='active' where fs.term_id=tid)
  );
end $$;
grant execute on function public.amqm_admin_dashboard_snapshot() to authenticated;

create or replace function public.amqm_digital_launch_readiness()
returns jsonb language sql security definer set search_path=public as $$
with active as (select id,class_id from public.students where status='active'),
first_term as (select id from public.terms where term_number=1 order by starts_on desc limit 1),
second_term as (select id from public.terms where term_number=2 order by starts_on desc limit 1),
base as (select b.student_id from public.amqm_historical_baselines b join active a on a.id=b.student_id),
second as (select id from second_term),
second_enr as (select se.student_id from public.student_enrollments se join second s on s.id=se.term_id),
second_events as (select distinct evaluation_number from public.school_calendar_events e join second s on s.id=e.term_id where e.event_type in ('evaluation_1','evaluation_2','evaluation_3') and e.evaluation_number between 1 and 3),
second_fee as (select count(*) n from public.fee_structures fs join second s on s.id=fs.term_id),
class_count as (select count(*) n from public.classes where active=true),
second_teacher as (select count(*) n from public.term_teacher_assignments a join second s on s.id=a.term_id where a.is_primary=true)
select jsonb_build_object(
 'ready',((select count(*) from active)=(select count(*) from base) and (select count(*) from second_fee)>=2 and (select count(*) from second_events)=3 and (select count(*) from second_enr)=(select count(*) from active) and (select count(*) from second_teacher)>0),
 'active_students',(select count(*) from active),
 'baseline_rows',(select count(*) from base),
 'missing_baseline',(select count(*) from active a where not exists(select 1 from base b where b.student_id=a.id)),
 'second_term_id',(select id from second_term),
 'second_term_fee_structures',(select n from second_fee),
 'second_term_evaluation_windows',(select count(*) from second_events),
 'second_term_enrollments',(select count(*) from second_enr),
 'missing_second_term_enrollments',(select count(*) from active a where not exists(select 1 from second_enr e where e.student_id=a.id)),
 'second_term_primary_teacher_assignments',(select n from second_teacher),
 'active_classes',(select n from class_count),
 'parent_linked_students',(select count(distinct ps.student_id) from public.parent_students ps join active a on a.id=ps.student_id),
 'students_without_parent_link',(select count(*) from active a where not exists(select 1 from public.parent_students ps where ps.student_id=a.id)),
 'attendance_records_first_term',(select count(*) from public.attendance_records a join active s on s.id=a.person_id where a.person_type='student' and a.attendance_date between (select starts_on from public.terms where id=(select id from first_term)) and (select ends_on from public.terms where id=(select id from first_term)))
);$$;
grant execute on function public.amqm_digital_launch_readiness() to authenticated;

create or replace function public.amqm_prepare_second_term_operational_records()
returns jsonb language plpgsql security definer set search_path=public as $$
declare second_id uuid; enr_count integer:=0; teacher_count integer:=0; fee_count integer:=0;
begin
  if public.my_role() not in ('super_admin','admin','principal','finance') then raise exception 'Administrator access required'; end if;
  select id into second_id from public.terms where term_number=2 order by starts_on desc limit 1;
  if second_id is null then raise exception 'Second Term is not configured'; end if;

  insert into public.student_enrollments(student_id,term_id,class_id,section,program_year,teacher_id,status,source)
  select s.id,second_id,s.class_id,s.section,s.program_year,ct.teacher_id,'active','digital_launch_preparation'
  from public.students s
  left join lateral (select ct2.teacher_id from public.class_teachers ct2 where ct2.class_id=s.class_id order by ct2.is_primary desc,ct2.assigned_at asc limit 1) ct on true
  where s.status='active'
  on conflict(student_id,term_id) do update set class_id=excluded.class_id,section=excluded.section,program_year=excluded.program_year,teacher_id=excluded.teacher_id,status='active',updated_at=now();
  get diagnostics enr_count = row_count;

  insert into public.term_teacher_assignments(term_id,class_id,teacher_id,is_primary,source)
  select second_id,ct.class_id,ct.teacher_id,ct.is_primary,'digital_launch_preparation'
  from public.class_teachers ct
  join public.classes c on c.id=ct.class_id and c.active=true
  on conflict(term_id,class_id,teacher_id) do update set is_primary=excluded.is_primary;
  get diagnostics teacher_count = row_count;

  select public.sync_student_fee_allocations(second_id) into fee_count;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'second_term_operational_records_prepared','term',second_id,jsonb_build_object('enrollments',enr_count,'teacher_assignments',teacher_count,'fee_rows_affected',fee_count));

  return public.amqm_digital_launch_readiness();
end $$;
grant execute on function public.amqm_prepare_second_term_operational_records() to authenticated;

-- The historical->digital transition now requires the operational records that can be safely prepared in advance.
create or replace function public.amqm_close_historical_first_term_start_second(p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare first_term uuid; second_term uuid; readiness jsonb; actor uuid := auth.uid(); r record;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select id into first_term from public.terms where term_number=1 order by starts_on desc limit 1;
  select id into second_term from public.terms where term_number=2 order by starts_on desc limit 1;
  if first_term is null or second_term is null then raise exception 'First and Second Term must both be configured before the digital school can start'; end if;

  perform public.amqm_capture_historical_baseline();
  perform public.amqm_prepare_second_term_operational_records();
  readiness := public.amqm_digital_launch_readiness();
  if not coalesce((readiness->>'ready')::boolean,false) then raise exception 'Digital launch is not ready: %', readiness; end if;

  update public.terms set is_current=false where is_current=true;
  update public.terms set lifecycle_status='historical_closed',closed_at=now(),closed_by=actor,is_current=false where id=first_term;
  update public.terms set lifecycle_status='digital_active',is_current=true where id=second_term;

  insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,status)
  select b.student_id,second_term,(b.quran_closing->>'surah')::smallint,(b.quran_closing->>'ayah')::smallint,(b.quran_closing->>'page')::smallint,'open'
  from public.amqm_historical_baselines b join public.students s on s.id=b.student_id and s.status='active'
  on conflict(student_id,term_id) do update set opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,opening_page=excluded.opening_page,status='open';

  for r in select student_id,quran_closing from public.amqm_historical_baselines loop
    update public.students set current_surah=(r.quran_closing->>'surah')::smallint,current_ayah=(r.quran_closing->>'ayah')::smallint,current_page=(r.quran_closing->>'page')::smallint,current_hizb=coalesce(current_hizb,(r.quran_closing->>'hizb')::smallint) where id=r.student_id;
  end loop;

  perform public.sync_term_invoices(second_term);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_data)
  values(actor,'historical_first_term_closed_second_term_started','term',second_term,jsonb_build_object('first_term_id',first_term,'second_term_id',second_term,'notes',p_notes));
  return jsonb_build_object('success',true,'first_term_id',first_term,'second_term_id',second_term,'message','Historical First Term archived. Second Term is now the first fully digital operational term.');
end $$;
grant execute on function public.amqm_close_historical_first_term_start_second(text) to authenticated;

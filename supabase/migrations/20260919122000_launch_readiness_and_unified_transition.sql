-- AMQM launch readiness: existing Second-Term enrollment rows may be incomplete
-- before the unified transition; the transition itself repairs those rows.
-- Readiness therefore blocks on real placement/teacher gaps, not merely row count.

create or replace function public.amqm_digital_launch_readiness()
returns jsonb
language sql
security definer
set search_path=public
as $$
with active as (
  select s.id,s.class_id
  from public.students s
  where s.status='active'
),
first_term as (
  select id from public.terms
  where term_number=1
  order by starts_on desc
  limit 1
),
second_term as (
  select id from public.terms
  where term_number=2
  order by starts_on desc
  limit 1
),
base as (
  select distinct b.student_id
  from public.amqm_historical_baselines b
  join active a on a.id=b.student_id
),
second_enr as (
  select distinct se.student_id
  from public.student_enrollments se
  join second_term s on s.id=se.term_id
  join active a on a.id=se.student_id
  where se.status='active'
),
second_events as (
  select distinct e.evaluation_number
  from public.school_calendar_events e
  join second_term s on s.id=e.term_id
  where e.event_type in ('evaluation_1','evaluation_2','evaluation_3')
    and e.evaluation_number between 1 and 3
),
second_fee as (
  select count(*) n
  from public.fee_structures fs
  join second_term s on s.id=fs.term_id
),
second_teacher as (
  select count(*) n
  from public.term_teacher_assignments a
  join second_term s on s.id=a.term_id
  where a.is_primary=true
),
placement as (
  select count(*) n
  from active a
  left join public.classes c
    on c.id=a.class_id
   and c.active=true
   and c.academic_year_id=(select academic_year_id from public.terms where id=(select id from second_term))
  left join lateral (
    select ct.teacher_id
    from public.class_teachers ct
    where ct.class_id=c.id
    order by ct.is_primary desc,ct.assigned_at asc
    limit 1
  ) ct on true
  where c.id is null or ct.teacher_id is null
)
select jsonb_build_object(
  'ready',(
    (select count(*) from active)=(select count(*) from base)
    and (select count(*) from second_fee)>=2
    and (select count(*) from second_events)=3
    and (select n from placement)=0
    and (select count(*) from second_teacher)>0
  ),
  'active_students',(select count(*) from active),
  'baseline_rows',(select count(*) from base),
  'missing_baseline',(select count(*) from active a where not exists(select 1 from base b where b.student_id=a.id)),
  'second_term_id',(select id from second_term),
  'second_term_fee_structures',(select n from second_fee),
  'second_term_evaluation_windows',(select count(*) from second_events),
  'second_term_enrollments',(select count(*) from second_enr),
  'missing_second_term_enrollments',(select count(*) from active a where not exists(select 1 from second_enr e where e.student_id=a.id)),
  'second_term_primary_teacher_assignments',(select n from second_teacher),
  'missing_second_term_placements',(select n from placement),
  'active_classes',(select count(*) from public.classes where active=true),
  'parent_linked_students',(select count(distinct ps.student_id) from public.parent_students ps join active a on a.id=ps.student_id),
  'students_without_parent_link',(select count(*) from active a where not exists(select 1 from public.parent_students ps where ps.student_id=a.id)),
  'attendance_records_first_term',(select count(*) from public.attendance_records a where a.person_type='student' and a.attendance_date between (select starts_on from public.terms where id=(select id from first_term)) and (select ends_on from public.terms where id=(select id from first_term)))
);
$$;

grant execute on function public.amqm_digital_launch_readiness() to authenticated;
notify pgrst,'reload schema';

-- Pre-launch safety check. Returns in one jsonb:
--   * the real lifecycle state of First and Second Term (so we know
--     if Second Term is already live or not);
--   * the readiness snapshot;
--   * the explicit identity of students flagged as missing baseline
--     or missing Second-Term enrolment, so admin can decide per
--     student instead of a blind batch action;
--   * a safe-to-launch verdict.

create or replace function public.amqm_pre_launch_safety_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with first_term as (
    select id, name, lifecycle_status, is_current, starts_on, ends_on
      from public.terms where term_number = 1 order by starts_on desc limit 1
  ),
  second_term as (
    select id, name, lifecycle_status, is_current, starts_on, ends_on
      from public.terms where term_number = 2 order by starts_on desc limit 1
  ),
  readiness as (
    select public.amqm_digital_launch_readiness() as data
  ),
  missing_baseline as (
    select s.id, s.admission_no, s.full_name
      from public.students s
     where s.status = 'active'
       and not exists (
         select 1 from public.amqm_historical_baselines b where b.student_id = s.id
       )
  ),
  missing_enrol as (
    select s.id, s.admission_no, s.full_name
      from public.students s
     where s.status = 'active'
       and not exists (
         select 1
           from public.student_enrollments se
          where se.student_id = s.id
            and se.term_id = (select id from second_term)
            and se.status = 'active'
       )
  )
  select jsonb_build_object(
    'first_term',  (select row_to_json(ft) from first_term ft),
    'second_term', (select row_to_json(st) from second_term st),
    'readiness',   (select data from readiness),
    'missing_baseline_students',
      coalesce((select jsonb_agg(row_to_json(m)) from missing_baseline m), '[]'::jsonb),
    'missing_second_term_enrol_students',
      coalesce((select jsonb_agg(row_to_json(m)) from missing_enrol m), '[]'::jsonb),
    'already_launched',
      (select coalesce(st.lifecycle_status = 'digital_active' and st.is_current, false) from second_term st),
    'safe_to_launch_now',
      (select
         coalesce(ft.lifecycle_status = 'historical_baseline', false)
         and (select (data->>'ready')::boolean from readiness)
         and (select coalesce(st.starts_on <= current_date, false) from second_term st)
       from first_term ft)
  );
$$;

grant execute on function public.amqm_pre_launch_safety_check() to authenticated;

notify pgrst, 'reload schema';

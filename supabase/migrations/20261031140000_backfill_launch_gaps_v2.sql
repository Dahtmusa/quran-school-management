-- Fix v1: amqm_historical_baselines stores snapshot columns as jsonb,
-- not individual position columns. Rewriting the backfill against
-- the real schema (student_id, baseline_term_id, quran_closing jsonb,
-- ...). Idempotent, insert-only.

create or replace function public.amqm_backfill_launch_gaps()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_first_term  public.terms;
  v_second_term public.terms;
  v_baselines_added int := 0;
  v_enrolments_added int := 0;
begin
  v_role := public.my_role();
  if v_role not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into v_first_term
    from public.terms
   where term_number = 1 and lifecycle_status = 'historical_baseline'
   order by starts_on desc limit 1;
  if v_first_term.id is null then
    raise exception 'Could not find a First Term flagged as historical_baseline';
  end if;

  select * into v_second_term
    from public.terms where term_number = 2 and is_current = true
    order by starts_on desc limit 1;
  if v_second_term.id is null then
    raise exception 'Second Term is not the current term';
  end if;

  -- Baseline rows for every active student without one. For post-launch
  -- admissions the baseline is simply "quran_closing = enrolment start
  -- position", everything else empty jsonb.
  with inserted as (
    insert into public.amqm_historical_baselines(
      student_id, baseline_term_id, quran_closing, captured_by
    )
    select s.id,
           v_first_term.id,
           jsonb_build_object(
             'current_surah',          s.current_surah,
             'current_ayah',           s.current_ayah,
             'start_surah',            s.start_surah,
             'start_ayah',             s.start_ayah,
             'memorization_direction', s.memorization_direction,
             'program_year',           s.program_year,
             'backfilled',             true,
             'reason',                 'post_launch_admission'
           ),
           auth.uid()
      from public.students s
     where s.status = 'active'
       and not exists (
         select 1 from public.amqm_historical_baselines b
          where b.student_id = s.id
       )
    on conflict (student_id) do nothing
    returning student_id
  )
  select count(*) into v_baselines_added from inserted;

  -- Second-Term enrolment rows for every active student without one.
  with inserted as (
    insert into public.student_enrollments(
      student_id, term_id, class_id, section, program_year,
      teacher_id, status, source
    )
    select s.id,
           v_second_term.id,
           s.class_id,
           s.section,
           s.program_year,
           (
             select ct.teacher_id
               from public.class_teachers ct
              where ct.class_id = s.class_id
              order by ct.is_primary desc, ct.assigned_at asc
              limit 1
           ),
           'active',
           'backfill_launch_gap'
      from public.students s
     where s.status = 'active'
       and not exists (
         select 1 from public.student_enrollments se
          where se.student_id = s.id
            and se.term_id    = v_second_term.id
            and se.status     = 'active'
       )
    on conflict (student_id, term_id) do update set
      status     = 'active',
      updated_at = now()
    returning student_id
  )
  select count(*) into v_enrolments_added from inserted;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), 'admin_backfill_launch_gaps', 'term', v_second_term.id,
          jsonb_build_object('term', 'Second Term'),
          jsonb_build_object('baselines_added',  v_baselines_added,
                             'enrolments_added', v_enrolments_added));

  return jsonb_build_object(
    'baselines_added',  v_baselines_added,
    'enrolments_added', v_enrolments_added,
    'term_id',          v_second_term.id,
    'readiness_after',  public.amqm_digital_launch_readiness()
  );
end;
$$;

grant execute on function public.amqm_backfill_launch_gaps() to authenticated;

notify pgrst, 'reload schema';

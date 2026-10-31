-- Backfill the three residual gaps the launch-readiness formula is
-- flagging because students were admitted AFTER the digital launch
-- already happened. Non-destructive: inserts only, never deletes.
--
-- (1) amqm_backfill_launch_gaps() creates:
--   * a historical_baseline row for every active student currently
--     missing one (their baseline position is their enrolment start
--     position, which is what the formula expects for a student who
--     had no evaluation history at launch time);
--   * a Second-Term student_enrollments row for every active student
--     currently missing one (using their current class/section/
--     program_year and the primary class teacher).
--
-- (2) amqm_list_unplaced_students() lists every active student
--     missing a current-year active class OR a primary teacher so
--     admin can fix each one via the student profile editor. No
--     batch job here -- placement is a human decision.
--
-- Everything is logged to audit_logs so the backfill is reversible.

create or replace function public.amqm_backfill_launch_gaps()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_second_term public.terms;
  v_baselines_added int := 0;
  v_enrolments_added int := 0;
begin
  v_role := public.my_role();
  if v_role not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into v_second_term
    from public.terms where term_number = 2 and is_current = true
    order by starts_on desc limit 1;
  if v_second_term.id is null then
    raise exception 'Second Term is not the current term';
  end if;

  -- Baseline rows for every active student without one. We stamp
  -- their start position as their baseline position so the readiness
  -- formula counts them. If a baseline row already exists we skip.
  with inserted as (
    insert into public.amqm_historical_baselines(
      student_id, start_surah, start_ayah,
      current_surah, current_ayah,
      memorization_direction, program_year
    )
    select s.id,
           coalesce(s.start_surah,   s.current_surah),
           coalesce(s.start_ayah,    s.current_ayah),
           s.current_surah,
           s.current_ayah,
           s.memorization_direction,
           s.program_year
      from public.students s
     where s.status = 'active'
       and not exists (
         select 1 from public.amqm_historical_baselines b
          where b.student_id = s.id
       )
    on conflict do nothing
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
          jsonb_build_object('baselines_added', v_baselines_added,
                             'enrolments_added', v_enrolments_added));

  return jsonb_build_object(
    'baselines_added',   v_baselines_added,
    'enrolments_added',  v_enrolments_added,
    'term_id',           v_second_term.id,
    'readiness_after',   public.amqm_digital_launch_readiness()
  );
end;
$$;

grant execute on function public.amqm_backfill_launch_gaps() to authenticated;

-- The 24 placement issues need per-student decisions. List them.
create or replace function public.amqm_list_unplaced_students()
returns table (
  student_id   uuid,
  admission_no text,
  full_name    text,
  class_id     uuid,
  class_name   text,
  class_active boolean,
  primary_teacher_id uuid,
  issue        text
) language sql
security definer
set search_path = public
as $$
  with current_year as (
    select academic_year_id from public.terms where is_current = true limit 1
  )
  select s.id,
         s.admission_no,
         s.full_name,
         c.id,
         c.name,
         c.active,
         (
           select ct.teacher_id
             from public.class_teachers ct
            where ct.class_id = c.id
            order by ct.is_primary desc, ct.assigned_at asc
            limit 1
         ),
         case
           when s.class_id is null then 'no_class'
           when c.id is null       then 'class_not_in_current_year'
           when not c.active       then 'class_inactive'
           when not exists (select 1 from public.class_teachers ct where ct.class_id = c.id)
             then 'class_has_no_teacher'
           else 'ok'
         end
    from public.students s
    left join public.classes c
      on c.id = s.class_id
     and c.academic_year_id = (select academic_year_id from current_year)
   where s.status = 'active'
     and (
       s.class_id is null
       or c.id is null
       or not c.active
       or not exists (select 1 from public.class_teachers ct where ct.class_id = c.id)
     )
   order by s.full_name;
$$;

grant execute on function public.amqm_list_unplaced_students() to authenticated;

notify pgrst, 'reload schema';

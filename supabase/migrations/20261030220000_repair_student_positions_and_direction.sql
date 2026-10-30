-- Thorough student-position health audit and repair.
--
-- Observed issue: some student profiles store a current_surah /
-- current_ayah that is incoherent with their declared memorization
-- direction. Example: Muhammad Buhari Hayatu (AMQM/STU/2025/006)
-- had direction = 'baqarah_to_nas' and current_surah/current_ayah =
-- 114/1, i.e. the LAST position of the Mushaf. For a forward reader
-- that is the end-of-journey; for a reverse reader that is the start.
-- Either the direction is wrong or the position never got updated
-- from the import default.
--
-- Scope of this migration:
--   1. amqm_audit_student_positions() lists every active student
--      flagged with one or more health issues:
--        * direction = baqarah_to_nas but current position = (114,1)
--          with no prior approved evaluation (sentinel default);
--        * direction = nas_to_baqarah but current position = (2,1)
--          with no prior approved evaluation (sentinel default);
--        * current position does not match the last approved eval
--          to_surah/to_ayah (profile drifted from history);
--        * start_surah/start_ayah NULL;
--        * current_surah/current_ayah NULL.
--   2. amqm_repair_student_positions() ONE PASS, idempotent fix:
--        * If a last-approved prior-term eval exists -> current =
--          that eval's to_surah/to_ayah (plus derived page/hizb).
--        * Else if start_surah/start_ayah are set -> current = start.
--        * Else: leave untouched and reported as needs_manual_review.
--      Writes an audit entry per student with before/after.
--
-- Non-destructive: writes nothing to evaluation rows, writes only to
-- students.current_* / start_* on students with repairable history.

create or replace function public.amqm_audit_student_positions()
returns table (
  student_id uuid,
  full_name text,
  admission_no text,
  memorization_direction text,
  current_surah smallint,
  current_ayah smallint,
  start_surah smallint,
  start_ayah smallint,
  last_approved_term text,
  last_approved_number smallint,
  last_approved_to_surah smallint,
  last_approved_to_ayah smallint,
  issues text[]
) language sql
security definer
set search_path = public
as $$
  with last_eval as (
    select distinct on (e.student_id)
      e.student_id,
      t.name as term_name,
      e.evaluation_number,
      e.to_surah,
      e.to_ayah
    from public.evaluations e
    join public.terms t on t.id = e.term_id
    where e.status = 'approved'
      and e.to_surah is not null
      and e.to_ayah is not null
    order by e.student_id, t.starts_on desc, e.evaluation_number desc
  )
  select s.id,
         s.full_name,
         s.admission_no,
         s.memorization_direction::text,
         s.current_surah,
         s.current_ayah,
         s.start_surah,
         s.start_ayah,
         le.term_name,
         le.evaluation_number,
         le.to_surah,
         le.to_ayah,
         (
           array_remove(array[
             case when s.current_surah is null or s.current_ayah is null then 'current_null' end,
             case when s.start_surah   is null or s.start_ayah   is null then 'start_null' end,
             case when s.memorization_direction::text = 'baqarah_to_nas'
                       and s.current_surah = 114 and s.current_ayah = 1
                       and le.student_id is null
                  then 'baqarah_to_nas_at_end_sentinel' end,
             case when s.memorization_direction::text = 'nas_to_baqarah'
                       and s.current_surah = 2 and s.current_ayah = 1
                       and le.student_id is null
                  then 'nas_to_baqarah_at_start_sentinel' end,
             case when le.student_id is not null
                       and (s.current_surah <> le.to_surah or s.current_ayah <> le.to_ayah)
                  then 'drifted_from_last_approved_eval' end
           ], null)
         )
    from public.students s
    left join last_eval le on le.student_id = s.id
   where s.status = 'active'
   order by s.full_name;
$$;

grant execute on function public.amqm_audit_student_positions() to authenticated;

create or replace function public.amqm_repair_student_positions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_from_last int := 0;
  v_from_start int := 0;
  v_skipped int := 0;
  v_old jsonb;
  v_new_surah smallint;
  v_new_ayah smallint;
  v_new_page smallint;
  v_new_hizb smallint;
begin
  for r in
    with last_eval as (
      select distinct on (e.student_id)
        e.student_id,
        e.to_surah,
        e.to_ayah
      from public.evaluations e
      join public.terms t on t.id = e.term_id
      where e.status = 'approved'
        and e.to_surah is not null
        and e.to_ayah is not null
      order by e.student_id, t.starts_on desc, e.evaluation_number desc
    )
    select s.id,
           s.current_surah, s.current_ayah,
           s.start_surah,   s.start_ayah,
           le.to_surah,     le.to_ayah
      from public.students s
      left join last_eval le on le.student_id = s.id
     where s.status = 'active'
  loop
    if r.to_surah is not null and r.to_ayah is not null then
      v_new_surah := r.to_surah;
      v_new_ayah  := r.to_ayah;
      v_from_last := v_from_last + 1;
    elsif r.start_surah is not null and r.start_ayah is not null then
      v_new_surah := r.start_surah;
      v_new_ayah  := r.start_ayah;
      v_from_start := v_from_start + 1;
    else
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Skip students who already match.
    if r.current_surah = v_new_surah and r.current_ayah = v_new_ayah then
      continue;
    end if;

    select page, hizb into v_new_page, v_new_hizb
      from public.quran_verses
     where surah = v_new_surah and ayah = v_new_ayah;

    select to_jsonb(s.*) into v_old from public.students s where s.id = r.id;

    update public.students
       set current_surah = v_new_surah,
           current_ayah  = v_new_ayah,
           current_page  = coalesce(v_new_page, current_page),
           current_hizb  = coalesce(v_new_hizb, current_hizb)
     where id = r.id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
    values (
      auth.uid(),
      'admin_repair_student_position',
      'student',
      r.id,
      v_old,
      jsonb_build_object(
        'current_surah', v_new_surah,
        'current_ayah',  v_new_ayah,
        'current_page',  v_new_page,
        'current_hizb',  v_new_hizb,
        'source', case when r.to_surah is not null then 'last_approved_eval' else 'start_position' end
      )
    );
  end loop;

  return jsonb_build_object(
    'restored_from_last_approved_eval', v_from_last,
    'restored_from_start_position',     v_from_start,
    'skipped_no_data',                  v_skipped
  );
end;
$$;

grant execute on function public.amqm_repair_student_positions() to authenticated;

notify pgrst, 'reload schema';

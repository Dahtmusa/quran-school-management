-- Scoped rollback helpers for teacher-initiated edits to the
-- students table during the first evaluation window. Teachers who
-- could not find the proper evaluation entry on their dashboard
-- typed Eval-1 results directly into student profiles instead,
-- which bypassed the evaluation lifecycle and corrupted the
-- current_surah/current_ayah positions used by the report cards.
--
-- Two pieces:
--   1. amqm_list_teacher_student_edits(from_ts, to_ts): list every
--      teacher_update_quran_profile audit entry in the window, with
--      the old vs new positions so admin can confirm what will be
--      reverted.
--   2. amqm_rollback_teacher_student_edits(from_ts, to_ts): for
--      every audit entry in that window, restore the student's row
--      to the OLD snapshot (direction, start, current, program_year
--      and derived page/hizb). Only reverts students that were
--      actually mutated by a teacher during the window. Records a
--      compensating audit entry per student.
--
-- Both are admin-only.

create or replace function public.amqm_list_teacher_student_edits(
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  audit_id uuid,
  edited_at timestamptz,
  teacher_id uuid,
  teacher_name text,
  student_id uuid,
  student_name text,
  admission_no text,
  old_current_surah smallint,
  old_current_ayah smallint,
  new_current_surah smallint,
  new_current_ayah smallint,
  old_direction text,
  new_direction text
) language sql
security definer
set search_path = public
as $$
  select
    al.id,
    al.created_at,
    al.actor_id,
    tp.full_name,
    al.entity_id,
    sp.full_name,
    sp.admission_no,
    (al.old_data->>'current_surah')::smallint,
    (al.old_data->>'current_ayah')::smallint,
    (al.new_data->>'current_surah')::smallint,
    (al.new_data->>'current_ayah')::smallint,
    al.old_data->>'memorization_direction',
    al.new_data->>'memorization_direction'
  from public.audit_logs al
  left join public.profiles tp on tp.id = al.actor_id
  left join public.students sp on sp.id = al.entity_id
  where al.action = 'teacher_update_quran_profile'
    and al.entity_type = 'student'
    and al.created_at between p_from and p_to
  order by al.created_at desc;
$$;

grant execute on function public.amqm_list_teacher_student_edits(timestamptz, timestamptz) to authenticated;

create or replace function public.amqm_rollback_teacher_student_edits(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_count int := 0;
  v_skipped int := 0;
  r record;
  v_old_current_surah smallint;
  v_old_current_ayah  smallint;
  v_old_current_page  smallint;
  v_old_current_hizb  smallint;
  v_old_direction     public.memorization_direction;
  v_old_program_year  public.program_year;
  v_old_start_surah   smallint;
  v_old_start_ayah    smallint;
begin
  v_role := public.my_role();
  if v_role is null or v_role not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  -- Walk the audit entries in CHRONOLOGICAL order (oldest first) so
  -- each student is ultimately restored to its EARLIEST pre-edit
  -- snapshot in the window. If a student was mutated three times, we
  -- want their position back to what it was before mutation #1 --
  -- which is what the first audit row's old_data captures.
  for r in
    select distinct on (al.entity_id)
      al.entity_id as student_id,
      al.old_data
    from public.audit_logs al
    where al.action = 'teacher_update_quran_profile'
      and al.entity_type = 'student'
      and al.created_at between p_from and p_to
    order by al.entity_id, al.created_at asc
  loop
    v_old_current_surah := (r.old_data->>'current_surah')::smallint;
    v_old_current_ayah  := (r.old_data->>'current_ayah')::smallint;
    v_old_current_page  := (r.old_data->>'current_page')::smallint;
    v_old_current_hizb  := (r.old_data->>'current_hizb')::smallint;
    v_old_direction     := (r.old_data->>'memorization_direction')::public.memorization_direction;
    v_old_program_year  := (r.old_data->>'program_year')::public.program_year;
    v_old_start_surah   := (r.old_data->>'start_surah')::smallint;
    v_old_start_ayah    := (r.old_data->>'start_ayah')::smallint;

    if v_old_current_surah is null or v_old_current_ayah is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.students
       set current_surah = v_old_current_surah,
           current_ayah  = v_old_current_ayah,
           current_page  = coalesce(v_old_current_page, current_page),
           current_hizb  = coalesce(v_old_current_hizb, current_hizb),
           memorization_direction = coalesce(v_old_direction, memorization_direction),
           program_year  = coalesce(v_old_program_year, program_year),
           start_surah   = coalesce(v_old_start_surah, start_surah),
           start_ayah    = coalesce(v_old_start_ayah, start_ayah)
     where id = r.student_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
    values (
      auth.uid(),
      'admin_rollback_teacher_quran_edit',
      'student',
      r.student_id,
      jsonb_build_object('window_from', p_from, 'window_to', p_to),
      r.old_data
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'rolled_back_students', v_count,
    'skipped_without_snapshot', v_skipped,
    'window_from', p_from,
    'window_to',   p_to
  );
end;
$$;

grant execute on function public.amqm_rollback_teacher_student_edits(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';

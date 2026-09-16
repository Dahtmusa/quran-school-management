-- Teachers and school admins are authoritative editors of a student's Quran direction/current position.
-- Do not impose a Surah-based direction rule or require current to be ahead/behind start.

CREATE OR REPLACE FUNCTION public.teacher_update_student_quran_profile(
  p_student_id uuid,
  p_direction public.memorization_direction,
  p_current_surah smallint,
  p_current_ayah smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_page smallint;
  v_hizb smallint;
  v_teacher uuid := auth.uid();
begin
  if public.my_role() <> 'teacher' then raise exception 'Teacher access required'; end if;
  if not exists (
    select 1 from public.teacher_students
    where teacher_id=v_teacher and student_id=p_student_id
  ) then
    raise exception 'Student is not assigned to you';
  end if;

  select page,hizb into v_page,v_hizb
  from public.quran_verses
  where surah=p_current_surah and ayah=p_current_ayah;
  if v_page is null then raise exception 'Invalid Quran position'; end if;

  select jsonb_build_object(
    'memorization_direction',memorization_direction,
    'start_surah',start_surah,
    'start_ayah',start_ayah,
    'current_surah',current_surah,
    'current_ayah',current_ayah,
    'current_page',current_page,
    'current_hizb',current_hizb
  ) into v_old
  from public.students where id=p_student_id;
  if v_old is null then raise exception 'Student not found'; end if;

  update public.students
  set memorization_direction=p_direction,
      current_surah=p_current_surah,
      current_ayah=p_current_ayah,
      current_page=v_page,
      current_hizb=v_hizb
  where id=p_student_id;

  select jsonb_build_object(
    'memorization_direction',memorization_direction,
    'start_surah',start_surah,
    'start_ayah',start_ayah,
    'current_surah',current_surah,
    'current_ayah',current_ayah,
    'current_page',current_page,
    'current_hizb',current_hizb
  ) into v_new
  from public.students where id=p_student_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
  values(v_teacher,'teacher_update_quran_profile','student',p_student_id,v_old,v_new);
end;
$function$;

-- Remove the old journey-order guard completely. Valid Quran positions are still
-- checked by the current-position sync trigger and by the RPC above.
DROP TRIGGER IF EXISTS trg_validate_student_quran_journey ON public.students;
DROP FUNCTION IF EXISTS public.validate_student_quran_journey();

REVOKE ALL ON FUNCTION public.teacher_update_student_quran_profile(uuid, public.memorization_direction, smallint, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_update_student_quran_profile(uuid, public.memorization_direction, smallint, smallint) TO authenticated;

-- AMQM: unified Quran profile updates for teachers and admins.
-- No start/direction assumptions. Any valid Quran start/current position is allowed.
-- The explicit DROP statements make this migration safe when older versions of the
-- function already exist with the same typed signature but different parameter names.

drop function if exists public.teacher_update_student_quran_profile(uuid,public.memorization_direction,smallint,smallint);
drop function if exists public.staff_update_student_quran_profile(uuid,public.memorization_direction,smallint,smallint,smallint,smallint,public.program_year);

create function public.staff_update_student_quran_profile(
  p_student_id uuid,
  p_direction public.memorization_direction,
  p_current_surah smallint,
  p_current_ayah smallint,
  p_start_surah smallint default null,
  p_start_ayah smallint default null,
  p_program_year public.program_year default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role public.user_role;
  v_start_surah smallint;
  v_start_ayah smallint;
  v_program_year public.program_year;
  v_start_hizb smallint;
  v_current_page smallint;
  v_current_hizb smallint;
  v_old jsonb;
  v_new jsonb;
begin
  select public.my_role() into v_role;
  if v_role is null then raise exception 'Sign-in required'; end if;

  if not (
    v_role in ('super_admin','admin','principal')
    or (
      v_role='teacher'
      and exists(
        select 1 from public.teacher_students ts
        where ts.teacher_id=v_actor and ts.student_id=p_student_id
      )
    )
  ) then raise exception 'You are not authorized to update this student Quran profile'; end if;

  select s.start_surah,s.start_ayah,s.program_year,
         jsonb_build_object(
           'memorization_direction',s.memorization_direction,
           'start_surah',s.start_surah,'start_ayah',s.start_ayah,
           'current_surah',s.current_surah,'current_ayah',s.current_ayah,
           'current_page',s.current_page,'current_hizb',s.current_hizb,
           'program_year',s.program_year)
  into v_start_surah,v_start_ayah,v_program_year,v_old
  from public.students s where s.id=p_student_id;

  if v_old is null then raise exception 'Student not found'; end if;
  v_start_surah:=coalesce(p_start_surah,v_start_surah);
  v_start_ayah:=coalesce(p_start_ayah,v_start_ayah);
  v_program_year:=coalesce(p_program_year,v_program_year);

  if not exists(select 1 from public.quran_verses where surah=v_start_surah and ayah=v_start_ayah) then
    raise exception 'Invalid Quran start position: Surah %, Ayah %',v_start_surah,v_start_ayah;
  end if;

  select page,hizb into v_current_page,v_current_hizb
  from public.quran_verses where surah=p_current_surah and ayah=p_current_ayah;
  if v_current_page is null then
    raise exception 'Invalid Quran current position: Surah %, Ayah %',p_current_surah,p_current_ayah;
  end if;

  select hizb into v_start_hizb
  from public.quran_verses where surah=v_start_surah and ayah=v_start_ayah;

  -- Deliberately no rule connects start Surah to direction.
  -- Deliberately no rule compares current position with start position.
  update public.students set
    memorization_direction=p_direction,
    start_surah=v_start_surah,
    start_ayah=v_start_ayah,
    start_hizb=v_start_hizb,
    current_surah=p_current_surah,
    current_ayah=p_current_ayah,
    current_page=v_current_page,
    current_hizb=v_current_hizb,
    program_year=v_program_year
  where id=p_student_id;

  select jsonb_build_object(
    'memorization_direction',s.memorization_direction,
    'start_surah',s.start_surah,'start_ayah',s.start_ayah,
    'current_surah',s.current_surah,'current_ayah',s.current_ayah,
    'current_page',s.current_page,'current_hizb',s.current_hizb,
    'program_year',s.program_year)
  into v_new from public.students s where s.id=p_student_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
  values(
    v_actor,
    case when v_role='teacher' then 'teacher_update_quran_profile' else 'admin_update_quran_profile' end,
    'student',p_student_id,v_old,v_new
  );
end;
$function$;

create function public.teacher_update_student_quran_profile(
  p_student_id uuid,
  p_direction public.memorization_direction,
  p_current_surah smallint,
  p_current_ayah smallint
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.staff_update_student_quran_profile(
    p_student_id,
    p_direction,
    p_current_surah,
    p_current_ayah,
    null,
    null,
    null
  );
end;
$function$;

revoke execute on function public.staff_update_student_quran_profile(uuid,public.memorization_direction,smallint,smallint,smallint,smallint,public.program_year) from anon,public;
grant execute on function public.staff_update_student_quran_profile(uuid,public.memorization_direction,smallint,smallint,smallint,smallint,public.program_year) to authenticated;
revoke execute on function public.teacher_update_student_quran_profile(uuid,public.memorization_direction,smallint,smallint) from anon,public;
grant execute on function public.teacher_update_student_quran_profile(uuid,public.memorization_direction,smallint,smallint) to authenticated;

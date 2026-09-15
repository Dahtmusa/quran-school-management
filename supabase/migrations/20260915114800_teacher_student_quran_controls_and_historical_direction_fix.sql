-- Teacher Quran profile controls, student status controls, and historical direction preservation.
-- Applied to production Supabase as migration: teacher_student_quran_controls_and_historical_direction_fix

-- Keep historical submissions faithful to the teacher/student direction and supplied start position.
-- The application uses teacher_submit_historical_eval3; this wrapper now passes the student's
-- current direction/start position into the class workflow instead of allowing the end position
-- to determine the direction.

create or replace function public.teacher_submit_historical_eval3(p_student_id uuid,p_term_id uuid,p_start_surah smallint,p_start_ayah smallint,p_end_surah smallint,p_end_ayah smallint,p_score numeric,p_rubric smallint,p_grade text,p_ayahs integer,p_pages integer,p_hizbs numeric)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_class_id uuid; v_direction text;
begin
  select class_id, memorization_direction::text into v_class_id,v_direction from public.students where id=p_student_id;
  perform public.teacher_submit_historical_class(p_term_id,v_class_id,jsonb_build_array(jsonb_build_object('student_id',p_student_id,'start_surah',p_start_surah,'start_ayah',p_start_ayah,'end_surah',p_end_surah,'end_ayah',p_end_ayah,'direction',v_direction,'score',p_score)));
end;
$$;

create or replace function public.teacher_update_student_quran_profile(p_student_id uuid,p_direction memorization_direction,p_current_surah smallint,p_current_ayah smallint)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_old jsonb; v_new jsonb; v_page smallint; v_hizb smallint; v_tid uuid:=auth.uid();
begin
  if public.my_role()<>'teacher' then raise exception 'Teacher access required'; end if;
  if not exists(select 1 from public.teacher_students where teacher_id=v_tid and student_id=p_student_id) then raise exception 'Student is not assigned to you'; end if;
  select page,hizb into v_page,v_hizb from public.quran_verses where surah=p_current_surah and ayah=p_current_ayah;
  if v_page is null then raise exception 'Invalid Quran position'; end if;
  select jsonb_build_object('memorization_direction',memorization_direction,'current_surah',current_surah,'current_ayah',current_ayah,'current_page',current_page,'current_hizb',current_hizb) into v_old from public.students where id=p_student_id;
  update public.students set memorization_direction=p_direction,current_surah=p_current_surah,current_ayah=p_current_ayah,current_page=v_page,current_hizb=v_hizb where id=p_student_id;
  select jsonb_build_object('memorization_direction',memorization_direction,'current_surah',current_surah,'current_ayah',current_ayah,'current_page',current_page,'current_hizb',current_hizb) into v_new from public.students where id=p_student_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data) values(v_tid,'teacher_update_quran_profile','student',p_student_id,v_old,v_new);
end;
$$;

create or replace function public.teacher_set_student_status(p_student_id uuid,p_status text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_old jsonb; v_new jsonb; v_tid uuid:=auth.uid();
begin
  if public.my_role()<>'teacher' then raise exception 'Teacher access required'; end if;
  if p_status not in ('active','suspended','withdrawn') then raise exception 'Invalid student status'; end if;
  if not exists(select 1 from public.teacher_students where teacher_id=v_tid and student_id=p_student_id) then raise exception 'Student is not assigned to you'; end if;
  select jsonb_build_object('status',status,'removal_reason',removal_reason,'removal_notes',removal_notes,'removed_at',removed_at,'removed_by',removed_by) into v_old from public.students where id=p_student_id;
  if p_status='active' then
    update public.students set status='active',removed_at=null,removed_by=null,removal_reason=null,removal_notes=null where id=p_student_id;
  elsif p_status='suspended' then
    update public.students set status='suspended',removal_reason='Frozen by teacher',removal_notes='Student temporarily frozen from active progression.',removed_at=now(),removed_by=v_tid where id=p_student_id;
  else
    update public.students set status='withdrawn',removal_reason='Marked inactive by teacher',removal_notes='Student marked inactive by assigned teacher; academic records are preserved.',removed_at=now(),removed_by=v_tid where id=p_student_id;
  end if;
  select jsonb_build_object('status',status,'removal_reason',removal_reason,'removal_notes',removal_notes,'removed_at',removed_at,'removed_by',removed_by) into v_new from public.students where id=p_student_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data) values(v_tid,'teacher_set_student_status','student',p_student_id,v_old,v_new);
end;
$$;

revoke all on function public.teacher_update_student_quran_profile(uuid,memorization_direction,smallint,smallint) from public,anon;
grant execute on function public.teacher_update_student_quran_profile(uuid,memorization_direction,smallint,smallint) to authenticated;
revoke all on function public.teacher_set_student_status(uuid,text) from public,anon;
grant execute on function public.teacher_set_student_status(uuid,text) to authenticated;
revoke all on function public.teacher_submit_historical_eval3(uuid,uuid,smallint,smallint,smallint,smallint,numeric,smallint,text,integer,integer,numeric) from public,anon;
grant execute on function public.teacher_submit_historical_eval3(uuid,uuid,smallint,smallint,smallint,smallint,numeric,smallint,text,integer,integer,numeric) to authenticated;

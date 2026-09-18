-- AMQM placement sync v2: update active/prepared/scheduled term enrollments, not historical records.
create or replace function public.teacher_assign_student_to_class(p_student_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_class_id uuid;
  v_teacher_id uuid := auth.uid();
  v_target_year uuid;
  v_teacher_for_class uuid;
begin
  if public.my_role()<>'teacher' then raise exception 'Teacher access required'; end if;

  select class_id into v_class_id
  from public.class_teachers
  where teacher_id=v_teacher_id
  order by is_primary desc,class_id
  limit 1;
  if v_class_id is null then raise exception 'You are not assigned to any class'; end if;

  if not exists(select 1 from public.students where id=p_student_id and class_id is null and status='active') then
    raise exception 'Student is already assigned to a class or is inactive';
  end if;

  select current_academic_year_id into v_target_year
  from public.academic_cycle_settings where id=true;

  update public.students set class_id=v_class_id where id=p_student_id;

  select ct.teacher_id into v_teacher_for_class
  from public.class_teachers ct
  where ct.class_id=v_class_id
  order by ct.is_primary desc,ct.assigned_at asc
  limit 1;

  if v_target_year is not null then
    update public.student_enrollments se
    set class_id=v_class_id,
        teacher_id=coalesce(v_teacher_for_class,v_teacher_id),
        updated_at=now()
    from public.terms t
    where se.student_id=p_student_id
      and se.term_id=t.id
      and se.status='active'
      and t.academic_year_id=v_target_year
      and t.lifecycle_status in ('scheduled','prepared','digital_active');
  end if;
end;
$$;

create or replace function public.teacher_update_student_section(
  p_student_id uuid,p_section public.section_type
)
returns void language plpgsql security definer set search_path=public
as $$
declare v_teacher_id uuid:=auth.uid(); v_target_year uuid; v_class_id uuid;
begin
  if public.my_role()<>'teacher' then raise exception 'Teacher access required'; end if;

  select s.class_id into v_class_id
  from public.students s
  join public.class_teachers ct on ct.class_id=s.class_id and ct.teacher_id=v_teacher_id
  where s.id=p_student_id and s.status='active';
  if v_class_id is null then raise exception 'Student is not in your class'; end if;

  select current_academic_year_id into v_target_year
  from public.academic_cycle_settings where id=true;

  update public.students set section=p_section where id=p_student_id;

  if v_target_year is not null then
    update public.student_enrollments se
    set section=p_section,updated_at=now()
    from public.terms t
    where se.student_id=p_student_id
      and se.term_id=t.id
      and se.status='active'
      and t.academic_year_id=v_target_year
      and t.lifecycle_status in ('scheduled','prepared','digital_active');
  end if;
end;
$$;

grant execute on function public.teacher_assign_student_to_class(uuid) to authenticated;
grant execute on function public.teacher_update_student_section(uuid,public.section_type) to authenticated;
notify pgrst,'reload schema';
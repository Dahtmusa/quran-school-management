-- AMQM placement sync: keep term enrollment data aligned when class/section is changed.
create or replace function public.teacher_assign_student_to_class(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_class_id uuid;
  v_teacher_id uuid := auth.uid();
  v_term_id uuid;
  v_teacher_for_class uuid;
begin
  select class_id into v_class_id
  from public.class_teachers
  where teacher_id=v_teacher_id
  order by is_primary desc,class_id
  limit 1;
  if v_class_id is null then raise exception 'You are not assigned to any class'; end if;

  if not exists(select 1 from public.students where id=p_student_id and class_id is null and status='active') then
    raise exception 'Student is already assigned to a class or is inactive';
  end if;

  select current_term_id into v_term_id
  from public.academic_cycle_settings where id=true;

  update public.students set class_id=v_class_id where id=p_student_id;

  select ct.teacher_id into v_teacher_for_class
  from public.class_teachers ct
  where ct.class_id=v_class_id
  order by ct.is_primary desc,ct.assigned_at asc
  limit 1;

  if v_term_id is not null then
    update public.student_enrollments
    set class_id=v_class_id,teacher_id=coalesce(v_teacher_for_class,v_teacher_id),updated_at=now()
    where student_id=p_student_id and term_id=v_term_id and status='active';
  end if;
end;
$$;

create or replace function public.teacher_update_student_section(
  p_student_id uuid,
  p_section public.section_type
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_term_id uuid;
  v_class_id uuid;
begin
  if public.my_role()<>'teacher' then raise exception 'Teacher access required'; end if;
  select s.class_id into v_class_id
  from public.students s
  join public.class_teachers ct on ct.class_id=s.class_id and ct.teacher_id=v_teacher_id
  where s.id=p_student_id and s.status='active';

  if v_class_id is null then raise exception 'Student is not in your class'; end if;

  select current_term_id into v_term_id
  from public.academic_cycle_settings where id=true;

  update public.students set section=p_section where id=p_student_id;

  if v_term_id is not null then
    update public.student_enrollments
    set section=p_section,updated_at=now()
    where student_id=p_student_id and term_id=v_term_id and status='active';
  end if;
end;
$$;

grant execute on function public.teacher_assign_student_to_class(uuid) to authenticated;
grant execute on function public.teacher_update_student_section(uuid,public.section_type) to authenticated;
notify pgrst,'reload schema';
-- Teacher attendance history and date-scoped marking.
create or replace function public.teacher_record_boarding_attendance(
  p_student_id uuid,
  p_status_code text default 'present',
  p_period text default 'morning',
  p_note text default null,
  p_attendance_date date default ((now() at time zone 'Africa/Lagos')::date)
)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; role_name text; section_name text; today_local date := (now() at time zone 'Africa/Lagos')::date;
begin
  select public.my_role() into role_name;
  if role_name <> 'teacher' then raise exception 'Teacher access required'; end if;
  if p_attendance_date is null then raise exception 'Attendance date is required'; end if;
  if p_attendance_date > today_local then raise exception 'Future attendance cannot be recorded'; end if;
  select s.section::text into section_name from public.students s where s.id=p_student_id and s.status='active';
  if section_name is null then raise exception 'Active student not found'; end if;
  if lower(section_name) <> 'boarding' then raise exception 'Teachers may record attendance for boarding students only. Day-student attendance is recorded at the gate.'; end if;
  if not exists(select 1 from public.teacher_students ts where ts.teacher_id=auth.uid() and ts.student_id=p_student_id) then raise exception 'Student is not assigned to this teacher'; end if;
  if not exists(select 1 from public.attendance_statuses where code=p_status_code and is_active=true) then raise exception 'Invalid attendance status'; end if;
  insert into public.attendance_records(person_id,person_type,scanned_at,attendance_date,status_code,period,review_status,recorded_by,note)
  values(p_student_id,'student',now(),p_attendance_date,p_status_code,p_period,'pending',auth.uid(),p_note)
  on conflict(person_id,attendance_date,period) do update set status_code=excluded.status_code,recorded_by=excluded.recorded_by,note=excluded.note,scanned_at=excluded.scanned_at,review_status='pending'
  returning id into rid;
  insert into public.attendance_audit_logs(record_id,user_id,user_role,action,new_value)
  values(rid,auth.uid(),'teacher','teacher_boarding_attendance',jsonb_build_object('status',p_status_code,'period',p_period,'attendance_date',p_attendance_date,'student_section','boarding'));
  return rid;
end;
$$;
grant execute on function public.teacher_record_boarding_attendance(uuid,text,text,text,date) to authenticated;

create or replace function public.teacher_boarding_attendance_history(
  p_from_date date default ((now() at time zone 'Africa/Lagos')::date - 30),
  p_to_date date default ((now() at time zone 'Africa/Lagos')::date)
)
returns table(attendance_date date,student_id uuid,full_name text,admission_no text,class_name text,status_code text,status_label text,status_color text,review_status text,recorded_at timestamptz)
language sql security definer set search_path=public as $$
  select ar.attendance_date,s.id,s.full_name,s.admission_no,c.name,ar.status_code,ast.label,ast.color,ar.review_status,ar.scanned_at
  from public.attendance_records ar
  join public.students s on s.id=ar.person_id
  left join public.classes c on c.id=s.class_id
  left join public.attendance_statuses ast on ast.code=ar.status_code
  where public.my_role()='teacher' and ar.person_type='student' and lower(s.section::text)='boarding' and s.status='active'
    and ar.attendance_date between least(p_from_date,p_to_date) and least(p_to_date,(now() at time zone 'Africa/Lagos')::date)
    and exists(select 1 from public.teacher_students ts where ts.teacher_id=auth.uid() and ts.student_id=s.id)
  order by ar.attendance_date desc,c.name nulls last,s.full_name;
$$;
grant execute on function public.teacher_boarding_attendance_history(date,date) to authenticated;
notify pgrst,'reload schema';
-- AMQM teacher boarding attendance dashboard
-- Teachers can view and record attendance only for active boarding students assigned to them.
-- Day students remain gate-scanned.

create or replace function public.teacher_boarding_attendance_snapshot(
  p_attendance_date date default ((now() at time zone 'Africa/Lagos')::date),
  p_period text default 'morning'
)
returns table(
  student_id uuid,
  full_name text,
  admission_no text,
  class_name text,
  status_code text,
  status_label text,
  status_color text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as student_id,
    s.full_name,
    s.admission_no,
    c.name as class_name,
    ar.status_code,
    ast.label as status_label,
    ast.color as status_color
  from public.students s
  left join public.classes c on c.id = s.class_id
  left join public.teacher_students ts
    on ts.student_id = s.id
   and ts.teacher_id = auth.uid()
  left join public.attendance_records ar
    on ar.person_id = s.id
   and ar.person_type = 'student'
   and ar.attendance_date = p_attendance_date
   and ar.period = p_period
  left join public.attendance_statuses ast on ast.code = ar.status_code
  where public.my_role() = 'teacher'
    and ts.student_id is not null
    and s.status = 'active'
    and lower(s.section::text) = 'boarding'
  order by coalesce(c.name, ''), s.full_name;
$$;

grant execute on function public.teacher_boarding_attendance_snapshot(date,text) to authenticated;

-- Tighten the existing write RPC so the restriction remains server-side:
-- only assigned active boarding students can be marked by teachers.
create or replace function public.teacher_record_boarding_attendance(
  p_student_id uuid,
  p_status_code text default 'present',
  p_period text default 'morning',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  rid uuid;
  role_name text;
  section_name text;
begin
  select public.my_role() into role_name;
  if role_name <> 'teacher' then
    raise exception 'Teacher access required';
  end if;

  select s.section::text
    into section_name
  from public.students s
  where s.id = p_student_id
    and s.status = 'active';

  if section_name is null then
    raise exception 'Active student not found';
  end if;

  if lower(section_name) <> 'boarding' then
    raise exception 'Teachers may record attendance for boarding students only. Day-student attendance is recorded at the gate.';
  end if;

  if not exists (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
  ) then
    raise exception 'Student is not assigned to this teacher';
  end if;

  if not exists (
    select 1
    from public.attendance_statuses
    where code = p_status_code
      and is_active = true
  ) then
    raise exception 'Invalid attendance status';
  end if;

  insert into public.attendance_records(
    person_id, person_type, scanned_at, attendance_date,
    status_code, period, review_status, recorded_by, note
  )
  values(
    p_student_id, 'student', now(), (now() at time zone 'Africa/Lagos')::date,
    p_status_code, p_period, 'pending', auth.uid(), p_note
  )
  on conflict(person_id,attendance_date,period)
  do update set
    status_code = excluded.status_code,
    recorded_by = excluded.recorded_by,
    note = excluded.note,
    scanned_at = excluded.scanned_at,
    review_status = 'pending'
  returning id into rid;

  insert into public.attendance_audit_logs(
    record_id,user_id,user_role,action,new_value
  )
  values(
    rid,auth.uid(),'teacher','teacher_boarding_attendance',
    jsonb_build_object(
      'status',p_status_code,
      'period',p_period,
      'student_section','boarding'
    )
  );

  return rid;
end;
$$;

grant execute on function public.teacher_record_boarding_attendance(uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';

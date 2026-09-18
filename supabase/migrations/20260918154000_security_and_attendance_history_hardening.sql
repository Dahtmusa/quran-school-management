-- AMQM security and attendance-history hardening
-- Keep teacher-only SECURITY DEFINER RPCs out of the anon API surface.
revoke execute on function public.teacher_boarding_attendance_snapshot(date,text) from anon;
grant execute on function public.teacher_boarding_attendance_snapshot(date,text) to authenticated;

revoke execute on function public.teacher_boarding_attendance_history(date,date) from anon;
grant execute on function public.teacher_boarding_attendance_history(date,date) to authenticated;

revoke execute on function public.teacher_record_boarding_attendance(uuid,text,text,text) from anon;
grant execute on function public.teacher_record_boarding_attendance(uuid,text,text,text) to authenticated;

revoke execute on function public.teacher_record_boarding_attendance(uuid,text,text,text,date) from anon;
grant execute on function public.teacher_record_boarding_attendance(uuid,text,text,text,date) to authenticated;

-- Trigger-only fee exemption guards never need client EXECUTE privileges.
revoke execute on function public.guard_exempt_student_payment() from anon, authenticated;
revoke execute on function public.skip_exempt_student_fee_row() from anon, authenticated;
revoke execute on function public.set_fee_exemption_actor() from anon, authenticated;
revoke execute on function public.guard_fee_exemption_payment_history() from anon, authenticated;
revoke execute on function public.apply_fee_exemption_to_finance_records() from anon, authenticated;

-- Period-scoped history overload: the teacher UI can request only the chosen period.
create or replace function public.teacher_boarding_attendance_history(
  p_from_date date default ((now() at time zone 'Africa/Lagos')::date - 30),
  p_to_date date default ((now() at time zone 'Africa/Lagos')::date),
  p_period text default 'morning'
)
returns table(
  attendance_date date,
  student_id uuid,
  full_name text,
  admission_no text,
  class_name text,
  status_code text,
  status_label text,
  status_color text,
  review_status text,
  recorded_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select ar.attendance_date,s.id,s.full_name,s.admission_no,c.name,
         ar.status_code,ast.label,ast.color,ar.review_status,ar.scanned_at
  from public.attendance_records ar
  join public.students s on s.id=ar.person_id
  left join public.classes c on c.id=s.class_id
  left join public.attendance_statuses ast on ast.code=ar.status_code
  where public.my_role()='teacher'
    and ar.person_type='student'
    and lower(s.section::text)='boarding'
    and s.status='active'
    and ar.period=p_period
    and ar.attendance_date between least(p_from_date,p_to_date)
                              and least(p_to_date,(now() at time zone 'Africa/Lagos')::date)
    and exists (
      select 1 from public.teacher_students ts
      where ts.teacher_id=auth.uid()
        and ts.student_id=s.id
    )
  order by ar.attendance_date desc,c.name nulls last,s.full_name;
$$;
revoke execute on function public.teacher_boarding_attendance_history(date,date,text) from anon;
grant execute on function public.teacher_boarding_attendance_history(date,date,text) to authenticated;

notify pgrst,'reload schema';
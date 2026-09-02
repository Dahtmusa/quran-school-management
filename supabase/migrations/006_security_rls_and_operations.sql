-- Production-oriented access rules for students, progress, attendance, fees and CMS media.

-- Students: administrators manage records; teachers can manage assigned students only through approved workflows.
create policy "admins manage students" on public.students
  for all to authenticated
  using (public.my_role() in ('super_admin','admin','principal','admissions'))
  with check (public.my_role() in ('super_admin','admin','principal','admissions'));

create policy "teachers read assigned students" on public.students
  for select to authenticated
  using (exists(select 1 from public.teacher_students ts where ts.student_id=students.id and ts.teacher_id=auth.uid()));

-- Quran progress is readable by the student's parent, assigned teacher and administrators.
create policy "authorized users read memorization progress" on public.memorization_progress
  for select to authenticated
  using (
    public.my_role() in ('super_admin','admin','principal')
    or teacher_id=auth.uid()
    or exists(select 1 from public.parent_students ps where ps.student_id=memorization_progress.student_id and ps.parent_id=auth.uid())
  );

create policy "teachers create memorization progress" on public.memorization_progress
  for insert to authenticated
  with check (teacher_id=auth.uid() and public.my_role()='teacher' and exists(select 1 from public.teacher_students ts where ts.student_id=memorization_progress.student_id and ts.teacher_id=auth.uid()));

-- Attendance: official records are visible to parents, assigned teachers and administrators.
create policy "authorized users read attendance" on public.attendance_records
  for select to authenticated
  using (
    public.my_role() in ('super_admin','admin','principal','finance')
    or recorded_by=auth.uid()
    or exists(select 1 from public.parent_students ps where ps.student_id=attendance_records.student_id and ps.parent_id=auth.uid())
    or exists(select 1 from public.teacher_students ts where ts.student_id=attendance_records.student_id and ts.teacher_id=auth.uid())
  );

create policy "admins create attendance" on public.attendance_records
  for insert to authenticated
  with check (public.my_role() in ('super_admin','admin','principal'));
create policy "admins update attendance" on public.attendance_records
  for update to authenticated
  using (public.my_role() in ('super_admin','admin','principal'))
  with check (public.my_role() in ('super_admin','admin','principal'));

-- Security staff can view their own pending submissions so they can confirm a scan batch was received.
create policy "security reads own submissions" on public.attendance_submissions
  for select to authenticated
  using (submitted_by=auth.uid() or public.my_role() in ('super_admin','admin','principal'));
create policy "security reads own submission items" on public.attendance_submission_items
  for select to authenticated
  using (exists(select 1 from public.attendance_submissions s where s.id=submission_id and s.submitted_by=auth.uid()) or public.my_role() in ('super_admin','admin','principal'));

-- Do not expose every uploaded media path publicly. Media becomes public only when the CMS marks it public.
alter table public.media_library add column if not exists is_public boolean not null default false;
drop policy if exists "public media published via team profiles" on public.media_library;
create policy "public media only when marked public" on public.media_library
  for select to anon, authenticated
  using (is_public=true or public.my_role() in ('super_admin','admin','principal'));

create policy "admins manage site audit" on public.audit_logs
  for select to authenticated
  using (public.my_role() in ('super_admin','admin','principal'));

-- Staff discipline: Admin decides the warning threshold and fine policy. The function calculates the next warning safely.
create or replace function public.issue_staff_warning(p_staff_id uuid, p_reason text)
returns uuid language plpgsql security invoker as $$
declare
  threshold integer;
  fine numeric;
  enabled boolean;
  next_no integer;
  new_id uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Not authorised'; end if;
  select warning_threshold, fine_amount, enabled into threshold, fine, enabled from public.staff_discipline_settings order by updated_at desc limit 1;
  threshold := coalesce(threshold,3); fine := coalesce(fine,0); enabled := coalesce(enabled,false);
  select coalesce(max(warning_number),0)+1 into next_no from public.staff_warnings where staff_id=p_staff_id;
  insert into public.staff_warnings(staff_id,issued_by,reason,warning_number,fine_amount)
  values(p_staff_id,auth.uid(),p_reason,next_no,case when enabled and next_no >= threshold then fine else 0 end)
  returning id into new_id;

  insert into public.notification_outbox(recipient_profile_id,channel,template_key,payload)
  values(
    p_staff_id,
    'sms',
    'staff_warning',
    jsonb_build_object('warning_number',next_no,'reason',p_reason,'fine_amount',case when enabled and next_no >= threshold then fine else 0 end)
  );
  return new_id;
end $$;

-- Data API grants: RLS remains the authorization layer; these grants only expose the intended tables/functions.
grant select on public.quran_verses to anon, authenticated;
grant select on public.homepage_sections, public.pages, public.site_settings, public.public_team_profiles, public.alumni_profiles, public.graduation_certificates to anon, authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update on public.evaluations to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant execute on function public.approve_attendance_submission(uuid,uuid) to authenticated;
grant execute on function public.issue_staff_warning(uuid,text) to authenticated;

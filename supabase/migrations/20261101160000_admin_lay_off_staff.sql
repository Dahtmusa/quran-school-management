-- Lay-off workflow for staff: one admin click sets employment_status='left',
-- captures a short reason + last day, drops ALL current class assignments and
-- term teacher assignments so no student lands in a dead teacher's roster. The
-- profile and all history (attendance, fines, evaluations) stay intact.

alter table public.profiles
  add column if not exists exit_reason text,
  add column if not exists exit_date date;

create or replace function public.admin_lay_off_staff(
  p_staff_id uuid,
  p_reason text,
  p_last_day date default null
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.profiles;
  v_new public.profiles;
  v_classes_removed int := 0;
  v_terms_removed int := 0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A short reason is required';
  end if;

  select * into v_old from public.profiles where id = p_staff_id for update;
  if not found then raise exception 'Staff member not found'; end if;
  if v_old.role in ('super_admin') then
    raise exception 'Cannot lay off the Director. Please change their role first.';
  end if;
  if v_old.employment_status = 'left' then
    raise exception '% is already laid off.', v_old.full_name;
  end if;

  -- Freeze the profile
  update public.profiles
     set employment_status = 'left',
         exit_reason = trim(p_reason),
         exit_date = coalesce(p_last_day, (now() at time zone 'Africa/Lagos')::date)
   where id = p_staff_id
   returning * into v_new;

  -- Pull them off every class
  delete from public.class_teachers where teacher_id = p_staff_id;
  get diagnostics v_classes_removed = row_count;

  -- Remove from current + future term assignments only; past terms stay for history
  delete from public.term_teacher_assignments
   where teacher_id = p_staff_id
     and term_id in (
       select id from public.terms
        where ends_on >= (now() at time zone 'Africa/Lagos')::date
     );
  get diagnostics v_terms_removed = row_count;

  -- Null out teacher pointer on current-term enrolments so the admin reassigns
  update public.student_enrollments
     set teacher_id = null
   where teacher_id = p_staff_id
     and term_id in (
       select id from public.terms
        where ends_on >= (now() at time zone 'Africa/Lagos')::date
     );

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(),
    'staff:lay_off',
    'profiles',
    p_staff_id,
    jsonb_build_object('full_name', v_old.full_name, 'employment_status', v_old.employment_status, 'role', v_old.role),
    jsonb_build_object(
      'full_name', v_new.full_name,
      'employment_status', v_new.employment_status,
      'exit_reason', v_new.exit_reason,
      'exit_date', v_new.exit_date,
      'classes_unassigned', v_classes_removed,
      'term_assignments_removed', v_terms_removed
    )
  );

  return v_new;
end;
$$;

revoke all on function public.admin_lay_off_staff(uuid, text, date) from public;
grant execute on function public.admin_lay_off_staff(uuid, text, date) to authenticated;

-- Undo helper: reinstates a laid-off staff member (does NOT restore class
-- assignments; admin re-assigns classes manually, which is the safer default).
create or replace function public.admin_reinstate_staff(p_staff_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.profiles;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  update public.profiles
     set employment_status = 'active',
         exit_reason = null,
         exit_date = null
   where id = p_staff_id
   returning * into v_result;
  if not found then raise exception 'Staff member not found'; end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'staff:reinstate', 'profiles', p_staff_id,
          jsonb_build_object('full_name', v_result.full_name));

  return v_result;
end;
$$;

revoke all on function public.admin_reinstate_staff(uuid) from public;
grant execute on function public.admin_reinstate_staff(uuid) to authenticated;

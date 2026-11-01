-- Extend admin_lay_off_staff so a staff member on the public leadership team
-- is also removed from the homepage when laid off. The teacher directory view
-- already filters by employment_status='active' so teachers drop off there
-- automatically; this handles the separate public_team_profiles table used
-- for Director / Supervisor / Admin cards.

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
  v_team_hidden int := 0;
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

  update public.profiles
     set employment_status = 'left',
         exit_reason = trim(p_reason),
         exit_date = coalesce(p_last_day, (now() at time zone 'Africa/Lagos')::date),
         show_on_website = false
   where id = p_staff_id
   returning * into v_new;

  delete from public.class_teachers where teacher_id = p_staff_id;
  get diagnostics v_classes_removed = row_count;

  delete from public.term_teacher_assignments
   where teacher_id = p_staff_id
     and term_id in (select id from public.terms
                     where ends_on >= (now() at time zone 'Africa/Lagos')::date);
  get diagnostics v_terms_removed = row_count;

  update public.student_enrollments
     set teacher_id = null
   where teacher_id = p_staff_id
     and term_id in (select id from public.terms
                     where ends_on >= (now() at time zone 'Africa/Lagos')::date);

  -- Hide them from the Leadership strip / staff cards on the public homepage
  update public.public_team_profiles
     set published = false,
         display_on_homepage = false
   where lower(trim(full_name)) = lower(trim(v_old.full_name));
  get diagnostics v_team_hidden = row_count;

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
      'term_assignments_removed', v_terms_removed,
      'team_cards_hidden', v_team_hidden
    )
  );

  return v_new;
end;
$$;

grant execute on function public.admin_lay_off_staff(uuid, text, date) to authenticated;

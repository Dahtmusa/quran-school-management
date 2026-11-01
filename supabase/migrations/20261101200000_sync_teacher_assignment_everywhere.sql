-- When admin assigns a teacher to a class, the system must propagate that
-- assignment to every place that reads it:
--  1. public.class_teachers        (the long-lived link; already handled)
--  2. public.term_teacher_assignments for current + future terms
--  3. public.student_enrollments.teacher_id for every active student in the
--     class in those terms
-- The Evaluations teacher view reads via (2) and (3), which is why a newly
-- assigned teacher saw "0 students to evaluate" even though the class had 24.

create or replace function public.admin_assign_teacher_to_class(
  p_class_id uuid,
  p_teacher_id uuid,
  p_is_primary boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term_ids uuid[];
  v_enrol_count int := 0;
  v_term_count int := 0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  -- Guard: teacher must exist and be active
  perform 1 from public.profiles
   where id = p_teacher_id and role = 'teacher' and employment_status = 'active';
  if not found then
    raise exception 'Teacher must be an active teacher profile';
  end if;

  insert into public.class_teachers(class_id, teacher_id, is_primary)
    values (p_class_id, p_teacher_id, coalesce(p_is_primary, false))
    on conflict(class_id, teacher_id) do update set is_primary = excluded.is_primary;

  select array_agg(id) into v_term_ids
    from public.terms
   where ends_on >= (now() at time zone 'Africa/Lagos')::date;

  if v_term_ids is not null then
    insert into public.term_teacher_assignments(term_id, class_id, teacher_id, is_primary, source)
      select t, p_class_id, p_teacher_id, coalesce(p_is_primary, false), 'admin_ui'
        from unnest(v_term_ids) t
      on conflict(term_id, class_id, teacher_id) do update set is_primary = excluded.is_primary;
    get diagnostics v_term_count = row_count;

    update public.student_enrollments se
       set teacher_id = p_teacher_id
     where se.class_id = p_class_id
       and se.status = 'active'
       and se.term_id = any(v_term_ids);
    get diagnostics v_enrol_count = row_count;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'teacher:assign_to_class', 'classes', p_class_id,
          jsonb_build_object('teacher_id', p_teacher_id, 'is_primary', p_is_primary,
                             'terms_touched', coalesce(array_length(v_term_ids,1), 0),
                             'enrolments_updated', v_enrol_count));

  return jsonb_build_object(
    'class_id', p_class_id,
    'teacher_id', p_teacher_id,
    'terms_touched', coalesce(array_length(v_term_ids, 1), 0),
    'enrolments_updated', v_enrol_count,
    'term_assignments_affected', v_term_count
  );
end;
$$;

revoke all on function public.admin_assign_teacher_to_class(uuid, uuid, boolean) from public;
grant execute on function public.admin_assign_teacher_to_class(uuid, uuid, boolean) to authenticated;

-- Removal mirror
create or replace function public.admin_remove_teacher_from_class(
  p_class_id uuid,
  p_teacher_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term_ids uuid[];
  v_enrol_count int := 0;
  v_term_count int := 0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  delete from public.class_teachers
   where class_id = p_class_id and teacher_id = p_teacher_id;

  select array_agg(id) into v_term_ids
    from public.terms
   where ends_on >= (now() at time zone 'Africa/Lagos')::date;

  if v_term_ids is not null then
    delete from public.term_teacher_assignments
     where class_id = p_class_id and teacher_id = p_teacher_id
       and term_id = any(v_term_ids);
    get diagnostics v_term_count = row_count;

    update public.student_enrollments
       set teacher_id = null
     where class_id = p_class_id and teacher_id = p_teacher_id
       and term_id = any(v_term_ids);
    get diagnostics v_enrol_count = row_count;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'teacher:remove_from_class', 'classes', p_class_id,
          jsonb_build_object('teacher_id', p_teacher_id,
                             'enrolments_cleared', v_enrol_count,
                             'term_assignments_removed', v_term_count));

  return jsonb_build_object(
    'class_id', p_class_id,
    'teacher_id', p_teacher_id,
    'enrolments_cleared', v_enrol_count,
    'term_assignments_removed', v_term_count
  );
end;
$$;

revoke all on function public.admin_remove_teacher_from_class(uuid, uuid) from public;
grant execute on function public.admin_remove_teacher_from_class(uuid, uuid) to authenticated;

-- One-time repair: for every current/future-term enrolment whose class has a
-- class_teachers row but whose teacher_id is null (or stale), set it. This
-- fixes the Shu'batu Ibn Amr (II) situation where Sa'ad was just assigned.
do $$
declare
  v_term_ids uuid[];
begin
  select array_agg(id) into v_term_ids
    from public.terms
   where ends_on >= (now() at time zone 'Africa/Lagos')::date;

  if v_term_ids is null then return; end if;

  -- Make sure term_teacher_assignments mirrors class_teachers for live terms
  insert into public.term_teacher_assignments(term_id, class_id, teacher_id, is_primary, source)
    select t.id, ct.class_id, ct.teacher_id, ct.is_primary, 'auto_repair_20261101'
      from public.class_teachers ct
      cross join unnest(v_term_ids) tid
      join public.terms t on t.id = tid
    on conflict(term_id, class_id, teacher_id) do update set is_primary = excluded.is_primary;

  -- Push the single primary (or earliest-added) teacher onto each live-term enrolment
  update public.student_enrollments se
     set teacher_id = sub.teacher_id
    from (
      select distinct on (ct.class_id) ct.class_id, ct.teacher_id
        from public.class_teachers ct
        join public.profiles p on p.id = ct.teacher_id and p.employment_status = 'active'
      order by ct.class_id, ct.is_primary desc, ct.assigned_at asc
    ) sub
   where se.class_id = sub.class_id
     and se.status = 'active'
     and se.term_id = any(v_term_ids)
     and (se.teacher_id is null or se.teacher_id <> sub.teacher_id);
end $$;

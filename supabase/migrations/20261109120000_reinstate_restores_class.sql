-- Reinstated students came back with no class.
--
-- admin_remove_student clears students.class_id, and admin_reinstate_student
-- only flipped the status back to 'active'. A classless student has no
-- teacher, never gets evaluation drafts, and shows as "Unassigned" on report
-- cards (e.g. Lukman Musa Adamu, reinstated 2026-11-02).
--
-- Now: removal remembers the class, reinstatement restores it (falling back to
-- the most recent class in the student's term enrolments), and placing an
-- active student into a class creates any missing evaluation drafts for open
-- evaluations. Students who are already classless are left for the school to
-- place by hand (whether each removal/reinstatement was intended is theirs to judge).

alter table public.students
  add column if not exists removed_from_class_id uuid;  -- no FK: a second students->classes link breaks class loading

-- The class a student last belonged to, if it still exists and is active.
create or replace function public.amqm_last_known_class(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.removed_from_class_id
       from public.students s
       join public.classes c on c.id = s.removed_from_class_id and c.active
      where s.id = p_student_id),
    (select se.class_id
       from public.student_enrollments se
       join public.terms t on t.id = se.term_id
       join public.classes c on c.id = se.class_id and c.active
      where se.student_id = p_student_id and se.class_id is not null
      order by t.starts_on desc
      limit 1)
  );
$$;
revoke all on function public.amqm_last_known_class(uuid) from public, anon, authenticated;

-- Put a student into a class and keep current/future term enrolments in step
-- (same rules as assigning from the Students page).
create or replace function public.amqm_place_student_in_class(p_student_id uuid, p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_teacher uuid;
begin
  update public.students set class_id = p_class_id where id = p_student_id;

  select ct.teacher_id into v_teacher
    from public.class_teachers ct
    join public.profiles p on p.id = ct.teacher_id and p.employment_status = 'active'
   where ct.class_id = p_class_id
   order by ct.is_primary desc nulls last, ct.assigned_at asc
   limit 1;

  update public.student_enrollments se
     set class_id = p_class_id, teacher_id = v_teacher, updated_at = now()
   where se.student_id = p_student_id
     and se.term_id in (select id from public.terms where ends_on >= (now() at time zone 'Africa/Lagos')::date);
end;
$$;
revoke all on function public.amqm_place_student_in_class(uuid, uuid) from public, anon, authenticated;

create or replace function public.admin_remove_student(
  p_student_id uuid,
  p_status     text,
  p_reason     text,
  p_notes      text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('suspended','expelled','withdrawn') then
    raise exception 'Invalid status. Must be suspended, expelled, or withdrawn.';
  end if;
  update public.students set
    status                = p_status,
    removal_reason        = p_reason,
    removal_notes         = p_notes,
    removed_at            = now(),
    removed_by            = auth.uid(),
    removed_from_class_id = coalesce(class_id, removed_from_class_id),  -- remembered for reinstatement
    class_id              = null
  where id = p_student_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'student_removed', 'student', p_student_id,
    jsonb_build_object('status', p_status, 'reason', p_reason, 'notes', p_notes));
end $$;

create or replace function public.admin_reinstate_student(p_student_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_class uuid; v_class_name text;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Admin access required';
  end if;

  v_class := public.amqm_last_known_class(p_student_id);

  update public.students set
    status                = 'active',
    removal_reason        = null,
    removal_notes         = null,
    removed_at            = null,
    removed_by            = null
  where id = p_student_id;

  if v_class is not null and (select class_id from public.students where id = p_student_id) is null then
    perform public.amqm_place_student_in_class(p_student_id, v_class);
  end if;
  update public.students set removed_from_class_id = null where id = p_student_id;

  select name into v_class_name from public.classes where id = v_class;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'student_reinstated', 'student', p_student_id,
          jsonb_build_object('class_restored', v_class_name));
end $$;

-- When an active student lands in a class, create any missing drafts for
-- evaluations that are already open, so their teacher can evaluate them.
-- Never block the class change itself if that fails (e.g. a student with no
-- recorded Qur'an position yet).
create or replace function public.amqm_drafts_after_class_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_id is not null and new.status = 'active' then
    begin
      perform public.amqm_backfill_evaluation_drafts();
    exception when others then
      raise warning 'Could not create evaluation drafts after class change for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists amqm_drafts_after_class_change on public.students;
create trigger amqm_drafts_after_class_change
after update of class_id, status on public.students
for each row
when (new.class_id is distinct from old.class_id or new.status is distinct from old.status)
execute function public.amqm_drafts_after_class_change();

notify pgrst, 'reload schema';

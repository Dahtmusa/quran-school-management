-- Evaluation integrity: enforce the rules in the database, not in buttons.
--
-- Repeated problems all had one shape: two copies of the same fact drifting
-- apart because only some screens kept them in step. Each rule below is now a
-- trigger on the table itself, so it holds whichever screen or tool changes it:
--
--   1. An active student in a class with a teacher has an evaluation draft for
--      every scheduled/open evaluation of the current term (incl. students
--      added or moved in after it opened).
--   2. A student who is not active, or has no class, has no unstarted drafts.
--   3. Changing a student's class keeps their current/future term enrolment
--      and their open/returned evaluations pointed at the new class teacher.
--   4. Changing a class's teachers (assign, remove, lay-off) re-points that
--      class's open/returned evaluations and enrolments to the new teacher.
--      Before this, the new teacher could see the students but not submit,
--      because submission requires the evaluation to be assigned to them.
--   (Drafts following the student's position: 20261109140000.)
--
-- Plus amqm_evaluation_health_check(): one list of everything still wrong.

-- The class's teacher of record: primary first, then longest-serving, active only.
create or replace function public.amqm_class_primary_teacher(p_class_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ct.teacher_id
    from public.class_teachers ct
    join public.profiles p on p.id = ct.teacher_id and p.employment_status = 'active'
   where ct.class_id = p_class_id
   order by ct.is_primary desc nulls last, ct.assigned_at asc
   limit 1;
$$;
revoke all on function public.amqm_class_primary_teacher(uuid) from public, anon;
grant execute on function public.amqm_class_primary_teacher(uuid) to authenticated;

-- Rule 1 for one student.
create or replace function public.amqm_backfill_student_drafts(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.students;
  v_term uuid;
  v_teacher uuid;
  c record;
  n int := 0;
begin
  select * into s from public.students where id = p_student_id;
  if s.id is null or s.status <> 'active' or s.class_id is null
     or s.current_surah is null or s.current_ayah is null then
    return 0;
  end if;
  select id into v_term from public.terms where is_current = true order by starts_on desc limit 1;
  if v_term is null then return 0; end if;
  v_teacher := public.amqm_class_primary_teacher(s.class_id);
  if v_teacher is null then return 0; end if;

  for c in
    select * from public.evaluation_campaigns
     where term_id = v_term and status in ('scheduled','open')
  loop
    insert into public.evaluation_campaign_classes(campaign_id, class_id)
    values (c.id, s.class_id) on conflict do nothing;

    if not exists (select 1 from public.evaluations e
                    where e.student_id = s.id and e.term_id = v_term and e.evaluation_number = c.evaluation_number) then
      insert into public.evaluations(
        student_id, teacher_id, term_id, evaluation_number, status,
        teacher_visible, teacher_visible_at, campaign_id,
        from_surah, from_ayah, to_surah, to_ayah
      ) values (
        s.id, v_teacher, v_term, c.evaluation_number, 'draft',
        c.status = 'open', case when c.status = 'open' then now() end, c.id,
        s.current_surah, s.current_ayah, null, null
      );
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.amqm_backfill_student_drafts(uuid) from public, anon, authenticated;

-- Rules 1–3, on the students table.
create or replace function public.amqm_student_membership_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_teacher uuid;
begin
  if new.status <> 'active' or new.class_id is null then
    delete from public.evaluations where student_id = new.id and status = 'draft';
    return new;
  end if;

  if tg_op = 'INSERT' or new.class_id is distinct from old.class_id then
    v_teacher := public.amqm_class_primary_teacher(new.class_id);
    update public.student_enrollments
       set class_id = new.class_id, teacher_id = v_teacher, updated_at = now()
     where student_id = new.id
       and term_id in (select id from public.terms where ends_on >= (now() at time zone 'Africa/Lagos')::date)
       and (class_id is distinct from new.class_id or teacher_id is distinct from v_teacher);
    if v_teacher is not null then
      update public.evaluations
         set teacher_id = v_teacher
       where student_id = new.id and status in ('draft','returned') and teacher_id is distinct from v_teacher;
    end if;
  end if;

  -- Never block the student change itself if drafts can't be created.
  begin
    perform public.amqm_backfill_student_drafts(new.id);
  exception when others then
    raise warning 'Could not create evaluation drafts for student %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists amqm_drafts_after_class_change on public.students;  -- superseded
drop trigger if exists amqm_student_membership_sync on public.students;
create trigger amqm_student_membership_sync
after insert or update of status, class_id on public.students
for each row execute function public.amqm_student_membership_sync();

-- Rule 4, on the class_teachers table.
create or replace function public.amqm_class_teacher_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid := coalesce(new.class_id, old.class_id);
  v_teacher uuid := public.amqm_class_primary_teacher(coalesce(new.class_id, old.class_id));
  r record;
begin
  update public.student_enrollments se
     set teacher_id = v_teacher, updated_at = now()
    from public.students s
   where se.student_id = s.id and s.class_id = v_class
     and se.term_id in (select id from public.terms where ends_on >= (now() at time zone 'Africa/Lagos')::date)
     and se.teacher_id is distinct from v_teacher;

  if v_teacher is not null then
    update public.evaluations e
       set teacher_id = v_teacher
      from public.students s
     where e.student_id = s.id and s.class_id = v_class
       and e.status in ('draft','returned') and e.teacher_id is distinct from v_teacher;

    for r in select id from public.students where class_id = v_class and status = 'active' loop
      begin
        perform public.amqm_backfill_student_drafts(r.id);
      exception when others then
        raise warning 'Could not create evaluation drafts for student %: %', r.id, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists amqm_class_teacher_sync on public.class_teachers;
create trigger amqm_class_teacher_sync
after insert or update or delete on public.class_teachers
for each row execute function public.amqm_class_teacher_sync();

-- ---------------------------------------------------------------------------
-- Health check: everything that would stop a teacher evaluating correctly or
-- an admin trusting the result, in one list.
create or replace function public.amqm_evaluation_health_check()
returns table (severity text, area text, subject text, detail text, how_to_fix text)
language sql
stable
security definer
set search_path = public
as $$
with
cur as (select id from public.terms where is_current = true order by starts_on desc limit 1),
live_terms as (select id from public.terms where ends_on >= (now() at time zone 'Africa/Lagos')::date),
act as (
  select s.*, c.name as class_name,
         public.amqm_class_primary_teacher(s.class_id) as class_teacher,
         (select global_ayah from public.quran_verses q where q.surah = s.current_surah and q.ayah = s.current_ayah) as cur_g,
         (select global_ayah from public.quran_verses q where q.surah = s.start_surah and q.ayah = s.start_ayah) as start_g
    from public.students s
    left join public.classes c on c.id = s.class_id
   where s.status = 'active'
),
last_eval as (
  select distinct on (e.student_id) e.student_id, e.from_surah, e.from_ayah, e.to_surah, e.to_ayah,
         (select global_ayah from public.quran_verses q where q.surah = e.from_surah and q.ayah = e.from_ayah) as from_g,
         (select global_ayah from public.quran_verses q where q.surah = e.to_surah and q.ayah = e.to_ayah) as to_g
    from public.evaluations e join public.terms t on t.id = e.term_id
   where e.status = 'approved' and e.to_surah is not null
   order by e.student_id, t.starts_on desc, e.evaluation_number desc
),
open_c as (
  select c.* from public.evaluation_campaigns c, cur
   where c.term_id = cur.id and c.status = 'open' and now() between c.opens_at and c.closes_at
)
-- errors: things that block or corrupt an evaluation
select 'error', 'No class', a.full_name || ' (' || a.admission_no || ')',
       'Active student is not in any class, so no teacher can evaluate them.',
       'Students: place them in a class, or remove them if they have left.'
  from act a where a.class_id is null
union all
select 'error', 'No teacher', c.name,
       count(*) || ' active student(s) in a class with no active teacher.',
       'Classes: assign a teacher to this class.'
  from act a join public.classes c on c.id = a.class_id
 where a.class_teacher is null group by c.name
union all
select 'error', 'No Qur''an position', a.full_name || ' (' || a.admission_no || ')',
       'Student has no current Qur''an position recorded, so they cannot be evaluated.',
       'Students: Edit profile and set their current position.'
  from act a where a.current_surah is null or a.current_ayah is null
union all
select 'error', 'Position before start', a.full_name || ' (' || a.admission_no || ')',
       'Current position ' || a.current_surah || ':' || a.current_ayah || ' is on the wrong side of their start '
       || a.start_surah || ':' || a.start_ayah || ' for ' || replace(a.memorization_direction::text, '_', ' ') || '.',
       'Check their direction and start position on their profile.'
  from act a
 where a.cur_g is not null and a.start_g is not null
   and ((a.memorization_direction = 'baqarah_to_nas' and a.cur_g < a.start_g)
     or (a.memorization_direction = 'nas_to_baqarah' and a.cur_g > a.start_g))
union all
select 'error', 'Missing evaluation', a.full_name || ' (' || a.admission_no || ')',
       'Evaluation ' || oc.evaluation_number || ' is open but this student has no evaluation for it.',
       'Usually fixed automatically; if it stays, check their class, teacher and position.'
  from act a cross join open_c oc
 where a.class_id is not null and a.class_teacher is not null and a.current_surah is not null
   and not exists (select 1 from public.evaluations e
                    where e.student_id = a.id and e.term_id = oc.term_id and e.evaluation_number = oc.evaluation_number)
union all
select 'error', 'Evaluation start out of step', a.full_name || ' (' || a.admission_no || ')',
       'Open evaluation starts at ' || e.from_surah || ':' || e.from_ayah || ' but their position is '
       || a.current_surah || ':' || a.current_ayah || '.',
       'Re-save their position on their profile (open evaluations then follow it).'
  from act a join public.evaluations e on e.student_id = a.id and e.status = 'draft'
 where e.from_surah is distinct from a.current_surah or e.from_ayah is distinct from a.current_ayah
union all
select 'error', 'Wrong teacher on evaluation', a.full_name || ' (' || a.admission_no || ')',
       'Evaluation ' || e.evaluation_number || ' is assigned to ' || coalesce(p.full_name, 'nobody')
       || ', not the class teacher ' || coalesce(ct.full_name, '—') || '; the class teacher cannot submit it.',
       'Re-save the class''s teacher on the Classes page.'
  from act a
  join public.evaluations e on e.student_id = a.id and e.status in ('draft','returned')
  left join public.profiles p on p.id = e.teacher_id
  left join public.profiles ct on ct.id = a.class_teacher
 where a.class_teacher is not null and e.teacher_id is distinct from a.class_teacher
union all
select 'error', 'Removed student still listed', s.full_name || ' (' || s.admission_no || ')',
       'Student is ' || s.status || ' but still has an open (' || e.status || ') evaluation.',
       'Unstarted ones are removed automatically; review returned ones in Evaluations.'
  from public.students s join public.evaluations e on e.student_id = s.id
 where s.status <> 'active' and e.status in ('draft','returned')
union all
-- warnings: data that looks wrong and needs a human
select 'warning', 'Position differs from evaluation', a.full_name || ' (' || a.admission_no || ')',
       'Position ' || a.current_surah || ':' || a.current_ayah || ' but last approved evaluation stopped at '
       || le.to_surah || ':' || le.to_ayah || '.',
       'Confirm with the teacher which is right; correct the profile or the evaluation.'
  from act a join last_eval le on le.student_id = a.id
 where a.cur_g is distinct from le.to_g
union all
select 'warning', 'Suspicious evaluation', a.full_name || ' (' || a.admission_no || ')',
       'Last approved evaluation ' || le.from_surah || ':' || le.from_ayah || ' → ' || le.to_surah || ':' || le.to_ayah
       || case when abs(le.to_g - le.from_g) > 1000 then ' covers ' || abs(le.to_g - le.from_g) || ' ayahs in one evaluation'
               else ' goes the wrong way for ' || replace(a.memorization_direction::text, '_', ' ') end || '.',
       'Alumni page → Potential alumni, or correct it with the teacher.'
  from act a join last_eval le on le.student_id = a.id
 where le.from_g is not null and le.to_g is not null
   and (abs(le.to_g - le.from_g) > 1000
     or (a.memorization_direction = 'baqarah_to_nas' and le.to_g < le.from_g)
     or (a.memorization_direction = 'nas_to_baqarah' and le.to_g > le.from_g))
union all
select 'warning', 'Enrolment out of step', a.full_name || ' (' || a.admission_no || ')',
       'This term''s enrolment still shows a different class.',
       'Re-save the student''s class.'
  from act a join public.student_enrollments se on se.student_id = a.id and se.term_id in (select id from live_terms)
 where se.class_id is distinct from a.class_id
union all
select 'warning', 'Closing soon', coalesce(p.full_name, 'Unassigned'),
       count(*) || ' student(s) not yet submitted for Evaluation ' || oc.evaluation_number
       || '; closes ' || to_char(oc.closes_at at time zone 'Africa/Lagos', 'DD Mon HH24:MI') || '.',
       'Remind the teacher, or extend the close date in the School Calendar.'
  from open_c oc
  join public.evaluations e on e.campaign_id = oc.id and e.status = 'draft'
  join public.students s on s.id = e.student_id and s.status = 'active'
  left join public.profiles p on p.id = e.teacher_id
 where oc.closes_at < now() + interval '48 hours'
 group by p.full_name, oc.evaluation_number, oc.closes_at
union all
select 'info', 'Awaiting your approval', coalesce(c.name, 'No class'),
       count(*) || ' evaluation(s) submitted and waiting for review.',
       'Evaluations: review and approve or return.'
  from public.evaluations e join public.students s on s.id = e.student_id
  left join public.classes c on c.id = s.class_id
 where e.status = 'pending_approval' group by c.name;
$$;

-- Lock it down by role inside a wrapper (language sql + stable can't raise).
create or replace function public.admin_evaluation_health_check()
returns table (severity text, area text, subject text, detail text, how_to_fix text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  return query
    select h.* from public.amqm_evaluation_health_check() h
     order by case h.severity when 'error' then 0 when 'warning' then 1 else 2 end, h.area, h.subject;
end;
$$;
revoke all on function public.amqm_evaluation_health_check() from public, anon, authenticated;
revoke all on function public.admin_evaluation_health_check() from public, anon;
grant execute on function public.admin_evaluation_health_check() to authenticated;

-- One-time: apply the rules to today's data.
do $$
declare r record;
begin
  -- unstarted drafts of non-active or classless students
  delete from public.evaluations e using public.students s
   where e.student_id = s.id and e.status = 'draft' and (s.status <> 'active' or s.class_id is null);

  -- open/returned evaluations pointed at the class teacher
  update public.evaluations e
     set teacher_id = public.amqm_class_primary_teacher(s.class_id)
    from public.students s
   where e.student_id = s.id and s.status = 'active' and s.class_id is not null
     and e.status in ('draft','returned')
     and public.amqm_class_primary_teacher(s.class_id) is not null
     and e.teacher_id is distinct from public.amqm_class_primary_teacher(s.class_id);

  -- missing drafts
  for r in select id from public.students where status = 'active' and class_id is not null loop
    begin
      perform public.amqm_backfill_student_drafts(r.id);
    exception when others then
      raise warning 'Could not create evaluation drafts for student %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

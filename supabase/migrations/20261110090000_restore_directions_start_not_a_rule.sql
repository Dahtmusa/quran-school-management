-- Restore the 15 memorization directions changed on 2026-11-09, and stop
-- treating the historical "start position" as a rule.
--
-- On 2026-11-09 fifteen directions were flipped because each student's start
-- position was on the wrong side of their current position. That was a
-- mistake: e.g. in Shu'batu Imam Asim, Saudat Salisu Abdullahi's evaluations
-- clearly move forward Baqarah-to-Nas (17:103 -> 27:35); only her recorded
-- start (28:1) was off. The profile is the source of truth for the pattern,
-- so every flipped direction goes back to its original value (from the audit
-- log).
--
-- What matters for evaluations is the pattern (direction) and the current
-- position on the profile. The start position is history, not a rule, so the
-- profile guard now only checks that positions are real Qur'an positions.
-- (Run 20261109240000 before this file; this file replaces its profile guard
-- and health check.)

create or replace function public.validate_student_quran_journey()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_surah is not null and new.start_ayah is not null
     and not exists (select 1 from public.quran_verses where surah = new.start_surah and ayah = new.start_ayah) then
    raise exception 'Invalid Quran start position: Surah %, Ayah %', new.start_surah, new.start_ayah;
  end if;
  if new.current_surah is not null and new.current_ayah is not null
     and not exists (select 1 from public.quran_verses where surah = new.current_surah and ayah = new.current_ayah) then
    raise exception 'Invalid Quran current position: Surah %, Ayah %', new.current_surah, new.current_ayah;
  end if;
  return new;
end;
$$;

do $$
declare r record; n int := 0;
begin
  for r in
    select distinct on (a.entity_id) a.entity_id, a.old_data->>'direction' as original
      from public.audit_logs a
     where a.action = 'quran_record:direction_corrected' and a.old_data ? 'direction'
     order by a.entity_id, a.created_at asc
  loop
    update public.students
       set memorization_direction = r.original::public.memorization_direction
     where id = r.entity_id and memorization_direction::text <> r.original;
    if found then
      insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
      values (auth.uid(), 'quran_record:direction_restored', 'students', r.entity_id,
              jsonb_build_object('direction', r.original, 'reason', 'Undo 2026-11-09 direction flip; profile pattern is the source of truth'));
      n := n + 1;
    end if;
  end loop;
  raise notice 'Restored original direction for % student(s)', n;
end $$;

-- Health check without the start-position rule.
create or replace function public.amqm_evaluation_health_check()
returns table (severity text, area text, subject text, detail text, how_to_fix text)
language sql
stable
security definer
set search_path = public
as $$
with
cur as (select id from public.terms where is_current = true order by starts_on desc limit 1),
act as (
  select s.*, c.name as class_name,
         public.amqm_class_primary_teacher(s.class_id) as class_teacher,
         (select global_ayah from public.quran_verses q where q.surah = s.current_surah and q.ayah = s.current_ayah) as cur_g,
         (select global_ayah from public.quran_verses q where q.surah = s.start_surah and q.ayah = s.start_ayah) as start_g
    from public.students s
    left join public.classes c on c.id = s.class_id
   where s.status = 'active'
),
open_c as (
  select c.* from public.evaluation_campaigns c, cur
   where c.term_id = cur.id and c.status = 'open' and now() between c.opens_at and c.closes_at
),
term_evals as (
  select e.* from public.evaluations e, cur where e.term_id = cur.id
)
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
select 'error', 'Profile has no Qur''an position', a.full_name || ' (' || a.admission_no || ')',
       'The profile has no current position, so there is nothing to start the evaluation from.',
       'Students: Edit profile and set their current position.'
  from act a where a.current_surah is null or a.current_ayah is null
union all
select 'error', 'Class teacher cannot open the teacher page', p.full_name,
       'Teaches ' || string_agg(distinct c.name, ', ') || ' but the account role is ' || p.role || ', so they cannot submit evaluations.',
       'Staff: give this person a teacher account, or assign the class to a teacher.'
  from public.class_teachers ct
  join public.profiles p on p.id = ct.teacher_id and p.employment_status = 'active' and p.role <> 'teacher'
  join public.classes c on c.id = ct.class_id
  join act a on a.class_id = ct.class_id
 group by p.full_name, p.role
union all
select 'error', 'Missing evaluation', a.full_name || ' (' || a.admission_no || ')',
       'Evaluation ' || oc.evaluation_number || ' is open but this student has no evaluation for it.',
       'Usually fixed automatically; if it stays, check their class, teacher and profile position.'
  from act a cross join open_c oc
 where a.class_id is not null and a.class_teacher is not null and a.current_surah is not null
   and not exists (select 1 from term_evals e where e.student_id = a.id and e.evaluation_number = oc.evaluation_number)
union all
select 'error', 'Evaluation does not start at profile position', a.full_name || ' (' || a.admission_no || ')',
       'Evaluation starts at ' || e.from_surah || ':' || e.from_ayah || ', profile says '
       || a.current_surah || ':' || a.current_ayah || '.',
       'Re-save the student''s position on their profile.'
  from act a join term_evals e on e.student_id = a.id and e.status = 'draft'
 where e.from_surah is distinct from a.current_surah or e.from_ayah is distinct from a.current_ayah
union all
select 'error', 'Evaluation assigned to wrong teacher', a.full_name || ' (' || a.admission_no || ')',
       'Evaluation ' || e.evaluation_number || ' is assigned to ' || coalesce(p.full_name, 'nobody')
       || ', not the class teacher ' || coalesce(ct.full_name, '—') || '.',
       'Re-save the class''s teacher on the Classes page.'
  from act a
  join term_evals e on e.student_id = a.id and e.status in ('draft','returned')
  left join public.profiles p on p.id = e.teacher_id
  left join public.profiles ct on ct.id = a.class_teacher
 where a.class_teacher is not null and e.teacher_id is distinct from a.class_teacher
union all
select 'warning', 'Closing soon', coalesce(p.full_name, 'Unassigned'),
       count(*) || ' student(s) not yet submitted for Evaluation ' || oc.evaluation_number
       || '; closes ' || to_char(oc.closes_at at time zone 'Africa/Lagos', 'DD Mon HH24:MI') || '.',
       'Remind the teacher, or extend the close date in the School Calendar.'
  from open_c oc
  join term_evals e on e.campaign_id = oc.id and e.status = 'draft'
  join public.students s on s.id = e.student_id and s.status = 'active'
  left join public.profiles p on p.id = e.teacher_id
 where oc.closes_at < now() + interval '48 hours'
 group by p.full_name, oc.evaluation_number, oc.closes_at
union all
select 'info', 'Awaiting your approval', s.full_name || ' (' || s.admission_no || ')',
       'Evaluation ' || e.evaluation_number || ' · ' || coalesce(c.name, 'No class') || '.',
       'Evaluations: review and approve or return.'
  from term_evals e
  join public.students s on s.id = e.student_id
  left join public.classes c on c.id = s.class_id
 where e.status = 'pending_approval';
$$;

notify pgrst, 'reload schema';

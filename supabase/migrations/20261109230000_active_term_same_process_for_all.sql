-- Active term only. One process for every class, every evaluation, every
-- teacher, with the student profile as the source of truth.
--
-- The process approved evaluations already followed:
--   1. The evaluation starts at the position on the student's profile.
--   2. It is assigned to the student's class teacher.
--   3. The teacher enters where the student stopped (forward for the
--      direction on the profile) and submits.
--   4. Admin approves; the profile moves to that stop, and the student's next
--      evaluation starts from there.
--
-- This re-applies steps 1–2 to every not-yet-submitted evaluation of the
-- active term in every class, and makes the health check look only at the
-- active term.

do $$
declare v_term uuid; r record;
begin
  select id into v_term from public.terms where is_current = true order by starts_on desc limit 1;
  if v_term is null then return; end if;

  -- Step 1: every unsubmitted evaluation starts at the profile position.
  update public.evaluations e
     set from_surah = s.current_surah, from_ayah = s.current_ayah,
         to_surah = null, to_ayah = null
    from public.students s
   where e.student_id = s.id and e.term_id = v_term and e.status = 'draft'
     and s.status = 'active' and s.current_surah is not null and s.current_ayah is not null
     and (e.from_surah is distinct from s.current_surah or e.from_ayah is distinct from s.current_ayah);

  -- Step 2: assigned to the class teacher.
  update public.evaluations e
     set teacher_id = public.amqm_class_primary_teacher(s.class_id)
    from public.students s
   where e.student_id = s.id and e.term_id = v_term and e.status in ('draft','returned')
     and s.status = 'active' and s.class_id is not null
     and public.amqm_class_primary_teacher(s.class_id) is not null
     and e.teacher_id is distinct from public.amqm_class_primary_teacher(s.class_id);

  -- Every active student in a class has their evaluation.
  for r in select id from public.students where status = 'active' and class_id is not null loop
    begin
      perform public.amqm_backfill_student_drafts(r.id);
    exception when others then
      raise warning 'Could not create evaluation for student %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

-- Health check: active term only, and only things that stop the process.
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
select 'error', 'Profile direction and position disagree', a.full_name || ' (' || a.admission_no || ')',
       'Profile says ' || replace(a.memorization_direction::text, '_', ' ') || ', started ' || a.start_surah || ':' || a.start_ayah
       || ', now ' || a.current_surah || ':' || a.current_ayah || ' — that is backwards for this direction.',
       'Students: Edit profile and correct the direction or start position.'
  from act a
 where a.cur_g is not null and a.start_g is not null
   and ((a.memorization_direction = 'baqarah_to_nas' and a.cur_g < a.start_g)
     or (a.memorization_direction = 'nas_to_baqarah' and a.cur_g > a.start_g))
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

-- Health check refinements after its first real run:
--  * "Suspicious evaluation": a student's first (baseline) evaluation records all
--    memorization done before joining, so a large range there is normal. The
--    over-1000-ayahs check now applies only to evaluations from an evaluation
--    window (campaign); wrong-direction is still checked for all.
--  * "Enrolment out of step": skip students with no class (already reported
--    under "No class").

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
  select distinct on (e.student_id) e.student_id, e.campaign_id, e.from_surah, e.from_ayah, e.to_surah, e.to_ayah,
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
       || case when le.campaign_id is not null and abs(le.to_g - le.from_g) > 1000 then ' covers ' || abs(le.to_g - le.from_g) || ' ayahs in one evaluation'
               else ' goes the wrong way for ' || replace(a.memorization_direction::text, '_', ' ') end || '.',
       'Alumni page → Potential alumni, or correct it with the teacher.'
  from act a join last_eval le on le.student_id = a.id
 where le.from_g is not null and le.to_g is not null
   and ((le.campaign_id is not null and abs(le.to_g - le.from_g) > 1000)
     or (a.memorization_direction = 'baqarah_to_nas' and le.to_g < le.from_g)
     or (a.memorization_direction = 'nas_to_baqarah' and le.to_g > le.from_g))
union all
select 'warning', 'Enrolment out of step', a.full_name || ' (' || a.admission_no || ')',
       'This term''s enrolment still shows a different class.',
       'Re-save the student''s class.'
  from act a join public.student_enrollments se on se.student_id = a.id and se.term_id in (select id from live_terms)
 where a.class_id is not null and se.class_id is distinct from a.class_id
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

notify pgrst, 'reload schema';

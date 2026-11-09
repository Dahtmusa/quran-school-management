-- Audit of the submit path: three things that stop teachers recording
-- correct evaluations.
--
-- 1. Nas-to-Baqarah progress inside a surah was rejected.
--    The journey goes through the surahs backwards (114, 113, ...) but inside
--    each surah the ayahs are still memorized forwards. All the checks used a
--    single backwards order for every ayah, so 67:10 -> 67:20 for a
--    Nas-to-Baqarah student was "going backwards" and refused, both when the
--    teacher submits and when the admin approves (the profile guard).
--    Now every check uses the journey order for the direction:
--      Baqarah-to-Nas: surah up, then ayah up.
--      Nas-to-Baqarah: surah down, then ayah up.
--
-- 2. Only the evaluation's assigned teacher could submit, so a second teacher
--    of the same class saw the students but got "not assigned to you". Any
--    teacher of the student's class may now submit; the evaluation is then
--    assigned to whoever submitted it.
--
-- 3. The health check now flags class teachers whose account is not a
--    teacher account (they cannot open the teacher page to submit).

-- Position along the student's journey: bigger = further along.
create or replace function public.amqm_journey_rank(p_surah int, p_ayah int, p_direction public.memorization_direction)
returns integer
language sql
immutable
as $$
  select case when p_direction = 'nas_to_baqarah'
              then (114 - p_surah) * 1000 + p_ayah
              else p_surah * 1000 + p_ayah end;
$$;

-- Evaluation guard (same as 20261031210000 except the direction check).
create or replace function public.validate_evaluation_position()
returns trigger
language plpgsql
security invoker
as $$
declare
  direction public.memorization_direction;
  current_s smallint;
  current_a smallint;
  from_global integer;
  to_global   integer;
  from_meta   record;
  to_meta     record;
begin
  if TG_OP = 'UPDATE'
     and NEW.from_surah is not distinct from OLD.from_surah
     and NEW.from_ayah  is not distinct from OLD.from_ayah
  then
    null;
  else
    select memorization_direction, current_surah, current_ayah
      into direction, current_s, current_a
      from public.students where id = NEW.student_id for update;

    select * into from_meta from public.quran_verses
     where surah = NEW.from_surah and ayah = NEW.from_ayah;
    if from_meta.global_ayah is null then
      raise exception 'Quran metadata is missing for the starting position. Seed quran_verses before creating evaluations.';
    end if;
    if current_s is null or current_a is null then
      raise exception 'Student must have an official current Quran position before evaluation.';
    end if;
    if NEW.from_surah is distinct from current_s or NEW.from_ayah is distinct from current_a then
      raise exception 'Evaluation must start from the student current official memorization position.';
    end if;
    from_global := from_meta.global_ayah;
  end if;

  if NEW.to_surah is not null and NEW.to_ayah is not null then
    select * into to_meta from public.quran_verses
     where surah = NEW.to_surah and ayah = NEW.to_ayah;
    if to_meta.global_ayah is null then
      raise exception 'Quran metadata is missing for the stopping position.';
    end if;
    if direction is null then
      select memorization_direction into direction from public.students where id = NEW.student_id;
    end if;
    if from_global is null then
      select global_ayah into from_global from public.quran_verses where surah = NEW.from_surah and ayah = NEW.from_ayah;
    end if;
    to_global := to_meta.global_ayah;

    if public.amqm_journey_rank(NEW.to_surah, NEW.to_ayah, direction)
       <= public.amqm_journey_rank(NEW.from_surah, NEW.from_ayah, direction) then
      raise exception 'Stopping position % : % must be further along than the starting position % : % for %.',
        NEW.to_surah, NEW.to_ayah, NEW.from_surah, NEW.from_ayah,
        case when direction = 'nas_to_baqarah' then 'Nas-to-Baqarah' else 'Baqarah-to-Nas' end;
    end if;

    if from_meta is null then
      select * into from_meta from public.quran_verses where surah = NEW.from_surah and ayah = NEW.from_ayah;
    end if;
    NEW.from_page       := from_meta.page;
    NEW.to_page         := to_meta.page;
    NEW.memorized_ayahs := abs(to_global - from_global);
    NEW.memorized_pages := abs(to_meta.page - from_meta.page);
    NEW.memorized_hizbs := abs(to_meta.hizb - from_meta.hizb);
  end if;

  return NEW;
end;
$$;

-- Profile guard: current position may not be behind the start, in journey order.
create or replace function public.validate_student_quran_journey()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_surah is null or new.start_ayah is null or new.current_surah is null
     or new.current_ayah is null or new.memorization_direction is null then
    return new;
  end if;
  if not exists (select 1 from public.quran_verses where surah = new.start_surah and ayah = new.start_ayah) then
    raise exception 'Invalid Quran start position: Surah %, Ayah %', new.start_surah, new.start_ayah;
  end if;
  if not exists (select 1 from public.quran_verses where surah = new.current_surah and ayah = new.current_ayah) then
    raise exception 'Invalid Quran current position: Surah %, Ayah %', new.current_surah, new.current_ayah;
  end if;
  if public.amqm_journey_rank(new.current_surah, new.current_ayah, new.memorization_direction)
     < public.amqm_journey_rank(new.start_surah, new.start_ayah, new.memorization_direction) then
    raise exception 'Current position % : % is behind the start position % : % for %.',
      new.current_surah, new.current_ayah, new.start_surah, new.start_ayah,
      case when new.memorization_direction = 'nas_to_baqarah' then 'Nas-to-Baqarah' else 'Baqarah-to-Nas' end;
  end if;
  return new;
end;
$$;

-- Submission: any teacher of the student's class may submit.
create or replace function public.submit_teacher_evaluation(
  p_evaluation_id uuid,
  p_to_surah      smallint,
  p_to_ayah       smallint,
  p_memorization  numeric,
  p_accuracy      numeric,
  p_fluency       numeric,
  p_tajweed       numeric,
  p_retention     numeric,
  p_score         numeric,
  p_comment       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.evaluations;
  c public.evaluation_campaigns;
  s public.students;
  v_quality numeric;
  v_quran_pct numeric;
begin
  if public.my_role() <> 'teacher' then
    raise exception 'Teacher access required';
  end if;

  select ev.* into e
    from public.evaluations ev
    join public.students st on st.id = ev.student_id
   where ev.id = p_evaluation_id
     and (ev.teacher_id = auth.uid()
          or exists (select 1 from public.class_teachers ct
                      where ct.class_id = st.class_id and ct.teacher_id = auth.uid()))
   for update of ev;
  if e.id is null then
    raise exception 'Evaluation not found, or this student is not in your class';
  end if;
  if e.status not in ('draft','returned') then
    raise exception 'This evaluation is no longer editable';
  end if;

  select * into c from public.evaluation_campaigns where id = e.campaign_id;
  if e.status = 'draft' and (c.id is null or now() < c.opens_at or now() > c.closes_at) then
    raise exception 'This evaluation window is not open';
  end if;

  select * into s from public.students where id = e.student_id;
  if s.id is null then raise exception 'Student not found'; end if;
  if s.status <> 'active' then raise exception '% is not an active student', s.full_name; end if;

  v_quality := round(((p_memorization + p_accuracy + p_fluency + p_tajweed + p_retention) / 25) * 100, 2);
  v_quran_pct := greatest(0, least(150, round(coalesce(p_score, 0), 2)));

  update public.evaluations
     set to_surah            = p_to_surah,
         to_ayah             = p_to_ayah,
         teacher_id          = auth.uid(),
         memorization_score  = p_memorization,
         accuracy_score      = p_accuracy,
         fluency_score       = p_fluency,
         tajweed_score       = p_tajweed,
         retention_score     = p_retention,
         score               = v_quran_pct,
         quality_score       = v_quality,
         grade               = public.evaluation_grade(v_quran_pct),
         teacher_comment     = coalesce(nullif(trim(p_comment),''),
                                        public.generate_evaluation_comment(
                                          p_memorization, p_accuracy, p_fluency,
                                          p_tajweed, p_retention, v_quran_pct)),
         status              = 'pending_approval',
         submitted_at        = now(),
         teacher_visible     = false,
         auto_submitted      = false
   where id = e.id;
end;
$$;

grant execute on function public.submit_teacher_evaluation(
  uuid, smallint, smallint, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

notify pgrst, 'reload schema';

-- Health check: direction check in journey order; flag class teachers without a teacher account.
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
   and public.amqm_journey_rank(a.current_surah, a.current_ayah, a.memorization_direction)
       < public.amqm_journey_rank(a.start_surah, a.start_ayah, a.memorization_direction)
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

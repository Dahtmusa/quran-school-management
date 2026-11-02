-- Potential alumni must be based on evidence, not on the current-position
-- field alone. Four students showed "100% memorized" when none had finished:
-- one approved evaluation typed as 17:49 -> 1:1 (half the Qur'an in one
-- evaluation), and three whose current position no longer matched their last
-- approved evaluation (and one of them was withdrawn).
--
-- A student now appears only if they are active / graduated / already alumni,
-- and each row carries plain-language data checks. `ready` is true only when
-- the latest approved evaluation really ends on the final verse for the
-- student's direction and no check fails.

drop function if exists public.amqm_potential_alumni();

create function public.amqm_potential_alumni()
returns table (
  student_id        uuid,
  full_name         text,
  admission_no      text,
  photo_url         text,
  class_name        text,
  teacher_name      text,
  memorization_direction text,
  current_surah     smallint,
  current_ayah      smallint,
  progress_percent  numeric,
  status            text,
  outstanding_fees  numeric,
  evaluations_count integer,
  already_promoted  boolean,
  last_evaluation   text,
  issues            text[],
  ready             boolean
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select s.*,
           (select max(global_ayah) from public.quran_verses) as max_global,
           (select q.global_ayah from public.quran_verses q
             where q.surah = s.current_surah and q.ayah = s.current_ayah limit 1) as current_global
      from public.students s
     where public.my_role() in ('super_admin','admin','principal')
       and s.status in ('active','graduated','alumni')
       and not exists (select 1 from public.alumni_profiles ap where ap.student_id = s.id)
  ),
  withlast as (
    select b.*,
           case when b.memorization_direction = 'nas_to_baqarah'::public.memorization_direction then 1 else b.max_global end as end_global,
           le.from_surah as le_from_surah, le.from_ayah as le_from_ayah,
           le.to_surah as le_to_surah, le.to_ayah as le_to_ayah,
           (select q.global_ayah from public.quran_verses q where q.surah = le.from_surah and q.ayah = le.from_ayah limit 1) as le_from_global,
           (select q.global_ayah from public.quran_verses q where q.surah = le.to_surah and q.ayah = le.to_ayah limit 1) as le_to_global
      from base b
      left join lateral (
        select e.from_surah, e.from_ayah, e.to_surah, e.to_ayah
          from public.evaluations e
          join public.terms t on t.id = e.term_id
         where e.student_id = b.id and e.status = 'approved' and e.to_surah is not null
         order by t.starts_on desc, e.evaluation_number desc
         limit 1
      ) le on true
  ),
  checked as (
    select w.*,
           (w.le_to_global is not null and w.le_to_global = w.end_global) as eval_finished,
           array_remove(array[
             case when w.le_to_global is null
                  then 'No approved evaluation on record' end,
             case when w.le_to_global is not null and w.le_to_global <> w.end_global
                  then 'Last approved evaluation stops at ' || w.le_to_surah || ':' || w.le_to_ayah
                       || ', not the final verse (' || case when w.end_global = 1 then '1:1' else '114:6' end || ')' end,
             case when w.le_to_global is not null and w.current_global is not null and w.current_global <> w.le_to_global
                  then 'Current position ' || w.current_surah || ':' || w.current_ayah
                       || ' does not match the last approved evaluation (' || w.le_to_surah || ':' || w.le_to_ayah || ')' end,
             case when w.le_from_global is not null and w.le_to_global is not null and abs(w.le_to_global - w.le_from_global) > 1000
                  then 'Last approved evaluation jumps ' || abs(w.le_to_global - w.le_from_global)
                       || ' ayahs in one evaluation (' || w.le_from_surah || ':' || w.le_from_ayah || ' to '
                       || w.le_to_surah || ':' || w.le_to_ayah || '), likely a typing error' end,
             case when w.le_to_surah is not null and (
                       (w.memorization_direction = 'nas_to_baqarah'::public.memorization_direction and w.le_to_surah > w.le_from_surah)
                    or (w.memorization_direction = 'baqarah_to_nas'::public.memorization_direction and w.le_to_surah < w.le_from_surah))
                  then 'Last approved evaluation goes the wrong way for a '
                       || replace(w.memorization_direction::text, '_', ' ') || ' student' end
           ], null) as found_issues
      from withlast w
  )
  select
    c.id,
    c.full_name,
    c.admission_no,
    c.photo_url,
    cl.name,
    tp.full_name,
    c.memorization_direction::text,
    c.current_surah,
    c.current_ayah,
    coalesce((select cp0.progress_percent from public.get_student_canonical_quran_progress(c.id) cp0 limit 1), 0),
    c.status::text,
    coalesce((select sum(sf.amount_due - sf.amount_paid) from public.student_fees sf
               where sf.student_id = c.id and sf.amount_paid < sf.amount_due), 0),
    (select count(*) from public.evaluations e where e.student_id = c.id)::int,
    false,
    case when c.le_to_surah is not null
         then c.le_from_surah || ':' || c.le_from_ayah || ' → ' || c.le_to_surah || ':' || c.le_to_ayah end,
    c.found_issues,
    c.eval_finished and coalesce(array_length(c.found_issues, 1), 0) = 0
  from checked c
  left join public.classes cl on cl.id = c.class_id
  left join lateral (
    select ct.teacher_id from public.class_teachers ct
     where ct.class_id = c.class_id
     order by ct.is_primary desc nulls last, ct.assigned_at asc
     limit 1
  ) ct on true
  left join public.profiles tp on tp.id = ct.teacher_id
  -- Show a student if anything claims completion, so bad data surfaces here
  -- for review instead of hiding.
  where c.status = 'alumni'
     or c.eval_finished
     or (c.current_global is not null and c.current_global = c.end_global)
     or coalesce((select cp0.progress_percent from public.get_student_canonical_quran_progress(c.id) cp0 limit 1), 0) >= 99.5
  order by (c.eval_finished and coalesce(array_length(c.found_issues, 1), 0) = 0) desc, c.full_name;
$$;

revoke all on function public.amqm_potential_alumni() from public;
grant execute on function public.amqm_potential_alumni() to authenticated;

notify pgrst, 'reload schema';

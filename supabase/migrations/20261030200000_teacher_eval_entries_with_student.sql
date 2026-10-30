-- Dedicated RPC for the teacher evaluation entry grid. The previous
-- amqm_teacher_operational_evaluations returned bare "evaluations"
-- rows with no student join, so the UI could not render the student
-- name, admission number, or memorization direction -- every row
-- looked identical and the score math fell back to Surah 2 Ayah 1
-- defaults.
--
-- This RPC returns a flat row with the fields the grid actually
-- needs. Includes a live class_teachers match so a mid-term
-- teacher reassignment is picked up automatically.

create or replace function public.amqm_teacher_evaluation_entries()
returns table (
  evaluation_id      uuid,
  campaign_id        uuid,
  evaluation_number  smallint,
  status             text,
  from_surah         smallint,
  from_ayah          smallint,
  to_surah           smallint,
  to_ayah            smallint,
  memorization_score numeric,
  accuracy_score     numeric,
  fluency_score      numeric,
  tajweed_score      numeric,
  retention_score    numeric,
  teacher_comment    text,
  student_id         uuid,
  full_name          text,
  admission_no       text,
  photo_url          text,
  class_name         text,
  memorization_direction text,
  current_surah      smallint,
  current_ayah       smallint,
  campaign_closes_at timestamptz
) language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() <> 'teacher' then return; end if;

  return query
    select distinct on (e.id)
           e.id,
           e.campaign_id,
           e.evaluation_number,
           e.status::text,
           e.from_surah,
           e.from_ayah,
           e.to_surah,
           e.to_ayah,
           e.memorization_score,
           e.accuracy_score,
           e.fluency_score,
           e.tajweed_score,
           e.retention_score,
           e.teacher_comment,
           s.id,
           s.full_name,
           s.admission_no,
           s.photo_url,
           cls.name,
           s.memorization_direction::text,
           s.current_surah,
           s.current_ayah,
           c.closes_at
      from public.evaluations e
      join public.students s on s.id = e.student_id
      join public.terms t    on t.id = e.term_id
 left join public.classes cls on cls.id = s.class_id
 left join public.evaluation_campaigns c on c.id = e.campaign_id
     where t.is_current = true
       and e.status in ('draft','returned')
       and (
         e.teacher_id = auth.uid()
         or exists (
           select 1 from public.class_teachers ct
            where ct.class_id = s.class_id
              and ct.teacher_id = auth.uid()
         )
       )
     order by e.id,
              e.teacher_visible_at desc nulls last,
              s.full_name asc;
end;
$$;

grant execute on function public.amqm_teacher_evaluation_entries() to authenticated;

notify pgrst, 'reload schema';

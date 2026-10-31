-- The teacher UI now computes the real Quran completion % at the
-- stopping position and sends it as p_score to submit_teacher_
-- evaluation. The RPC was ignoring p_score and recomputing from the
-- five rubrics instead, so the stored score was still the old
-- rubric-sum model. Fix: trust p_score as the Quran completion %
-- and store the rubric sum separately as a quality indicator.

-- 1. Add a quality_score column that preserves the five-rubric
--    average alongside the real Quran %. Null-safe default so old
--    rows do not break.
alter table public.evaluations
  add column if not exists quality_score numeric(5,2);

-- 2. Rewrite submit_teacher_evaluation to:
--    * trust p_score as the real Quran completion % (clamped to a
--      sane 0 to 150 range to catch obvious client bugs);
--    * store the rubric average in quality_score;
--    * leave grade computation based on the Quran % so report cards
--      honour real progress, not teacher opinion.
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

  select * into e from public.evaluations
   where id = p_evaluation_id and teacher_id = auth.uid()
   for update;
  if e.id is null then
    raise exception 'Evaluation not found or not assigned to you';
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

  -- Quality % is the rubric average: (sum of 5 rubrics / 25) * 100.
  v_quality := round(((p_memorization + p_accuracy + p_fluency + p_tajweed + p_retention) / 25) * 100, 2);

  -- Real Quran completion % comes from the client. Clamp to a sane
  -- range so a bad client value cannot store a nonsense score.
  v_quran_pct := greatest(0, least(150, round(coalesce(p_score, 0), 2)));

  update public.evaluations
     set to_surah            = p_to_surah,
         to_ayah             = p_to_ayah,
         memorization_score  = p_memorization,
         accuracy_score      = p_accuracy,
         fluency_score       = p_fluency,
         tajweed_score       = p_tajweed,
         retention_score     = p_retention,
         score               = v_quran_pct,              -- real Quran %
         quality_score       = v_quality,                -- rubric average
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
  uuid, smallint, smallint,
  numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

notify pgrst, 'reload schema';

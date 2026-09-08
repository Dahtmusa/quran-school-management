-- Migration 077: Teacher historical Eval 3 submission
-- Teachers submit Eval 3 for their own students as pending_approval.
-- Eval 1 and Eval 2 are created as approved placeholders (same as admin capture_term mode).
-- Admin reviews and approves Eval 3 through the normal evaluation workflow.

CREATE OR REPLACE FUNCTION public.teacher_submit_historical_eval3(
  p_student_id  uuid,
  p_term_id     uuid,
  p_start_surah smallint,
  p_start_ayah  smallint,
  p_end_surah   smallint,
  p_end_ayah    smallint,
  p_score       numeric,
  p_rubric      smallint,
  p_grade       text,
  p_ayahs       integer,
  p_pages       integer,
  p_hizbs       numeric
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tid uuid := auth.uid();
BEGIN
  -- Must be a teacher
  IF public.my_role() <> 'teacher' THEN
    RAISE EXCEPTION 'Teacher access required';
  END IF;

  -- Must have this student assigned
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_students
    WHERE teacher_id = v_tid AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'This student is not assigned to you';
  END IF;

  -- Eval 1 — approved placeholder (0 progress, start = end)
  INSERT INTO public.evaluations(
    student_id, teacher_id, term_id, evaluation_number, status,
    from_surah, from_ayah, to_surah, to_ayah,
    memorized_ayahs, memorized_pages, memorized_hizbs,
    memorization_score, accuracy_score, fluency_score, tajweed_score, retention_score,
    score, grade, submitted_at, approved_at, approved_by
  ) VALUES (
    p_student_id, v_tid, p_term_id, 1, 'approved',
    p_start_surah, p_start_ayah, p_start_surah, p_start_ayah,
    0, 0, 0,
    p_rubric, p_rubric, p_rubric, p_rubric, p_rubric,
    0, p_grade, now(), now(), v_tid
  )
  ON CONFLICT (student_id, term_id, evaluation_number)
  DO UPDATE SET
    from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah,
    to_surah   = EXCLUDED.to_surah,   to_ayah   = EXCLUDED.to_ayah,
    score = 0, status = 'approved',
    approved_at = now(), approved_by = v_tid;

  -- Eval 2 — approved placeholder (0 progress, start = end)
  INSERT INTO public.evaluations(
    student_id, teacher_id, term_id, evaluation_number, status,
    from_surah, from_ayah, to_surah, to_ayah,
    memorized_ayahs, memorized_pages, memorized_hizbs,
    memorization_score, accuracy_score, fluency_score, tajweed_score, retention_score,
    score, grade, submitted_at, approved_at, approved_by
  ) VALUES (
    p_student_id, v_tid, p_term_id, 2, 'approved',
    p_start_surah, p_start_ayah, p_start_surah, p_start_ayah,
    0, 0, 0,
    p_rubric, p_rubric, p_rubric, p_rubric, p_rubric,
    0, p_grade, now(), now(), v_tid
  )
  ON CONFLICT (student_id, term_id, evaluation_number)
  DO UPDATE SET
    from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah,
    to_surah   = EXCLUDED.to_surah,   to_ayah   = EXCLUDED.to_ayah,
    score = 0, status = 'approved',
    approved_at = now(), approved_by = v_tid;

  -- Eval 3 — pending_approval (admin must review)
  INSERT INTO public.evaluations(
    student_id, teacher_id, term_id, evaluation_number, status,
    from_surah, from_ayah, to_surah, to_ayah,
    memorized_ayahs, memorized_pages, memorized_hizbs,
    memorization_score, accuracy_score, fluency_score, tajweed_score, retention_score,
    score, grade, submitted_at
  ) VALUES (
    p_student_id, v_tid, p_term_id, 3, 'pending_approval',
    p_start_surah, p_start_ayah, p_end_surah, p_end_ayah,
    p_ayahs, p_pages, p_hizbs,
    p_rubric, p_rubric, p_rubric, p_rubric, p_rubric,
    p_score, p_grade, now()
  )
  ON CONFLICT (student_id, term_id, evaluation_number)
  DO UPDATE SET
    from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah,
    to_surah   = EXCLUDED.to_surah,   to_ayah   = EXCLUDED.to_ayah,
    memorized_ayahs = EXCLUDED.memorized_ayahs,
    memorized_pages = EXCLUDED.memorized_pages,
    memorized_hizbs = EXCLUDED.memorized_hizbs,
    memorization_score = EXCLUDED.memorization_score,
    accuracy_score     = EXCLUDED.accuracy_score,
    fluency_score      = EXCLUDED.fluency_score,
    tajweed_score      = EXCLUDED.tajweed_score,
    retention_score    = EXCLUDED.retention_score,
    score = EXCLUDED.score, grade = EXCLUDED.grade,
    status = 'pending_approval',
    submitted_at = now(),
    approved_at = NULL, approved_by = NULL;

  -- Update student current position
  UPDATE public.students SET
    current_surah = p_end_surah,
    current_ayah  = p_end_ayah
  WHERE id = p_student_id;
END $$;

GRANT EXECUTE ON FUNCTION public.teacher_submit_historical_eval3(
  uuid, uuid, smallint, smallint, smallint, smallint,
  numeric, smallint, text, integer, integer, numeric
) TO authenticated;

NOTIFY pgrst, 'reload schema';

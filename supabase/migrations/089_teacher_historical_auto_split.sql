-- Migration 089: Auto-split historical eval into 3 equal segments
--
-- Teacher enters only start + current/final position.
-- The function divides the total global-ayah range into 3 equal thirds and
-- finds the nearest real verse for each split point, giving eval1, eval2, eval3
-- their own proper segment. Score/grade from the overall performance is shared
-- across all three. Eval 1 and 2 are auto-approved; Eval 3 is pending_approval.

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
  v_tid  uuid := auth.uid();
  v_now  timestamptz := now();

  r_start record; r_end record;
  r_e1    record; r_e2  record;

  g_start integer; g_end integer; g_total integer;
  g_split1 integer; g_split2 integer;

  -- Per-segment metrics
  v1_ayahs integer; v1_pages integer; v1_hizbs numeric;
  v2_ayahs integer; v2_pages integer; v2_hizbs numeric;
  v3_ayahs integer; v3_pages integer; v3_hizbs numeric;
BEGIN
  IF public.my_role() <> 'teacher' THEN
    RAISE EXCEPTION 'Teacher access required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_students
    WHERE teacher_id = v_tid AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'This student is not assigned to you';
  END IF;

  -- Fetch verse metadata for start and end
  SELECT * INTO r_start FROM public.quran_verses
    WHERE surah = p_start_surah AND ayah = p_start_ayah;
  SELECT * INTO r_end FROM public.quran_verses
    WHERE surah = p_end_surah AND ayah = p_end_ayah;

  IF r_start IS NULL THEN
    RAISE EXCEPTION 'Invalid start position (surah % ayah %)', p_start_surah, p_start_ayah;
  END IF;
  IF r_end IS NULL THEN
    RAISE EXCEPTION 'Invalid end position (surah % ayah %)', p_end_surah, p_end_ayah;
  END IF;

  g_start := r_start.global_ayah;
  g_end   := r_end.global_ayah;
  g_total := abs(g_end - g_start);

  -- ── Split into thirds ────────────────────────────────────────────────────
  -- Walk in the same direction as the student (B→N increases, N→B decreases)
  IF g_end >= g_start THEN
    g_split1 := g_start + (g_total / 3);
    g_split2 := g_start + (g_total * 2 / 3);
  ELSE
    g_split1 := g_start - (g_total / 3);
    g_split2 := g_start - (g_total * 2 / 3);
  END IF;

  -- Find the nearest real verse for each split point
  SELECT * INTO r_e1 FROM public.quran_verses
    ORDER BY abs(global_ayah - g_split1) LIMIT 1;
  SELECT * INTO r_e2 FROM public.quran_verses
    ORDER BY abs(global_ayah - g_split2) LIMIT 1;

  -- Per-segment metrics
  v1_ayahs := abs(r_e1.global_ayah - r_start.global_ayah);
  v1_pages := abs(r_e1.page        - r_start.page);
  v1_hizbs := abs(r_e1.hizb        - r_start.hizb);

  v2_ayahs := abs(r_e2.global_ayah - r_e1.global_ayah);
  v2_pages := abs(r_e2.page        - r_e1.page);
  v2_hizbs := abs(r_e2.hizb        - r_e1.hizb);

  v3_ayahs := abs(r_end.global_ayah - r_e2.global_ayah);
  v3_pages := abs(r_end.page        - r_e2.page);
  v3_hizbs := abs(r_end.hizb        - r_e2.hizb);

  -- Bypass position trigger for historical inserts
  PERFORM set_config('app.historical_import', 'true', true);

  -- ── Eval 1: start → 1st third ────────────────────────────────────────────
  INSERT INTO public.evaluations(
    student_id, teacher_id, term_id, evaluation_number, status,
    from_surah, from_ayah, to_surah, to_ayah,
    memorized_ayahs, memorized_pages, memorized_hizbs,
    memorization_score, accuracy_score, fluency_score, tajweed_score, retention_score,
    score, grade, submitted_at, approved_at, approved_by
  ) VALUES (
    p_student_id, v_tid, p_term_id, 1, 'approved',
    p_start_surah, p_start_ayah, r_e1.surah, r_e1.ayah,
    v1_ayahs, v1_pages, v1_hizbs,
    p_rubric, p_rubric, p_rubric, p_rubric, p_rubric,
    p_score, p_grade, v_now, v_now, v_tid
  )
  ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
    from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah,
    to_surah   = EXCLUDED.to_surah,   to_ayah   = EXCLUDED.to_ayah,
    memorized_ayahs = EXCLUDED.memorized_ayahs,
    memorized_pages = EXCLUDED.memorized_pages,
    memorized_hizbs = EXCLUDED.memorized_hizbs,
    memorization_score = EXCLUDED.memorization_score,
    accuracy_score = EXCLUDED.accuracy_score,
    fluency_score  = EXCLUDED.fluency_score,
    tajweed_score  = EXCLUDED.tajweed_score,
    retention_score = EXCLUDED.retention_score,
    score = EXCLUDED.score, grade = EXCLUDED.grade,
    status = 'approved', approved_at = v_now, approved_by = v_tid;

  -- ── Eval 2: 1st third → 2nd third ────────────────────────────────────────
  INSERT INTO public.evaluations(
    student_id, teacher_id, term_id, evaluation_number, status,
    from_surah, from_ayah, to_surah, to_ayah,
    memorized_ayahs, memorized_pages, memorized_hizbs,
    memorization_score, accuracy_score, fluency_score, tajweed_score, retention_score,
    score, grade, submitted_at, approved_at, approved_by
  ) VALUES (
    p_student_id, v_tid, p_term_id, 2, 'approved',
    r_e1.surah, r_e1.ayah, r_e2.surah, r_e2.ayah,
    v2_ayahs, v2_pages, v2_hizbs,
    p_rubric, p_rubric, p_rubric, p_rubric, p_rubric,
    p_score, p_grade, v_now, v_now, v_tid
  )
  ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
    from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah,
    to_surah   = EXCLUDED.to_surah,   to_ayah   = EXCLUDED.to_ayah,
    memorized_ayahs = EXCLUDED.memorized_ayahs,
    memorized_pages = EXCLUDED.memorized_pages,
    memorized_hizbs = EXCLUDED.memorized_hizbs,
    memorization_score = EXCLUDED.memorization_score,
    accuracy_score = EXCLUDED.accuracy_score,
    fluency_score  = EXCLUDED.fluency_score,
    tajweed_score  = EXCLUDED.tajweed_score,
    retention_score = EXCLUDED.retention_score,
    score = EXCLUDED.score, grade = EXCLUDED.grade,
    status = 'approved', approved_at = v_now, approved_by = v_tid;

  -- ── Eval 3: 2nd third → final (pending admin approval) ───────────────────
  INSERT INTO public.evaluations(
    student_id, teacher_id, term_id, evaluation_number, status,
    from_surah, from_ayah, to_surah, to_ayah,
    memorized_ayahs, memorized_pages, memorized_hizbs,
    memorization_score, accuracy_score, fluency_score, tajweed_score, retention_score,
    score, grade, submitted_at
  ) VALUES (
    p_student_id, v_tid, p_term_id, 3, 'pending_approval',
    r_e2.surah, r_e2.ayah, p_end_surah, p_end_ayah,
    v3_ayahs, v3_pages, v3_hizbs,
    p_rubric, p_rubric, p_rubric, p_rubric, p_rubric,
    p_score, p_grade, v_now
  )
  ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
    from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah,
    to_surah   = EXCLUDED.to_surah,   to_ayah   = EXCLUDED.to_ayah,
    memorized_ayahs = EXCLUDED.memorized_ayahs,
    memorized_pages = EXCLUDED.memorized_pages,
    memorized_hizbs = EXCLUDED.memorized_hizbs,
    memorization_score = EXCLUDED.memorization_score,
    accuracy_score = EXCLUDED.accuracy_score,
    fluency_score  = EXCLUDED.fluency_score,
    tajweed_score  = EXCLUDED.tajweed_score,
    retention_score = EXCLUDED.retention_score,
    score = EXCLUDED.score, grade = EXCLUDED.grade,
    status = 'pending_approval',
    submitted_at = v_now,
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

-- Migration 092: Auto-detect direction and canonical start for admin bulk_import_historical_evals
--
-- In capture_term mode (used by the admin historical records page):
--   1. Compare start vs end global_ayah to detect the true direction
--        end >= start  →  baqarah_to_nas  → canonical start = Surah 2,  Ayah 1
--        end <  start  →  nas_to_baqarah  → canonical start = Surah 114, Ayah 1
--   2. Overrides startSurah/startAyah in the eval rows with the canonical start
--   3. Also updates students.memorization_direction, start_surah, start_ayah
--   4. current_surah/current_ayah remain the submitted end position

CREATE OR REPLACE FUNCTION public.bulk_import_historical_evals(
  p_term_id uuid,
  p_entries jsonb,
  p_mode    text DEFAULT 'eval1_eval2'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_entry       jsonb;
  v_now         timestamptz := now();
  v_imported    int := 0;

  -- direction detection variables (capture_term mode)
  v_start_global integer;
  v_end_global   integer;
  v_direction    text;
  v_can_surah    smallint;
  v_can_ayah     smallint;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin', 'principal') THEN
    RAISE EXCEPTION 'Permission denied: only admin or principal can import historical evaluations';
  END IF;

  SET LOCAL row_security = off;
  PERFORM set_config('app.historical_import', 'true', true);

  IF p_mode = 'eval3' THEN

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
      UPDATE public.students
        SET current_surah = (v_entry->>'eval3Surah')::int,
            current_ayah  = (v_entry->>'eval3Ayah')::int
        WHERE id = (v_entry->>'studentId')::uuid;

      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 3, 'approved',
        (v_entry->>'startSurah')::int, (v_entry->>'startAyah')::int,
        (v_entry->>'eval3Surah')::int, (v_entry->>'eval3Ayah')::int,
        (v_entry->'eval3'->>'ayahs')::int,
        (v_entry->'eval3'->>'pages')::numeric,
        (v_entry->'eval3'->>'hizbs')::numeric,
        (v_entry->'eval3'->>'score')::int,
        (v_entry->'eval3'->>'rubric')::int,
        (v_entry->'eval3'->>'rubric')::int,
        (v_entry->'eval3'->>'rubric')::int,
        (v_entry->'eval3'->>'rubric')::int,
        v_entry->'eval3'->>'grade',
        'Imported from historical records.', v_now, v_now
      )
      ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
        status          = excluded.status,
        from_surah      = excluded.from_surah,
        from_ayah       = excluded.from_ayah,
        to_surah        = excluded.to_surah,
        to_ayah         = excluded.to_ayah,
        memorized_ayahs = excluded.memorized_ayahs,
        memorized_pages = excluded.memorized_pages,
        memorized_hizbs = excluded.memorized_hizbs,
        score           = excluded.score,
        accuracy_score  = excluded.accuracy_score,
        fluency_score   = excluded.fluency_score,
        tajweed_score   = excluded.tajweed_score,
        retention_score = excluded.retention_score,
        grade           = excluded.grade,
        submitted_at    = excluded.submitted_at,
        approved_at     = excluded.approved_at;

      v_imported := v_imported + 1;
    END LOOP;

  ELSIF p_mode = 'capture_term' THEN
    -- Auto-detect direction from global_ayah comparison and use canonical start.
    -- Entry contains: startSurah/Ayah (used only for direction hint), eval3Surah/Ayah (end),
    -- and eval1{}, eval2{}, eval3{} metrics blocks.

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
      -- Detect direction: compare start vs end global position
      SELECT global_ayah INTO v_start_global FROM public.quran_verses
        WHERE surah = (v_entry->>'startSurah')::int AND ayah = (v_entry->>'startAyah')::int;
      SELECT global_ayah INTO v_end_global FROM public.quran_verses
        WHERE surah = (v_entry->>'eval3Surah')::int AND ayah = (v_entry->>'eval3Ayah')::int;

      -- Fallback: if verse not found, trust what frontend sends
      IF v_end_global IS NULL OR v_start_global IS NULL THEN
        v_direction := COALESCE(v_entry->>'direction', 'baqarah_to_nas');
        IF v_direction = 'Baqarah-to-Nas' THEN v_direction := 'baqarah_to_nas'; END IF;
        IF v_direction = 'Nas-to-Baqarah' THEN v_direction := 'nas_to_baqarah'; END IF;
      ELSIF v_end_global >= v_start_global THEN
        v_direction := 'baqarah_to_nas';
      ELSE
        v_direction := 'nas_to_baqarah';
      END IF;

      -- Canonical start
      IF v_direction = 'baqarah_to_nas' THEN
        v_can_surah := 2; v_can_ayah := 1;
      ELSE
        v_can_surah := 114; v_can_ayah := 1;
      END IF;

      -- Update student: current position, direction, and canonical start
      UPDATE public.students SET
        current_surah          = (v_entry->>'eval3Surah')::int,
        current_ayah           = (v_entry->>'eval3Ayah')::int,
        memorization_direction = v_direction,
        start_surah            = v_can_surah,
        start_ayah             = v_can_ayah
      WHERE id = (v_entry->>'studentId')::uuid;

      -- Eval 1: canonical start → 1st third
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 1, 'approved',
        v_can_surah, v_can_ayah,
        COALESCE((v_entry->>'eval1Surah')::int, (v_entry->>'eval3Surah')::int),
        COALESCE((v_entry->>'eval1Ayah')::int,  (v_entry->>'eval3Ayah')::int),
        COALESCE((v_entry->'eval1'->>'ayahs')::int,  (v_entry->'eval3'->>'ayahs')::int, 1),
        COALESCE((v_entry->'eval1'->>'pages')::numeric, (v_entry->'eval3'->>'pages')::numeric, 1),
        COALESCE((v_entry->'eval1'->>'hizbs')::numeric, (v_entry->'eval3'->>'hizbs')::numeric, 1),
        COALESCE((v_entry->'eval1'->>'score')::int,  (v_entry->'eval3'->>'score')::int,  0),
        COALESCE((v_entry->'eval1'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval1'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval1'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval1'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE(v_entry->'eval1'->>'grade', v_entry->'eval3'->>'grade', 'F'),
        'Derived from end-of-term position (first third of journey).', v_now, v_now
      )
      ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
        status          = excluded.status,
        from_surah      = excluded.from_surah,
        from_ayah       = excluded.from_ayah,
        to_surah        = excluded.to_surah,
        to_ayah         = excluded.to_ayah,
        memorized_ayahs = excluded.memorized_ayahs,
        memorized_pages = excluded.memorized_pages,
        memorized_hizbs = excluded.memorized_hizbs,
        score           = excluded.score,
        accuracy_score  = excluded.accuracy_score,
        fluency_score   = excluded.fluency_score,
        tajweed_score   = excluded.tajweed_score,
        retention_score = excluded.retention_score,
        grade           = excluded.grade,
        submitted_at    = excluded.submitted_at,
        approved_at     = excluded.approved_at;

      -- Eval 2: 1st third → 2nd third
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 2, 'approved',
        COALESCE((v_entry->>'eval1Surah')::int, v_can_surah),
        COALESCE((v_entry->>'eval1Ayah')::int,  v_can_ayah),
        COALESCE((v_entry->>'eval2Surah')::int, (v_entry->>'eval3Surah')::int),
        COALESCE((v_entry->>'eval2Ayah')::int,  (v_entry->>'eval3Ayah')::int),
        COALESCE((v_entry->'eval2'->>'ayahs')::int,  (v_entry->'eval3'->>'ayahs')::int, 1),
        COALESCE((v_entry->'eval2'->>'pages')::numeric, (v_entry->'eval3'->>'pages')::numeric, 1),
        COALESCE((v_entry->'eval2'->>'hizbs')::numeric, (v_entry->'eval3'->>'hizbs')::numeric, 1),
        COALESCE((v_entry->'eval2'->>'score')::int,  (v_entry->'eval3'->>'score')::int,  0),
        COALESCE((v_entry->'eval2'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval2'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval2'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval2'->>'rubric')::int, (v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE(v_entry->'eval2'->>'grade', v_entry->'eval3'->>'grade', 'F'),
        'Derived from end-of-term position (second third of journey).', v_now, v_now
      )
      ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
        status          = excluded.status,
        from_surah      = excluded.from_surah,
        from_ayah       = excluded.from_ayah,
        to_surah        = excluded.to_surah,
        to_ayah         = excluded.to_ayah,
        memorized_ayahs = excluded.memorized_ayahs,
        memorized_pages = excluded.memorized_pages,
        memorized_hizbs = excluded.memorized_hizbs,
        score           = excluded.score,
        accuracy_score  = excluded.accuracy_score,
        fluency_score   = excluded.fluency_score,
        tajweed_score   = excluded.tajweed_score,
        retention_score = excluded.retention_score,
        grade           = excluded.grade,
        submitted_at    = excluded.submitted_at,
        approved_at     = excluded.approved_at;

      -- Eval 3: 2nd third → end (final, approved)
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 3, 'approved',
        COALESCE((v_entry->>'eval2Surah')::int, v_can_surah),
        COALESCE((v_entry->>'eval2Ayah')::int,  v_can_ayah),
        (v_entry->>'eval3Surah')::int, (v_entry->>'eval3Ayah')::int,
        (v_entry->'eval3'->>'ayahs')::int,
        (v_entry->'eval3'->>'pages')::numeric,
        (v_entry->'eval3'->>'hizbs')::numeric,
        (v_entry->'eval3'->>'score')::int,
        (v_entry->'eval3'->>'rubric')::int,
        (v_entry->'eval3'->>'rubric')::int,
        (v_entry->'eval3'->>'rubric')::int,
        (v_entry->'eval3'->>'rubric')::int,
        v_entry->'eval3'->>'grade',
        'Derived from end-of-term position (final third of journey).', v_now, v_now
      )
      ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
        status          = excluded.status,
        from_surah      = excluded.from_surah,
        from_ayah       = excluded.from_ayah,
        to_surah        = excluded.to_surah,
        to_ayah         = excluded.to_ayah,
        memorized_ayahs = excluded.memorized_ayahs,
        memorized_pages = excluded.memorized_pages,
        memorized_hizbs = excluded.memorized_hizbs,
        score           = excluded.score,
        accuracy_score  = excluded.accuracy_score,
        fluency_score   = excluded.fluency_score,
        tajweed_score   = excluded.tajweed_score,
        retention_score = excluded.retention_score,
        grade           = excluded.grade,
        submitted_at    = excluded.submitted_at,
        approved_at     = excluded.approved_at;

      v_imported := v_imported + 1;
    END LOOP;

  ELSE
    -- eval1_eval2 mode (unchanged)
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
      v_imported := v_imported + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('imported', v_imported);
END $$;

NOTIFY pgrst, 'reload schema';

-- Migration 070: Update capture_term mode to use pre-computed eval 1 & 2 positions.
--
-- Previously capture_term cloned eval3 data to all 3 evals (same positions, same score).
-- Now the TypeScript layer computes 3 position segments and sends them pre-computed.
-- This migration updates the SQL to read eval1/eval2 fields instead of duplicating eval3.
--
-- Score progression produced by TypeScript:
--   Eval 1 score = eval3_score × 0.82  (student still developing at term start)
--   Eval 2 score = eval3_score × 0.91  (improving midway)
--   Eval 3 score = eval3_score          (actual end-of-term performance)
-- Positions are split at 30% and 63% of the total ordinal journey.

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
    -- TypeScript pre-computes 3 position segments + score progression.
    -- Entry contains: startSurah/Ayah, eval1Surah/Ayah, eval2Surah/Ayah, eval3Surah/Ayah
    -- and eval1{}, eval2{}, eval3{} metrics blocks.
    -- Eval 1: start  → mid1  (30% of journey, score = eval3 × 0.82)
    -- Eval 2: mid1   → mid2  (30–63%,         score = eval3 × 0.91)
    -- Eval 3: mid2   → end   (63–100%,         score = eval3 actual)
    -- Student's current position is updated to eval3 end.

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
      UPDATE public.students
        SET current_surah = (v_entry->>'eval3Surah')::int,
            current_ayah  = (v_entry->>'eval3Ayah')::int
        WHERE id = (v_entry->>'studentId')::uuid;

      -- Eval 1
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 1, 'approved',
        (v_entry->>'startSurah')::int,  (v_entry->>'startAyah')::int,
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

      -- Eval 2
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 2, 'approved',
        COALESCE((v_entry->>'eval1Surah')::int, (v_entry->>'startSurah')::int),
        COALESCE((v_entry->>'eval1Ayah')::int,  (v_entry->>'startAyah')::int),
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

      -- Eval 3
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 3, 'approved',
        COALESCE((v_entry->>'eval2Surah')::int, (v_entry->>'startSurah')::int),
        COALESCE((v_entry->>'eval2Ayah')::int,  (v_entry->>'startAyah')::int),
        (v_entry->>'eval3Surah')::int,  (v_entry->>'eval3Ayah')::int,
        COALESCE((v_entry->'eval3'->>'ayahs')::int,  1),
        COALESCE((v_entry->'eval3'->>'pages')::numeric, 1),
        COALESCE((v_entry->'eval3'->>'hizbs')::numeric, 1),
        COALESCE((v_entry->'eval3'->>'score')::int,  0),
        COALESCE((v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE((v_entry->'eval3'->>'rubric')::int, 1),
        COALESCE(v_entry->'eval3'->>'grade', 'F'),
        'Recorded end-of-term position (actual evaluation).', v_now, v_now
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

  ELSE -- eval1_eval2 mode

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
      UPDATE public.students
        SET current_surah = (v_entry->>'eval2Surah')::int,
            current_ayah  = (v_entry->>'eval2Ayah')::int
        WHERE id = (v_entry->>'studentId')::uuid;

      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 1, 'approved',
        (v_entry->>'startSurah')::int,  (v_entry->>'startAyah')::int,
        (v_entry->>'eval1Surah')::int,  (v_entry->>'eval1Ayah')::int,
        (v_entry->'eval1'->>'ayahs')::int,
        (v_entry->'eval1'->>'pages')::numeric,
        (v_entry->'eval1'->>'hizbs')::numeric,
        (v_entry->'eval1'->>'score')::int,
        (v_entry->'eval1'->>'rubric')::int,
        (v_entry->'eval1'->>'rubric')::int,
        (v_entry->'eval1'->>'rubric')::int,
        (v_entry->'eval1'->>'rubric')::int,
        v_entry->'eval1'->>'grade',
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

      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 2, 'approved',
        (v_entry->>'eval1Surah')::int,  (v_entry->>'eval1Ayah')::int,
        (v_entry->>'eval2Surah')::int,  (v_entry->>'eval2Ayah')::int,
        (v_entry->'eval2'->>'ayahs')::int,
        (v_entry->'eval2'->>'pages')::numeric,
        (v_entry->'eval2'->>'hizbs')::numeric,
        (v_entry->'eval2'->>'score')::int,
        (v_entry->'eval2'->>'rubric')::int,
        (v_entry->'eval2'->>'rubric')::int,
        (v_entry->'eval2'->>'rubric')::int,
        (v_entry->'eval2'->>'rubric')::int,
        v_entry->'eval2'->>'grade',
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

  END IF;

  RETURN jsonb_build_object('imported', v_imported);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_historical_evals(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Migration 071: Drop the old 2-param overload and simplify capture_term.
--
-- Problem: Two overloaded versions of bulk_import_historical_evals existed:
--   (1) bulk_import_historical_evals(uuid, jsonb)         — old 2-param, no p_mode
--   (2) bulk_import_historical_evals(uuid, jsonb, text)   — new 3-param with p_mode
-- PostgREST ambiguity could call the wrong one, causing NULL constraint errors.
--
-- Fix:
--   1. Drop the old 2-param function entirely.
--   2. capture_term mode now computes eval1/eval2 metrics entirely in SQL from eval3 data.
--      TypeScript only sends: startSurah/Ayah + eval3Surah/Ayah + eval3 metrics.
--      SQL derives: eval1 = 30% of journey at 82% score, eval2 = 63% at 91% score.
--      Positions for all 3 evals span the full term journey (start → eval3 end).

DROP FUNCTION IF EXISTS public.bulk_import_historical_evals(uuid, jsonb);

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
  v_caller_role  text;
  v_entry        jsonb;
  v_now          timestamptz := now();
  v_imported     int := 0;
  -- capture_term working vars
  v_e3_ayahs     int;
  v_e3_pages     numeric;
  v_e3_hizbs     numeric;
  v_e3_score     int;
  v_e3_rubric    int;
  v_e3_grade     text;
  v_e1_ayahs     int;  v_e1_pages numeric; v_e1_hizbs numeric;
  v_e1_score     int;  v_e1_rubric int;    v_e1_grade text;
  v_e2_ayahs     int;  v_e2_pages numeric; v_e2_hizbs numeric;
  v_e2_score     int;  v_e2_rubric int;    v_e2_grade text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin', 'principal') THEN
    RAISE EXCEPTION 'Permission denied: only admin or principal can import historical evaluations';
  END IF;

  SET LOCAL row_security = off;
  PERFORM set_config('app.historical_import', 'true', true);

  -- -----------------------------------------------------------------------
  IF p_mode = 'eval3' THEN
  -- -----------------------------------------------------------------------

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

  -- -----------------------------------------------------------------------
  ELSIF p_mode = 'capture_term' THEN
  -- -----------------------------------------------------------------------
  -- TypeScript sends only: startSurah/Ayah, eval3Surah/Ayah, eval3 metrics.
  -- SQL derives eval1 and eval2 from eval3:
  --   Eval 1 metrics: 30% of total ayahs/pages/hizbs, score = eval3_score × 0.82
  --   Eval 2 metrics: 63% of total ayahs/pages/hizbs, score = eval3_score × 0.91
  --   Eval 3 metrics: 100% (actual), score = eval3_score
  -- All 3 evals span the full term journey (from start to eval3 end).

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
      UPDATE public.students
        SET current_surah = (v_entry->>'eval3Surah')::int,
            current_ayah  = (v_entry->>'eval3Ayah')::int
        WHERE id = (v_entry->>'studentId')::uuid;

      -- Read eval3 actuals
      v_e3_ayahs  := COALESCE((v_entry->'eval3'->>'ayahs')::int,  1);
      v_e3_pages  := COALESCE((v_entry->'eval3'->>'pages')::numeric, 1);
      v_e3_hizbs  := COALESCE((v_entry->'eval3'->>'hizbs')::numeric, 1);
      v_e3_score  := COALESCE((v_entry->'eval3'->>'score')::int,  0);
      v_e3_rubric := COALESCE((v_entry->'eval3'->>'rubric')::int, 1);
      v_e3_grade  := COALESCE(v_entry->'eval3'->>'grade', 'F');

      -- Derive eval1 (30% of journey, 82% quality)
      v_e1_ayahs  := GREATEST(1, (v_e3_ayahs  * 30 / 100));
      v_e1_pages  := GREATEST(1, ROUND(v_e3_pages  * 30 / 100));
      v_e1_hizbs  := GREATEST(1, ROUND(v_e3_hizbs  * 30 / 100));
      v_e1_score  := GREATEST(1, LEAST(100, (v_e3_score  * 82 / 100)));
      v_e1_rubric := CASE WHEN v_e1_score >= 90 THEN 5 WHEN v_e1_score >= 75 THEN 4
                          WHEN v_e1_score >= 60 THEN 3 WHEN v_e1_score >= 45 THEN 2 ELSE 1 END;
      v_e1_grade  := CASE WHEN v_e1_score >= 90 THEN 'A' WHEN v_e1_score >= 75 THEN 'B'
                          WHEN v_e1_score >= 60 THEN 'C' WHEN v_e1_score >= 45 THEN 'D' ELSE 'F' END;

      -- Derive eval2 (63% of journey, 91% quality)
      v_e2_ayahs  := GREATEST(1, (v_e3_ayahs  * 63 / 100));
      v_e2_pages  := GREATEST(1, ROUND(v_e3_pages  * 63 / 100));
      v_e2_hizbs  := GREATEST(1, ROUND(v_e3_hizbs  * 63 / 100));
      v_e2_score  := GREATEST(1, LEAST(100, (v_e3_score  * 91 / 100)));
      v_e2_rubric := CASE WHEN v_e2_score >= 90 THEN 5 WHEN v_e2_score >= 75 THEN 4
                          WHEN v_e2_score >= 60 THEN 3 WHEN v_e2_score >= 45 THEN 2 ELSE 1 END;
      v_e2_grade  := CASE WHEN v_e2_score >= 90 THEN 'A' WHEN v_e2_score >= 75 THEN 'B'
                          WHEN v_e2_score >= 60 THEN 'C' WHEN v_e2_score >= 45 THEN 'D' ELSE 'F' END;

      -- Eval 1
      INSERT INTO public.evaluations (
        student_id, teacher_id, term_id, evaluation_number, status,
        from_surah, from_ayah, to_surah, to_ayah,
        memorized_ayahs, memorized_pages, memorized_hizbs,
        score, accuracy_score, fluency_score, tajweed_score, retention_score,
        grade, teacher_comment, submitted_at, approved_at
      ) VALUES (
        (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 1, 'approved',
        (v_entry->>'startSurah')::int, (v_entry->>'startAyah')::int,
        (v_entry->>'eval3Surah')::int, (v_entry->>'eval3Ayah')::int,
        v_e1_ayahs, v_e1_pages, v_e1_hizbs,
        v_e1_score, v_e1_rubric, v_e1_rubric, v_e1_rubric, v_e1_rubric,
        v_e1_grade,
        'Derived from end-of-term position (projected early-term performance).', v_now, v_now
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
        (v_entry->>'startSurah')::int, (v_entry->>'startAyah')::int,
        (v_entry->>'eval3Surah')::int, (v_entry->>'eval3Ayah')::int,
        v_e2_ayahs, v_e2_pages, v_e2_hizbs,
        v_e2_score, v_e2_rubric, v_e2_rubric, v_e2_rubric, v_e2_rubric,
        v_e2_grade,
        'Derived from end-of-term position (projected mid-term performance).', v_now, v_now
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
        (v_entry->>'startSurah')::int, (v_entry->>'startAyah')::int,
        (v_entry->>'eval3Surah')::int, (v_entry->>'eval3Ayah')::int,
        v_e3_ayahs, v_e3_pages, v_e3_hizbs,
        v_e3_score, v_e3_rubric, v_e3_rubric, v_e3_rubric, v_e3_rubric,
        v_e3_grade,
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

  -- -----------------------------------------------------------------------
  ELSE -- eval1_eval2 mode
  -- -----------------------------------------------------------------------

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

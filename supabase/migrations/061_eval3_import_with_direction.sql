-- Migration 061: In eval3 import mode, also update the student's memorization_direction.
--
-- The admin can confirm or correct each student's memorization pattern directly from
-- the Eval 3 import screen. The chosen direction is written to students.memorization_direction
-- so it becomes their official profile direction for Second Term and beyond.

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
  v_direction   text;
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
      -- Convert frontend direction string to DB snake_case value
      v_direction := CASE v_entry->>'direction'
        WHEN 'Baqarah-to-Nas'  THEN 'baqarah_to_nas'
        WHEN 'Nas-to-Baqarah'  THEN 'nas_to_baqarah'
        ELSE NULL
      END;

      -- Update current position and memorization direction on the student profile
      UPDATE public.students
        SET current_surah          = (v_entry->>'eval3Surah')::int,
            current_ayah           = (v_entry->>'eval3Ayah')::int,
            memorization_direction = COALESCE(v_direction, memorization_direction)
        WHERE id = (v_entry->>'studentId')::uuid;

      -- Upsert Eval 3
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
        approved_at     = excluded.approved_at;

      v_imported := v_imported + 1;
    END LOOP;

  END IF;

  RETURN jsonb_build_object('imported', v_imported);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_historical_evals(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

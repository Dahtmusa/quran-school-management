-- Migration 059: Allow bulk historical eval import to bypass the position guard trigger.
--
-- The validate_evaluation_position trigger checks that every evaluation's from_surah/from_ayah
-- matches the student's current position at insert time. Historical imports don't satisfy
-- this constraint because Eval 1 starts from the old current (not today's position) and
-- re-imports update rows that no longer match the live current.
--
-- Fix: set a session-local config flag before historical inserts so the trigger skips
-- validation for that transaction only. The flag resets automatically at transaction end.

-- Step 1: Update the trigger to skip validation when the historical import flag is set.
CREATE OR REPLACE FUNCTION public.validate_evaluation_position()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  direction text;
  current_s smallint;
  current_a smallint;
  from_global integer;
  to_global   integer;
  from_meta   record;
  to_meta     record;
BEGIN
  -- Historical import sets this flag to bypass position validation for archived evals.
  IF current_setting('app.historical_import', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Always validate the starting position.
  SELECT memorization_direction, current_surah, current_ayah
    INTO direction, current_s, current_a
    FROM public.students WHERE id = NEW.student_id FOR UPDATE;

  SELECT * INTO from_meta
    FROM public.quran_verses
    WHERE surah = NEW.from_surah AND ayah = NEW.from_ayah;

  IF from_meta.global_ayah IS NULL THEN
    RAISE EXCEPTION 'Quran metadata is missing for the starting position. Seed quran_verses before creating evaluations.';
  END IF;

  IF current_s IS NULL OR current_a IS NULL THEN
    RAISE EXCEPTION 'Student must have an official current Quran position before evaluation.';
  END IF;

  IF NEW.from_surah IS DISTINCT FROM current_s OR NEW.from_ayah IS DISTINCT FROM current_a THEN
    RAISE EXCEPTION 'Evaluation must start from the student current official memorization position.';
  END IF;

  from_global := from_meta.global_ayah;

  -- Stopping-position checks only apply once the teacher has entered to_surah/to_ayah.
  IF NEW.to_surah IS NOT NULL AND NEW.to_ayah IS NOT NULL THEN
    SELECT * INTO to_meta
      FROM public.quran_verses
      WHERE surah = NEW.to_surah AND ayah = NEW.to_ayah;

    IF to_meta.global_ayah IS NULL THEN
      RAISE EXCEPTION 'Quran metadata is missing for the stopping position.';
    END IF;

    to_global := to_meta.global_ayah;

    IF direction = 'baqarah_to_nas' AND to_global <= from_global THEN
      RAISE EXCEPTION 'Evaluation stopping position must move forward for Baqarah-to-Nas.';
    END IF;
    IF direction = 'nas_to_baqarah' AND to_global >= from_global THEN
      RAISE EXCEPTION 'Evaluation stopping position must move backward for Nas-to-Baqarah.';
    END IF;

    NEW.from_page        := from_meta.page;
    NEW.to_page          := to_meta.page;
    NEW.memorized_ayahs  := abs(to_global - from_global);
    NEW.memorized_pages  := abs(to_meta.page  - from_meta.page);
    NEW.memorized_hizbs  := abs(to_meta.hizb  - from_meta.hizb);
  END IF;

  RETURN NEW;
END;
$$;

-- Step 2: Update bulk_import_historical_evals to set the flag before any inserts.
CREATE OR REPLACE FUNCTION public.bulk_import_historical_evals(
  p_term_id uuid,
  p_entries jsonb
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
  -- Verify the caller has an admin-level role before bypassing RLS
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin', 'principal') THEN
    RAISE EXCEPTION 'Permission denied: only admin or principal can import historical evaluations';
  END IF;

  -- Disable row-security for this transaction (table owner privilege)
  SET LOCAL row_security = off;

  -- Signal the position guard trigger to skip validation for historical inserts.
  -- This flag is session-local and resets automatically at transaction end.
  PERFORM set_config('app.historical_import', 'true', true);

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    -- Move student's current position forward to Eval 2 end
    UPDATE public.students
      SET current_surah = (v_entry->>'eval2Surah')::int,
          current_ayah  = (v_entry->>'eval2Ayah')::int
      WHERE id = (v_entry->>'studentId')::uuid;

    -- Upsert Eval 1
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

    -- Upsert Eval 2
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

  RETURN jsonb_build_object('imported', v_imported);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_historical_evals(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

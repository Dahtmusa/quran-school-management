-- Migration 088: Fix validate_evaluation_position trigger firing on approval UPDATEs
--
-- When admin approves a historical eval (UPDATE status → 'approved'), the trigger
-- was re-checking from_surah/from_ayah against the student's current position, which
-- has moved on. The position guard only makes sense on INSERT or when the caller is
-- actually changing the start position. Skip it for pure approval UPDATEs.

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

  -- On UPDATE, if the start position is unchanged this is an approval/correction
  -- of metadata only (status, scores, comment, etc.) — skip position validation.
  IF TG_OP = 'UPDATE'
     AND NEW.from_surah IS NOT DISTINCT FROM OLD.from_surah
     AND NEW.from_ayah  IS NOT DISTINCT FROM OLD.from_ayah THEN
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

NOTIFY pgrst, 'reload schema';

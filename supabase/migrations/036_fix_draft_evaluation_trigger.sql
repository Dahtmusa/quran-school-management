-- Migration 036: Fix draft evaluation creation.
--
-- The validate_evaluation_position trigger previously ran the stopping-position
-- check on every INSERT including initial draft creation, which failed because
-- the teacher has not yet entered a stopping position.
--
-- Fix:
-- 1. Guard all to_surah/to_ayah checks behind "NEW.to_surah IS NOT NULL".
-- 2. Update create_evaluation_campaign_window to insert NULL for to_surah/to_ayah
--    so drafts carry only the locked starting position until the teacher submits.

-- Step 1: replace the position guard trigger function.
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

DROP TRIGGER IF EXISTS evaluation_position_guard ON public.evaluations;
CREATE TRIGGER evaluation_position_guard
  BEFORE INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.validate_evaluation_position();

-- Step 2: replace create_evaluation_campaign_window so draft evaluations are
-- inserted with to_surah = NULL, to_ayah = NULL (teacher fills these in later).
CREATE OR REPLACE FUNCTION public.create_evaluation_campaign_window(
  p_term_id             uuid,
  p_evaluation_number   smallint,
  p_title               text,
  p_opens_at            timestamptz,
  p_closes_at           timestamptz,
  p_class_ids           uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
  v_class_id    uuid;
  s             record;
  teacher       uuid;
  missing_count integer;
  v_term        public.terms;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF p_evaluation_number NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Evaluation number must be 1, 2 or 3';
  END IF;

  SELECT * INTO v_term FROM public.terms WHERE id = p_term_id;
  IF v_term.id IS NULL THEN
    RAISE EXCEPTION 'Select a valid operational term';
  END IF;

  IF p_opens_at IS NULL OR p_closes_at IS NULL THEN
    RAISE EXCEPTION 'Choose both an opening and closing date/time';
  END IF;

  IF p_closes_at <= p_opens_at THEN
    RAISE EXCEPTION 'Closing time must be after opening time';
  END IF;

  IF p_opens_at::date < v_term.starts_on OR p_closes_at::date > v_term.ends_on THEN
    RAISE EXCEPTION 'Evaluation window must fall within the selected academic term (% to %)',
      v_term.starts_on, v_term.ends_on;
  END IF;

  IF coalesce(array_length(p_class_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one class';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.evaluation_campaigns c
    WHERE c.term_id = p_term_id AND c.evaluation_number = p_evaluation_number
  ) THEN
    RAISE EXCEPTION 'Evaluation % already exists for this term. Use the existing campaign or edit its window.',
      p_evaluation_number;
  END IF;

  IF p_evaluation_number > 1 THEN
    SELECT count(*) INTO missing_count
    FROM public.students st
    WHERE st.status = 'active'
      AND st.class_id = ANY(p_class_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.evaluations e
        WHERE e.student_id = st.id
          AND e.term_id = p_term_id
          AND e.evaluation_number = p_evaluation_number - 1
          AND e.status = 'approved'
      );
    IF missing_count > 0 THEN
      RAISE EXCEPTION 'Evaluation % cannot open yet: % student(s) still need Evaluation % approved.',
        p_evaluation_number, missing_count, p_evaluation_number - 1;
    END IF;
  END IF;

  INSERT INTO public.evaluation_campaigns(
    term_id, evaluation_number, title, calendar_event_id,
    opens_at, closes_at, created_by
  )
  VALUES(
    p_term_id, p_evaluation_number, trim(p_title), NULL,
    p_opens_at, p_closes_at, auth.uid()
  )
  RETURNING id INTO v_campaign_id;

  FOREACH v_class_id IN ARRAY p_class_ids LOOP
    INSERT INTO public.evaluation_campaign_classes(campaign_id, class_id)
    VALUES(v_campaign_id, v_class_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR s IN
    SELECT DISTINCT st.*
    FROM public.students st
    JOIN public.evaluation_campaign_classes ecc ON ecc.class_id = st.class_id
    WHERE ecc.campaign_id = v_campaign_id
      AND st.status = 'active'
  LOOP
    SELECT ct.teacher_id INTO teacher
    FROM public.class_teachers ct
    WHERE ct.class_id = s.class_id
    ORDER BY ct.is_primary DESC, ct.assigned_at ASC
    LIMIT 1;

    IF teacher IS NOT NULL THEN
      INSERT INTO public.evaluations(
        student_id, teacher_id, term_id, evaluation_number, status,
        teacher_visible, teacher_visible_at, campaign_id,
        from_surah, from_ayah
        -- to_surah and to_ayah are intentionally NULL; teacher enters them when submitting
      )
      VALUES(
        s.id, teacher, p_term_id, p_evaluation_number, 'draft',
        false, NULL, v_campaign_id,
        s.current_surah, s.current_ayah
      )
      ON CONFLICT(student_id, term_id, evaluation_number)
      DO UPDATE SET campaign_id = EXCLUDED.campaign_id;
    END IF;
  END LOOP;

  RETURN v_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_evaluation_campaign_window(uuid,smallint,text,timestamptz,timestamptz,uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_evaluation_campaign_window(uuid,smallint,text,timestamptz,timestamptz,uuid[]) FROM anon;

NOTIFY pgrst, 'reload schema';

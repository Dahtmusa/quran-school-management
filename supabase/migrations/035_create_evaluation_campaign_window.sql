-- Migration 035: Introduce uniquely-named create_evaluation_campaign_window RPC.
-- This replaces the frontend's call to create_evaluation_campaign so it is immediately
-- obvious from the live browser network tab whether the new bundle is deployed.
-- The old create_evaluation_campaign function (6-arg form from migration 034) is kept
-- for auditability but the frontend no longer calls it.

CREATE OR REPLACE FUNCTION public.create_evaluation_campaign_window(
  p_term_id         uuid,
  p_evaluation_number smallint,
  p_title           text,
  p_opens_at        timestamptz,
  p_closes_at       timestamptz,
  p_class_ids       uuid[]
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
        from_surah, from_ayah, to_surah, to_ayah
      )
      VALUES(
        s.id, teacher, p_term_id, p_evaluation_number, 'draft',
        false, NULL, v_campaign_id,
        s.current_surah, s.current_ayah, s.current_surah, s.current_ayah
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

-- Reload PostgREST schema cache so the new function is immediately visible.
NOTIFY pgrst, 'reload schema';

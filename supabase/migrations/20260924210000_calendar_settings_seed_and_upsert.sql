-- Calendar autopilot fix.
--
-- Two related bugs:
--
-- 1. amqm_sync_calendar_state() UPDATEs public.academic_cycle_settings
--    where id=true. On a fresh database (or if the row was ever deleted)
--    that row doesn't exist, so the UPDATE is a no-op — meaning no
--    "current term" ever gets recorded, and get_current_academic_term()
--    returns {}, and every downstream page (dashboard, evaluations,
--    calendar summary cards) shows "Not active / Not set".
--
-- 2. amqm_save_simple_calendar() only touches academic_cycle_settings
--    indirectly through amqm_sync_calendar_state — same bug: if the row
--    doesn't exist, the save appears to succeed but nothing shows as
--    "current" and the evaluation automation never fires.
--
-- Fix: seed the row on migration, and change the sync to UPSERT so it's
-- self-healing from now on.

INSERT INTO public.academic_cycle_settings(id, automatic_progression, updated_at)
VALUES (true, true, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.amqm_sync_calendar_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year          public.academic_years;
  v_term          public.terms;
  v_current_year  uuid;
  v_current_term  uuid;
BEGIN
  SELECT * INTO v_year
  FROM public.academic_years
  WHERE current_date BETWEEN starts_on AND ends_on
  ORDER BY starts_on DESC
  LIMIT 1;

  IF v_year.id IS NOT NULL THEN
    UPDATE public.academic_years SET is_current = false WHERE is_current = true AND id <> v_year.id;
    UPDATE public.academic_years SET is_current = true  WHERE id = v_year.id;

    SELECT * INTO v_term
    FROM public.terms
    WHERE academic_year_id = v_year.id
      AND current_date BETWEEN starts_on AND ends_on
    ORDER BY term_number
    LIMIT 1;

    IF v_term.id IS NOT NULL THEN
      UPDATE public.terms SET is_current = false WHERE is_current = true AND id <> v_term.id;

      IF v_term.lifecycle_status = 'scheduled' THEN
        UPDATE public.terms SET lifecycle_status = 'digital_active' WHERE id = v_term.id;
      END IF;

      UPDATE public.terms SET is_current = true WHERE id = v_term.id;

      v_current_year := v_year.id;
      v_current_term := v_term.id;
    ELSE
      -- No active term today, keep whatever was there.
      SELECT current_academic_year_id, current_term_id
        INTO v_current_year, v_current_term
      FROM public.academic_cycle_settings WHERE id = true;
      v_current_year := COALESCE(v_current_year, v_year.id);
    END IF;
  ELSE
    -- No active year today, keep whatever was there.
    SELECT current_academic_year_id, current_term_id
      INTO v_current_year, v_current_term
    FROM public.academic_cycle_settings WHERE id = true;
  END IF;

  -- UPSERT (was UPDATE, silently no-op on a missing row).
  INSERT INTO public.academic_cycle_settings(
    id, current_academic_year_id, current_term_id, automatic_progression, updated_at
  )
  VALUES (true, v_current_year, v_current_term, true, now())
  ON CONFLICT (id) DO UPDATE SET
    current_academic_year_id = COALESCE(EXCLUDED.current_academic_year_id, public.academic_cycle_settings.current_academic_year_id),
    current_term_id          = COALESCE(EXCLUDED.current_term_id,          public.academic_cycle_settings.current_term_id),
    updated_at               = now();

  RETURN jsonb_build_object(
    'academic_year_id', v_current_year,
    'term_id',          v_current_term
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.amqm_sync_calendar_state() TO authenticated;
NOTIFY pgrst, 'reload schema';

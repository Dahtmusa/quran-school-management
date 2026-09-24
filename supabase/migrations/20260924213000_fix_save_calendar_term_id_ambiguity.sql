-- Fix: `column reference "term_id" is ambiguous` when clicking Save on the
-- School Calendar page.
--
-- amqm_save_simple_calendar declared a PL/pgSQL variable named `term_id`.
-- One of the INSERT ... ON CONFLICT ... WHERE clauses inside the loop
-- references the school_calendar_events column named `term_id` in the
-- partial-index predicate:
--     WHERE event_type in ('evaluation_1', ...) AND term_id IS NOT NULL
-- PostgreSQL cannot tell whether `term_id` there means the variable or
-- the column, so it refuses the whole statement. The save appeared to do
-- nothing because the transaction rolled back cleanly.
--
-- Rewrite the function with the local variable renamed to v_term_id.
-- Behaviour is identical; only the internal name changed.

CREATE OR REPLACE FUNCTION public.amqm_save_simple_calendar(
  p_year_name text,
  p_year_start date,
  p_year_end date,
  p_terms jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  ay_id uuid;
  v_term_id uuid;
  term_item jsonb;
  eval_item jsonb;
  n integer;
  saved_terms integer := 0;
  saved_evals integer := 0;
  v_term_start date;
  v_term_end date;
  open_ts timestamptz;
  close_ts timestamptz;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF trim(coalesce(p_year_name,'')) = '' THEN
    RAISE EXCEPTION 'Academic year name is required';
  END IF;

  IF p_year_end <= p_year_start THEN
    RAISE EXCEPTION 'Session closing date must be after the opening date';
  END IF;

  IF jsonb_typeof(coalesce(p_terms,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Term configuration is invalid';
  END IF;

  INSERT INTO public.academic_years(name,starts_on,ends_on,is_current,lifecycle_status)
  VALUES (trim(p_year_name), p_year_start, p_year_end,
          (current_date BETWEEN p_year_start AND p_year_end), 'open')
  ON CONFLICT (name) DO UPDATE SET
    starts_on = EXCLUDED.starts_on,
    ends_on   = EXCLUDED.ends_on,
    is_current = EXCLUDED.is_current,
    lifecycle_status = CASE
      WHEN public.academic_years.lifecycle_status IN ('closed','archived')
        THEN public.academic_years.lifecycle_status
      ELSE EXCLUDED.lifecycle_status
    END
  RETURNING id INTO ay_id;

  IF current_date BETWEEN p_year_start AND p_year_end THEN
    UPDATE public.academic_years SET is_current = false WHERE is_current = true AND id <> ay_id;
    UPDATE public.academic_years SET is_current = true  WHERE id = ay_id;
  END IF;

  FOR term_item IN
    SELECT value FROM jsonb_array_elements(p_terms)
    ORDER BY (value->>'term_number')::int
  LOOP
    n := coalesce((term_item->>'term_number')::int, 0);
    IF n NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'Term number must be 1, 2 or 3';
    END IF;

    v_term_start := nullif(term_item->>'start','')::date;
    v_term_end   := nullif(term_item->>'end','')::date;

    IF v_term_start IS NULL OR v_term_end IS NULL THEN
      CONTINUE;
    END IF;

    IF v_term_end < v_term_start THEN
      RAISE EXCEPTION 'Term % ends before it starts', n;
    END IF;

    IF v_term_start < p_year_start OR v_term_end > p_year_end THEN
      RAISE EXCEPTION 'Term % must fall within the academic session dates', n;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.terms t
      WHERE t.academic_year_id = ay_id
        AND t.term_number <> n
        AND v_term_start <= t.ends_on
        AND v_term_end   >= t.starts_on
    ) THEN
      RAISE EXCEPTION 'Term % overlaps another term', n;
    END IF;

    INSERT INTO public.terms(academic_year_id, name, term_number, starts_on, ends_on, is_current, lifecycle_status)
    VALUES (
      ay_id,
      CASE n WHEN 1 THEN 'First Term' WHEN 2 THEN 'Second Term' ELSE 'Third Term' END,
      n, v_term_start, v_term_end,
      (current_date BETWEEN v_term_start AND v_term_end),
      CASE WHEN current_date BETWEEN v_term_start AND v_term_end
        THEN 'digital_active' ELSE 'scheduled' END
    )
    ON CONFLICT (academic_year_id, term_number) DO UPDATE SET
      name = EXCLUDED.name,
      starts_on = EXCLUDED.starts_on,
      ends_on   = EXCLUDED.ends_on,
      is_current = EXCLUDED.is_current,
      lifecycle_status = CASE
        WHEN public.terms.lifecycle_status IN ('historical_baseline','historical_closed','digital_closed')
          THEN public.terms.lifecycle_status
        ELSE EXCLUDED.lifecycle_status
      END
    RETURNING id INTO v_term_id;

    saved_terms := saved_terms + 1;

    INSERT INTO public.school_calendar_events(
      academic_year_id, term_id, event_type, title, starts_on, ends_on,
      starts_at, ends_at, published, created_by, evaluation_number, notes
    ) VALUES (
      ay_id, v_term_id, 'term_start',
      CASE n WHEN 1 THEN 'First Term Starts' WHEN 2 THEN 'Second Term Starts' ELSE 'Third Term Starts' END,
      v_term_start, v_term_start,
      v_term_start::timestamptz, v_term_start::timestamptz,
      true, actor, NULL, 'Managed by the Academic Calendar.'
    );

    INSERT INTO public.school_calendar_events(
      academic_year_id, term_id, event_type, title, starts_on, ends_on,
      starts_at, ends_at, published, created_by, evaluation_number, notes
    ) VALUES (
      ay_id, v_term_id, 'term_end',
      CASE n WHEN 1 THEN 'First Term Ends' WHEN 2 THEN 'Second Term Ends' ELSE 'Third Term Ends' END,
      v_term_end, v_term_end,
      v_term_end::timestamptz, v_term_end::timestamptz,
      true, actor, NULL, 'Managed by the Academic Calendar.'
    );

    FOR eval_item IN
      SELECT value FROM jsonb_array_elements(coalesce(term_item->'evaluations','[]'::jsonb))
    LOOP
      IF nullif(eval_item->>'open','') IS NULL AND nullif(eval_item->>'close','') IS NULL THEN
        CONTINUE;
      END IF;

      IF nullif(eval_item->>'open','') IS NULL OR nullif(eval_item->>'close','') IS NULL THEN
        RAISE EXCEPTION 'Evaluation % in Term % needs both open and close dates',
          coalesce((eval_item->>'number')::int, 0), n;
      END IF;

      open_ts  := (eval_item->>'open')::timestamptz;
      close_ts := (eval_item->>'close')::timestamptz;

      IF close_ts <= open_ts THEN
        RAISE EXCEPTION 'Evaluation % in Term % must close after it opens',
          coalesce((eval_item->>'number')::int, 0), n;
      END IF;

      IF (open_ts  AT TIME ZONE 'Africa/Lagos')::date < v_term_start
         OR (close_ts AT TIME ZONE 'Africa/Lagos')::date > v_term_end THEN
        RAISE EXCEPTION 'Evaluation % in Term % must fall inside that term',
          coalesce((eval_item->>'number')::int, 0), n;
      END IF;

      INSERT INTO public.school_calendar_events(
        academic_year_id, term_id, event_type, title, starts_on, ends_on,
        starts_at, ends_at, published, created_by, evaluation_number, notes
      ) VALUES (
        ay_id, v_term_id,
        'evaluation_' || (eval_item->>'number')::int,
        CASE (eval_item->>'number')::int
          WHEN 1 THEN 'Evaluation 1'
          WHEN 2 THEN 'Evaluation 2'
          ELSE      'Evaluation 3'
        END,
        (open_ts  AT TIME ZONE 'Africa/Lagos')::date,
        (close_ts AT TIME ZONE 'Africa/Lagos')::date,
        open_ts, close_ts, true, actor, (eval_item->>'number')::int,
        'Managed by the Academic Calendar.'
      )
      ON CONFLICT (event_type, term_id, evaluation_number)
      WHERE event_type IN ('evaluation_1','evaluation_2','evaluation_3')
        AND term_id IS NOT NULL
      DO UPDATE SET
        academic_year_id = EXCLUDED.academic_year_id,
        title       = EXCLUDED.title,
        starts_on   = EXCLUDED.starts_on,
        ends_on     = EXCLUDED.ends_on,
        starts_at   = EXCLUDED.starts_at,
        ends_at     = EXCLUDED.ends_at,
        published   = true,
        updated_at  = now(),
        notes       = EXCLUDED.notes;

      saved_evals := saved_evals + 1;
    END LOOP;
  END LOOP;

  -- Session markers. These remain one per academic session.
  INSERT INTO public.school_calendar_events(
    academic_year_id, event_type, title, starts_on, ends_on, starts_at, ends_at, published, created_by
  ) VALUES (
    ay_id, 'school_opening', 'Session Opening – ' || trim(p_year_name),
    p_year_start, p_year_start, p_year_start::timestamptz, p_year_start::timestamptz,
    true, actor
  )
  ON CONFLICT (event_type, title)
  WHERE event_type IN ('school_opening','school_closing')
  DO UPDATE SET
    academic_year_id = EXCLUDED.academic_year_id,
    starts_on = EXCLUDED.starts_on,
    ends_on   = EXCLUDED.ends_on,
    starts_at = EXCLUDED.starts_at,
    ends_at   = EXCLUDED.ends_at,
    updated_at = now();

  INSERT INTO public.school_calendar_events(
    academic_year_id, event_type, title, starts_on, ends_on, starts_at, ends_at, published, created_by
  ) VALUES (
    ay_id, 'school_closing', 'Session Closing – ' || trim(p_year_name),
    p_year_end, p_year_end, p_year_end::timestamptz, p_year_end::timestamptz,
    true, actor
  )
  ON CONFLICT (event_type, title)
  WHERE event_type IN ('school_opening','school_closing')
  DO UPDATE SET
    academic_year_id = EXCLUDED.academic_year_id,
    starts_on = EXCLUDED.starts_on,
    ends_on   = EXCLUDED.ends_on,
    starts_at = EXCLUDED.starts_at,
    ends_at   = EXCLUDED.ends_at,
    updated_at = now();

  PERFORM public.amqm_sync_calendar_state();
  PERFORM public.amqm_process_calendar_automation();

  RETURN jsonb_build_object(
    'academic_year_id',       ay_id,
    'terms_saved',            saved_terms,
    'evaluation_windows_saved', saved_evals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.amqm_save_simple_calendar(text,date,date,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- Auto-carry non-graduating students into each new term and each new
-- session, without any admin click.
--
-- Existing behaviour:
--   * close_term_and_start_next(term_id) copies each active student's
--     closing position into the next term. But it is admin-triggered and
--     it refuses to run if any student is missing an approved evaluation.
--   * The graduation trigger in migration 008 automatically marks a
--     student `graduated`, creates their alumni profile and issues a
--     certificate when their approved Evaluation 3 reaches the final
--     Qur'an ayah (or Al-Fatihah for reverse memorization). Alumni are
--     therefore already handled the moment Evaluation 3 is approved.
--
-- Gap: between terms and between academic sessions, students who are NOT
-- graduating still need a student_term_progress row in the newly-active
-- term. Without one, the teacher/progress screens have no opening
-- position and downstream reports look empty. Today this only happens
-- when the admin explicitly runs close_term_and_start_next.
--
-- New behaviour: amqm_auto_carry_students_forward() is idempotent and
-- can safely run every hour. It:
--   1. Finds the currently-active term.
--   2. For every active NON-graduated student:
--        - if they already have a student_term_progress row for this
--          term, do nothing;
--        - otherwise open one, using in order of preference:
--            a) closing_* of their most recent student_term_progress row;
--            b) to_surah/to_ayah of their latest approved evaluation;
--            c) NULL if no history exists yet (a brand new admission
--               that has not been positioned yet).
--
-- The function is then wired into amqm_process_calendar_automation so
-- the hourly cron carries everyone forward automatically.

CREATE OR REPLACE FUNCTION public.amqm_auto_carry_students_forward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term       public.terms;
  v_carried    integer := 0;
  v_skipped    integer := 0;
  s            record;
  prev         record;
  prev_eval    record;
BEGIN
  -- Find the term whose date range contains today. Only one is expected
  -- (unique index on is_current) but we defensively pick the newest.
  SELECT * INTO v_term
  FROM public.terms
  WHERE is_current = true
  ORDER BY starts_on DESC
  LIMIT 1;

  -- If no term is flagged current yet (fresh install, or between-term
  -- gap before the sync flips the flag), fall back to the term whose
  -- date range contains today so the carry still runs when it should.
  IF v_term.id IS NULL THEN
    SELECT * INTO v_term
    FROM public.terms
    WHERE current_date BETWEEN starts_on AND ends_on
    ORDER BY starts_on DESC
    LIMIT 1;
  END IF;

  IF v_term.id IS NULL THEN
    RETURN jsonb_build_object('carried_forward', 0, 'skipped', 0, 'reason', 'no active term');
  END IF;

  -- Non-graduated active students only. Graduation is handled elsewhere
  -- (trigger in 008_program_structure_and_targets.sql) — those students
  -- become alumni_profiles rows automatically when Evaluation 3 lands.
  FOR s IN
    SELECT id, admission_no, full_name
    FROM public.students
    WHERE status = 'active'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.student_term_progress
      WHERE student_id = s.id AND term_id = v_term.id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Preferred source: last closing snapshot from any previous term.
    SELECT stp.closing_surah, stp.closing_ayah, stp.closing_page, stp.closing_hizb
      INTO prev
    FROM public.student_term_progress stp
    JOIN public.terms t ON t.id = stp.term_id
    WHERE stp.student_id = s.id
      AND t.id <> v_term.id
      AND (stp.closing_surah IS NOT NULL OR stp.closing_ayah IS NOT NULL)
    ORDER BY t.starts_on DESC
    LIMIT 1;

    -- Second choice: to_surah/to_ayah from the latest approved evaluation.
    IF prev IS NULL OR (prev.closing_surah IS NULL AND prev.closing_ayah IS NULL) THEN
      SELECT e.to_surah AS closing_surah, e.to_ayah AS closing_ayah,
             NULL::smallint AS closing_page, NULL::smallint AS closing_hizb
        INTO prev_eval
      FROM public.evaluations e
      JOIN public.terms t ON t.id = e.term_id
      WHERE e.student_id = s.id AND e.status = 'approved'
        AND e.to_surah IS NOT NULL AND e.to_ayah IS NOT NULL
      ORDER BY t.starts_on DESC, e.evaluation_number DESC
      LIMIT 1;

      IF prev_eval.closing_surah IS NOT NULL THEN
        prev := prev_eval;
      END IF;
    END IF;

    INSERT INTO public.student_term_progress(
      student_id, term_id,
      opening_surah, opening_ayah, opening_page, opening_hizb,
      status
    ) VALUES (
      s.id, v_term.id,
      prev.closing_surah, prev.closing_ayah, prev.closing_page, prev.closing_hizb,
      'open'
    )
    ON CONFLICT (student_id, term_id) DO NOTHING;

    v_carried := v_carried + 1;
    prev := NULL;
    prev_eval := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'carried_forward', v_carried,
    'skipped',         v_skipped,
    'term_id',         v_term.id,
    'term_name',       v_term.name
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.amqm_auto_carry_students_forward() TO authenticated;

-- Hook the auto-carry into the hourly automation. amqm_process_calendar
-- _automation already syncs the current session/term flags (as of
-- 20260924230000_calendar_autopilot_full.sql). Adding the carry after
-- the sync means: the moment the flag flips to the new term, the very
-- same run creates progress rows for every active student.

CREATE OR REPLACE FUNCTION public.amqm_process_calendar_automation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  camp     record;
  ev       record;
  cl       uuid[];
  cid      uuid;
  e_num    smallint;
  n        integer := 0;
  opened   integer := 0;
  closed   integer := 0;
  created  integer := 0;
  carry    jsonb;
BEGIN
  -- Advance session (academic_years.is_current) and term (terms.is_current)
  -- based on today's date.
  PERFORM public.amqm_sync_calendar_state();

  -- Carry every active non-graduated student into the newly-current term
  -- if they don't already have a progress row there. Alumni transition
  -- (for graduated students) is handled by the graduation trigger.
  carry := public.amqm_auto_carry_students_forward();

  -- Evaluation campaigns: open/close as their windows arrive.
  FOR ev IN
    SELECT e.*, ('evaluation_' || e.evaluation_number::text) AS expected_type
    FROM public.school_calendar_events e
    WHERE e.event_type IN ('evaluation_1','evaluation_2','evaluation_3')
      AND e.term_id IS NOT NULL AND e.starts_at IS NOT NULL AND e.ends_at IS NOT NULL
  LOOP
    e_num := ev.evaluation_number;
    IF NOT EXISTS (
      SELECT 1 FROM public.evaluation_campaigns existing_campaign
      WHERE existing_campaign.term_id = ev.term_id
        AND existing_campaign.evaluation_number = e_num
    ) THEN
      SELECT coalesce(array_agg(cls.id ORDER BY cls.name), '{}'::uuid[]) INTO cl
      FROM public.classes cls WHERE cls.active = true;

      IF coalesce(array_length(cl,1), 0) > 0 AND now() >= ev.starts_at THEN
        IF e_num = 1 OR NOT EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.status = 'active' AND s.class_id = ANY(cl)
            AND NOT EXISTS (
              SELECT 1 FROM public.evaluations pe
              WHERE pe.student_id = s.id
                AND pe.term_id = ev.term_id
                AND pe.evaluation_number = e_num - 1
                AND pe.status = 'approved'
            )
        ) THEN
          INSERT INTO public.evaluation_campaigns(
            term_id, evaluation_number, title, calendar_event_id,
            opens_at, closes_at, status, created_by
          )
          VALUES (
            ev.term_id, e_num, ev.title, ev.id,
            ev.starts_at, ev.ends_at,
            CASE WHEN now() < ev.ends_at THEN 'open' ELSE 'closed' END,
            NULL
          )
          RETURNING id INTO cid;

          INSERT INTO public.evaluation_campaign_classes(campaign_id, class_id)
          SELECT cid, x FROM unnest(cl) x ON CONFLICT DO NOTHING;

          created := created + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  FOR camp IN
    SELECT * FROM public.evaluation_campaigns WHERE status IN ('scheduled','open')
  LOOP
    IF now() >= camp.opens_at AND now() < camp.closes_at AND camp.status = 'scheduled' THEN
      IF camp.evaluation_number = 1 OR NOT EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.evaluation_campaign_classes cc
          ON cc.class_id = s.class_id AND cc.campaign_id = camp.id
        WHERE s.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM public.evaluations e
            WHERE e.student_id = s.id
              AND e.term_id = camp.term_id
              AND e.evaluation_number = camp.evaluation_number - 1
              AND e.status = 'approved'
          )
      ) THEN
        UPDATE public.evaluation_campaigns
        SET status = 'open', updated_at = now()
        WHERE id = camp.id;
        opened := opened + 1;
      END IF;
    ELSIF now() >= camp.closes_at AND camp.status = 'open' THEN
      UPDATE public.evaluation_campaigns
      SET status = 'closed', updated_at = now()
      WHERE id = camp.id;
      closed := closed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created_campaigns',       created,
    'opened_campaigns',        opened,
    'closed_campaigns',        closed,
    'drafts_prepared',         n,
    'carry_forward',           carry
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.amqm_process_calendar_automation() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.amqm_process_calendar_automation() FROM anon;
NOTIFY pgrst, 'reload schema';

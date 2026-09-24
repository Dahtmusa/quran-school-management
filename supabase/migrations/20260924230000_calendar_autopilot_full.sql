-- True autopilot for sessions (academic years) and terms.
--
-- amqm-calendar-automation-hourly runs public.amqm_process_calendar_automation()
-- every hour. That function opens/closes evaluation campaigns as their
-- windows arrive — but it does NOT touch academic_years.is_current or
-- terms.is_current. Those flags only get refreshed when a user actually
-- loads /calendar or /fees (both call amqm_sync_calendar_state via the
-- client store).
--
-- Result: if nobody visits the site for a stretch (weekend, holiday, or the
-- overnight cutover between sessions), the "current session" and "current
-- term" stay stale until the first admin logs in. Downstream figures that
-- depend on is_current (e.g. amqm_admin_dashboard_snapshot) show the wrong
-- period until a page load kicks the sync.
--
-- Fix: run amqm_sync_calendar_state() at the top of the same hourly job,
-- so both session and term flags advance on their own, worst-case within
-- an hour of the transition. No new cron job, no schema change — just an
-- extra PERFORM inside the automation function.

CREATE OR REPLACE FUNCTION public.amqm_process_calendar_automation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  camp   record;
  ev     record;
  cl     uuid[];
  cid    uuid;
  e_num  smallint;
  n      integer := 0;
  opened integer := 0;
  closed integer := 0;
  created integer := 0;
BEGIN
  -- Advance session (academic_years.is_current) and term (terms.is_current)
  -- based on today's date, so the hourly job carries the flags forward
  -- without needing a page load. The sync is idempotent and cheap.
  PERFORM public.amqm_sync_calendar_state();

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
    'created_campaigns', created,
    'opened_campaigns',  opened,
    'closed_campaigns',  closed,
    'drafts_prepared',   n
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.amqm_process_calendar_automation() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.amqm_process_calendar_automation() FROM anon;
NOTIFY pgrst, 'reload schema';

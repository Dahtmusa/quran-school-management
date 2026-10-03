-- Admin notification system.
--
-- One table backs both SMS-outbox-style records (we also log every SMS to
-- attendance_sms_log but THAT is for audit; this is for the recipient's
-- in-app bell) and in-app notifications for teachers / staff. A fee
-- reminder sent as an SMS to a parent lives in the audit log; an in-app
-- notification sent to a teacher lives here with read_at tracking.

CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  title         text NOT NULL,
  body          text,
  link          text,
  read_at       timestamptz,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx
  ON public.notifications(recipient_id, read_at NULLS FIRST, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications own select" ON public.notifications;
CREATE POLICY "notifications own select" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid()
     OR  public.my_role() IN ('super_admin','admin','principal'));

DROP POLICY IF EXISTS "notifications admin insert" ON public.notifications;
CREATE POLICY "notifications admin insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('super_admin','admin','principal'));

DROP POLICY IF EXISTS "notifications own update" ON public.notifications;
CREATE POLICY "notifications own update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- RPCs ------------------------------------------------------------------

-- Bulk-create one notification per recipient. Admin-only.
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_recipient_ids uuid[],
  p_title         text,
  p_body          text,
  p_link          text,
  p_kind          text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_actor uuid := auth.uid();
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_recipient_ids IS NULL OR coalesce(array_length(p_recipient_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Pick at least one recipient';
  END IF;
  IF trim(coalesce(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  INSERT INTO public.notifications(recipient_id, kind, title, body, link, created_by)
  SELECT rid, coalesce(nullif(trim(p_kind),''),'announcement'),
         trim(p_title), nullif(trim(coalesce(p_body,'')),''),
         nullif(trim(coalesce(p_link,'')),''), v_actor
  FROM unnest(p_recipient_ids) AS rid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(uuid[], text, text, text, text) TO authenticated;

-- The signed-in user's unread notification count. Powers the bell badge.
CREATE OR REPLACE FUNCTION public.my_unread_notifications_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.notifications
  WHERE recipient_id = auth.uid() AND read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.my_unread_notifications_count() TO authenticated;

-- Mark a set of notifications as read (or everything if p_ids is null).
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF p_ids IS NULL OR coalesce(array_length(p_ids,1), 0) = 0 THEN
    UPDATE public.notifications
       SET read_at = now()
     WHERE recipient_id = auth.uid() AND read_at IS NULL;
  ELSE
    UPDATE public.notifications
       SET read_at = now()
     WHERE recipient_id = auth.uid()
       AND id = ANY(p_ids)
       AND read_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_my_notifications_read(uuid[]) TO authenticated;

-- Per-student outstanding fees (summed across every fee structure).
-- Used by the fee-reminder composer so the admin sees a sorted list of
-- who still owes money without having to look it up elsewhere.
CREATE OR REPLACE FUNCTION public.admin_students_with_outstanding_fees()
RETURNS TABLE(
  student_id      uuid,
  full_name       text,
  admission_no    text,
  section         text,
  class_name      text,
  parent_name     text,
  parent_phone    text,
  outstanding_ngn numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         s.full_name,
         s.admission_no,
         lower(s.section::text),
         c.name,
         s.parent_name,
         coalesce(s.parent_phone, s.guardian_phone),
         sum(greatest(coalesce(sf.amount_due,0) - coalesce(sf.amount_paid,0), 0))
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.student_fees sf ON sf.student_id = s.id
  WHERE s.status = 'active'
    AND public.my_role() IN ('super_admin','admin','principal','finance')
  GROUP BY s.id, c.name
  HAVING sum(greatest(coalesce(sf.amount_due,0) - coalesce(sf.amount_paid,0), 0)) > 0
  ORDER BY sum(greatest(coalesce(sf.amount_due,0) - coalesce(sf.amount_paid,0), 0)) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_students_with_outstanding_fees() TO authenticated;

NOTIFY pgrst, 'reload schema';

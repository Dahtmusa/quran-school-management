-- Migration 082: Admin one-click approval for all historical evals in a class/term
-- Approves every pending_approval evaluation (eval1, eval2, eval3) that has
-- no campaign_id (i.e. historical records) for all students in a given class.

CREATE OR REPLACE FUNCTION public.admin_approve_class_historical_evals(
  p_term_id  uuid,
  p_class_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF public.my_role() NOT IN ('super_admin', 'admin', 'principal') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.evaluations
  SET
    status      = 'approved',
    approved_at = now(),
    approved_by = auth.uid()
  WHERE term_id     = p_term_id
    AND campaign_id IS NULL          -- historical only (no campaign)
    AND status      = 'pending_approval'
    AND student_id IN (
      SELECT id FROM public.students WHERE class_id = p_class_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_approve_class_historical_evals(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_approve_class_historical_evals(uuid, uuid) FROM anon;

NOTIFY pgrst, 'reload schema';

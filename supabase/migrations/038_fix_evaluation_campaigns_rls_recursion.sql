-- Migration 038: Fix infinite recursion in evaluation RLS policies.
--
-- Root cause (error 42P17):
--   - evaluation_campaigns SELECT policy: "exists(select 1 from evaluations where campaign_id = ...)"
--   - evaluations SELECT policy: "exists(select 1 from evaluation_campaigns where id = ... and now() between opens_at and closes_at)"
-- These two reference each other, causing PostgreSQL to recurse indefinitely.
--
-- Fix: Replace the direct evaluations subquery in the evaluation_campaigns policy with a
-- SECURITY DEFINER helper function. SECURITY DEFINER runs as the function owner (postgres),
-- which bypasses RLS, so the inner evaluations query never re-triggers the cycle.

CREATE OR REPLACE FUNCTION public.teacher_has_evaluations_in_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.evaluations
    WHERE campaign_id = p_campaign_id
      AND teacher_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.teacher_has_evaluations_in_campaign(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.teacher_has_evaluations_in_campaign(uuid) FROM anon;

-- Replace the recursive evaluation_campaigns SELECT policy.
DROP POLICY IF EXISTS "authorized users read evaluation campaigns" ON public.evaluation_campaigns;
CREATE POLICY "authorized users read evaluation campaigns"
  ON public.evaluation_campaigns
  FOR SELECT TO authenticated
  USING (
    public.my_role() IN ('super_admin','admin','principal')
    OR public.teacher_has_evaluations_in_campaign(id)
  );

NOTIFY pgrst, 'reload schema';

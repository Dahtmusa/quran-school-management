-- Migration 081: Allow teachers to read their own historical evaluations
-- The existing "teachers see campaign evaluations" policy only allows teachers
-- to see draft (open campaign) and returned evals. Historical evals have
-- campaign_id = NULL and status = 'pending_approval' / 'approved', so teachers
-- could not read them back after submitting — status showed "Not submitted".
-- Fix: add `campaign_id IS NULL` as an additional visible condition so teachers
-- can always see evaluations they submitted outside a campaign window.

DROP POLICY IF EXISTS "teachers see campaign evaluations" ON public.evaluations;

CREATE POLICY "teachers see campaign evaluations" ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    -- Admins and principals see everything
    public.my_role() IN ('super_admin', 'admin', 'principal')
    -- Teachers see their own: campaign evals (draft/returned) + any historical (no campaign)
    OR (
      teacher_id = auth.uid()
      AND (
        (status = 'returned' AND teacher_visible = true)
        OR (status = 'draft' AND EXISTS (
          SELECT 1 FROM public.evaluation_campaigns c
          WHERE c.id = evaluations.campaign_id
            AND now() BETWEEN c.opens_at AND c.closes_at
        ))
        OR campaign_id IS NULL   -- historical submissions have no campaign
      )
    )
    -- Parents see approved evals for their children
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.parent_students ps
        WHERE ps.student_id = evaluations.student_id
          AND ps.parent_id = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';

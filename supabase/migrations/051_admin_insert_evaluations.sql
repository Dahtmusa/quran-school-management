-- Migration 051: Allow admins/principal to insert evaluations directly.
-- Needed for bulk historical import where admin enters past eval data
-- on behalf of teachers.

CREATE POLICY "admins insert evaluations" ON public.evaluations
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('super_admin','admin','principal'));

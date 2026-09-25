-- Missing SELECT policy on public.admissions.
--
-- Migration 009 created INSERT / UPDATE / DELETE policies for the
-- admissions team but no SELECT policy. Result: admin /admissions/manage
-- shows "No applications yet" even after the public form successfully
-- writes a row, because RLS blocks the direct select. The applicant
-- tracker works (SECURITY DEFINER RPC) which is what proved the row
-- actually exists.
--
-- Add the missing SELECT policy for the same set of staff roles the
-- INSERT / UPDATE policies already cover.
DROP POLICY IF EXISTS "admissions staff read" ON public.admissions;
CREATE POLICY "admissions staff read"
  ON public.admissions
  FOR SELECT TO authenticated
  USING (
    public.my_role() = ANY (ARRAY[
      'super_admin'::user_role,
      'admin'::user_role,
      'principal'::user_role,
      'admissions'::user_role,
      'finance'::user_role
    ])
  );
NOTIFY pgrst, 'reload schema';

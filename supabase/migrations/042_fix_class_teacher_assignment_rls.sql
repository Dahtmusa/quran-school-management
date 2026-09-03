-- Migration 042: Fix "permission denied for function is_teacher_profile" when
-- assigning teachers to classes. Migrations 020/023 revoked EXECUTE on that
-- function from all roles, but the class_teachers WITH CHECK policy still
-- called it. Rewrite the policy to inline the check.

DROP POLICY IF EXISTS "admins manage class teachers" ON public.class_teachers;
CREATE POLICY "admins manage class teachers" ON public.class_teachers
  FOR ALL TO authenticated
  USING (public.my_role() IN ('super_admin','admin','principal'))
  WITH CHECK (
    public.my_role() IN ('super_admin','admin','principal')
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id = teacher_id AND role = 'teacher')
  );

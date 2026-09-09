-- Migration 083: Teachers see historical evals by class assignment, not teacher_id
--
-- Problem: admin-entered historical evals have teacher_id = admin's user_id.
-- The old policy used teacher_id = auth.uid() for the historical branch, so
-- teachers couldn't see admin-entered records for their own class students.
--
-- Fix: split the historical branch — use class_teachers lookup so any teacher
-- assigned to the class sees ALL its historical evals, regardless of who
-- created them (admin or another teacher).

DROP POLICY IF EXISTS "teachers see campaign evaluations" ON public.evaluations;

CREATE POLICY "teachers see campaign evaluations" ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    -- Admins and principals see everything
    public.my_role() IN ('super_admin', 'admin', 'principal')

    -- Teachers: own campaign evals (draft open / returned-visible)
    OR (
      teacher_id = auth.uid()
      AND (
        (status = 'returned' AND teacher_visible = true)
        OR (status = 'draft' AND EXISTS (
          SELECT 1 FROM public.evaluation_campaigns c
          WHERE c.id = evaluations.campaign_id
            AND now() BETWEEN c.opens_at AND c.closes_at
        ))
      )
    )

    -- Historical evals (no campaign): visible to any teacher assigned to the student's class
    OR (
      campaign_id IS NULL
      AND student_id IN (
        SELECT s.id FROM public.students s
        WHERE s.class_id IN (
          SELECT ct.class_id FROM public.class_teachers ct
          WHERE ct.teacher_id = auth.uid()
        )
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

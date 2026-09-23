-- Staff attendance administration: manual warnings and manual charges/fines.
ALTER TABLE public.staff_attendance_fines
  ALTER COLUMN attendance_record_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.staff_attendance_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warning_type text NOT NULL DEFAULT 'attendance',
  reason text NOT NULL,
  notes text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved','withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_warnings_staff ON public.staff_attendance_warnings(staff_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_warnings_status ON public.staff_attendance_warnings(status);

ALTER TABLE public.staff_attendance_warnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage staff attendance warnings" ON public.staff_attendance_warnings;
CREATE POLICY "admins manage staff attendance warnings"
ON public.staff_attendance_warnings FOR ALL TO authenticated
USING(public.my_role() IN ('super_admin','admin','principal'))
WITH CHECK(public.my_role() IN ('super_admin','admin','principal'));

GRANT ALL ON public.staff_attendance_warnings TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.staff_attendance_warnings TO authenticated;

NOTIFY pgrst,'reload schema';
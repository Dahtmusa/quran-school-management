-- AMQM attendance v3
-- Adds: SMS log + provider settings, per-status flat staff fines,
--       admin manual override RPC, staff fine summary RPC,
--       realtime publication for the attendance dashboard.
-- Keeps: attendance_records / attendance_statuses table shapes (downstream
--        RPCs like amqm_admin_dashboard_snapshot depend on them) and the
--        v2 gate + boarding RPCs (still fit-for-purpose).

-- 1. Settings: extend the existing key/value attendance_settings table with
--    the new configurable values the admin can edit from the UI.
INSERT INTO public.attendance_settings(key,value,description) VALUES
 ('morning_cutoff_time', to_jsonb('08:30'::text),
   'Local time in Africa/Lagos after which a scan is recorded as Late.'),
 ('staff_late_fine_ngn', to_jsonb(500),
   'Flat NGN penalty applied to a staff member for each Late attendance record.'),
 ('staff_absent_fine_ngn', to_jsonb(2000),
   'Flat NGN penalty applied to a staff member for each Absent attendance record.'),
 ('sms_enabled', to_jsonb(true),
   'Whether SMS notifications to parents are enabled.'),
 ('sms_arrival_template', to_jsonb(
    'Assalamu alaikum. This is AMQM. {student_name} arrived at school at {time} today, {date}.'::text),
   'SMS sent to a day-student parent after a Present gate scan.'),
 ('sms_late_template', to_jsonb(
    'Assalamu alaikum. This is AMQM. {student_name} arrived LATE at school at {time} today, {date}.'::text),
   'SMS sent to a day-student parent after a Late gate scan.'),
 ('sms_absent_template', to_jsonb(
    'Assalamu alaikum. This is AMQM. {student_name} was ABSENT from school today, {date}. Please contact the office.'::text),
   'SMS sent to a day-student parent when the admin marks them Absent.')
ON CONFLICT (key) DO NOTHING;

-- 2. SMS audit log so the admin can see what was sent (and by whom).
CREATE TABLE IF NOT EXISTS public.attendance_sms_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  parent_phone text NOT NULL,
  template_kind text NOT NULL CHECK (template_kind IN ('arrival','late','absent','custom')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','queued')),
  provider_response text,
  sent_by uuid REFERENCES public.profiles(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_sms_log_student_idx
  ON public.attendance_sms_log(student_id, sent_at DESC);
ALTER TABLE public.attendance_sms_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin reads sms log" ON public.attendance_sms_log;
CREATE POLICY "admin reads sms log" ON public.attendance_sms_log
  FOR SELECT TO authenticated
  USING (public.my_role() IN ('super_admin','admin','principal'));
DROP POLICY IF EXISTS "admin writes sms log" ON public.attendance_sms_log;
CREATE POLICY "admin writes sms log" ON public.attendance_sms_log
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('super_admin','admin','principal'));

-- 3. Admin manual override: mark Excused / Absent / Late / Present for any
--    person on any past-or-current date. Upserts on (person, date, morning).
CREATE OR REPLACE FUNCTION public.admin_set_attendance_status(
  p_person_id uuid,
  p_person_type text,
  p_date date,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_person_type NOT IN ('student','staff') THEN
    RAISE EXCEPTION 'Invalid attendance person type';
  END IF;
  IF p_status NOT IN ('present','late','absent','excused','sick') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  IF p_date > (now() AT TIME ZONE 'Africa/Lagos')::date THEN
    RAISE EXCEPTION 'Future attendance is not allowed';
  END IF;

  INSERT INTO public.attendance_records(
    person_id, person_type, scanned_at, attendance_date, status_code,
    period, review_status, recorded_by, note
  ) VALUES (
    p_person_id, p_person_type, now(), p_date, p_status,
    'morning', 'approved', auth.uid(), p_notes
  )
  ON CONFLICT (person_id, attendance_date, period)
  DO UPDATE SET
    person_type = EXCLUDED.person_type,
    status_code = EXCLUDED.status_code,
    note        = COALESCE(EXCLUDED.note, attendance_records.note),
    scanned_at  = now(),
    recorded_by = auth.uid()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_attendance_status(uuid,text,date,text,text) TO authenticated;

-- 4. Staff fines summary: reads the configured per-status flat amounts and
--    counts staff Late/Absent records in the given window.
CREATE OR REPLACE FUNCTION public.admin_staff_fines_summary(
  p_from date,
  p_to   date
)
RETURNS TABLE(
  staff_id       uuid,
  full_name      text,
  staff_no       text,
  job_title      text,
  late_count     integer,
  absent_count   integer,
  late_fine_ngn  numeric,
  absent_fine_ngn numeric,
  total_ngn      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_late   numeric := 0;
  v_absent numeric := 0;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT (value#>>'{}')::numeric INTO v_late
    FROM attendance_settings WHERE key='staff_late_fine_ngn';
  SELECT (value#>>'{}')::numeric INTO v_absent
    FROM attendance_settings WHERE key='staff_absent_fine_ngn';
  v_late   := COALESCE(v_late, 0);
  v_absent := COALESCE(v_absent, 0);

  RETURN QUERY
  WITH staff AS (
    SELECT p.id, p.full_name, p.staff_id, p.job_title
    FROM profiles p
    WHERE p.employment_status='active'
      AND p.role NOT IN ('admin','super_admin','principal','finance','admissions','parent')
  ),
  counts AS (
    SELECT ar.person_id AS id,
           COUNT(*) FILTER (WHERE ar.status_code='late')::int   AS late_count,
           COUNT(*) FILTER (WHERE ar.status_code='absent')::int AS absent_count
    FROM attendance_records ar
    WHERE ar.person_type='staff'
      AND ar.attendance_date BETWEEN p_from AND p_to
    GROUP BY ar.person_id
  )
  SELECT s.id, s.full_name, s.staff_id, s.job_title,
         COALESCE(c.late_count,0),
         COALESCE(c.absent_count,0),
         COALESCE(c.late_count,0)   * v_late,
         COALESCE(c.absent_count,0) * v_absent,
         COALESCE(c.late_count,0)   * v_late
       + COALESCE(c.absent_count,0) * v_absent
  FROM staff s
  LEFT JOIN counts c ON c.id = s.id
  WHERE COALESCE(c.late_count,0) + COALESCE(c.absent_count,0) > 0
  ORDER BY total_ngn DESC, s.full_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_staff_fines_summary(date,date) TO authenticated;

-- 5. Realtime: push attendance_records changes to the dashboard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='attendance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;
END $$;

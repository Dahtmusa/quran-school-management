-- AMQM clean attendance v2
-- Rules:
-- 1. Day students: main-gate scanner only.
-- 2. Boarding students: their assigned teacher records them.
-- 3. Ordinary staff: main-gate scanner only.
-- 4. Management/leadership: excluded from attendance.

CREATE OR REPLACE FUNCTION public.resolve_amqm_attendance_person(p_input text)
RETURNS TABLE(
  person_id uuid,
  person_type text,
  display_name text,
  identifier text,
  section text,
  role text,
  photo_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input text := trim(p_input);
  v_json jsonb;
  v_id text;
  v_type text;
BEGIN
  IF v_input IS NULL OR v_input = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_json := v_input::jsonb;
    IF jsonb_typeof(v_json) = 'object' AND v_json ? 'institution'
       AND upper(v_json->>'institution') = 'AMQM' THEN
      v_id := trim(coalesce(v_json->>'id',''));
      v_type := upper(trim(coalesce(v_json->>'type','')));
    END IF;
  EXCEPTION WHEN others THEN
    v_json := NULL;
  END;

  -- Student: accept UUID from QR or printed admission/student ID.
  IF v_type IN ('STUDENT','') OR v_type IS NULL THEN
    IF v_id <> '' THEN
      RETURN QUERY
      SELECT s.id,'student',s.full_name,s.admission_no,lower(s.section::text),NULL::text,s.photo_url
      FROM students s
      WHERE s.status='active'
        AND (s.id::text=v_id OR lower(trim(s.admission_no))=lower(v_id) OR lower(trim(coalesce(s.student_id_number,'')))=lower(v_id))
      LIMIT 1;
      IF FOUND THEN RETURN; END IF;
    END IF;
  END IF;

  -- Staff: accept UUID from QR or the printed staff ID.
  -- Management/leadership roles are deliberately excluded.
  IF v_type IN ('STAFF','MANAGEMENT','') OR v_type IS NULL THEN
    IF v_id = '' THEN v_id := v_input; END IF;
    RETURN QUERY
    SELECT p.id,'staff',p.full_name,p.staff_id,NULL::text,p.job_title,p.avatar_url
    FROM profiles p
    WHERE p.employment_status='active'
      AND p.role NOT IN ('admin','super_admin','principal','finance','admissions','security','librarian','accountant')
      AND (p.id::text=v_id OR lower(trim(coalesce(p.staff_id,'')))=lower(v_id))
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_amqm_attendance_person(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_amqm_gate_attendance(
  p_person_id uuid,
  p_person_type text,
  p_scan_point_id uuid DEFAULT NULL
)
RETURNS TABLE(
  record_id uuid,
  status_code text,
  scanned_at timestamptz,
  display_name text,
  identifier text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_identifier text;
  v_section text;
  v_role text;
  v_existing attendance_records%ROWTYPE;
  v_status text := 'present';
  v_now timestamptz := now();
  v_date date := (v_now AT TIME ZONE 'Africa/Lagos')::date;
  v_cutoff text := '09:00';
  v_cutoff_time time;
  v_record attendance_records%ROWTYPE;
BEGIN
  IF public.my_role() NOT IN ('security','admin','super_admin','principal') THEN
    RAISE EXCEPTION 'Gate attendance access required';
  END IF;

  IF p_person_type='student' THEN
    SELECT s.full_name,s.admission_no,lower(s.section::text)
      INTO v_name,v_identifier,v_section
    FROM students s WHERE s.id=p_person_id AND s.status='active';

    IF v_name IS NULL THEN RAISE EXCEPTION 'Active student not found'; END IF;
    IF v_section <> 'day' THEN RAISE EXCEPTION 'Boarding students are recorded by their teacher, not at the main gate'; END IF;
  ELSIF p_person_type='staff' THEN
    SELECT p.full_name,p.staff_id,p.job_title,p.role
      INTO v_name,v_identifier,v_role,v_role
    FROM profiles p
    WHERE p.id=p_person_id AND p.employment_status='active'
      AND p.role NOT IN ('admin','super_admin','principal','finance','admissions','security','librarian','accountant');

    IF v_name IS NULL THEN RAISE EXCEPTION 'Staff member is not eligible for gate attendance'; END IF;
  ELSE
    RAISE EXCEPTION 'Invalid attendance person type';
  END IF;

  SELECT trim(both '"' from value::text) INTO v_cutoff
  FROM attendance_settings WHERE key='morning_cutoff_time';
  BEGIN v_cutoff_time := v_cutoff::time; EXCEPTION WHEN others THEN v_cutoff_time := '09:00'; END;

  IF (v_now AT TIME ZONE 'Africa/Lagos')::time >= v_cutoff_time THEN
    v_status := 'late';
  END IF;

  SELECT * INTO v_existing FROM attendance_records
  WHERE person_id=p_person_id AND person_type=p_person_type
    AND attendance_date=v_date AND period='morning'
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing.id,v_existing.status_code,v_existing.scanned_at,v_name,v_identifier,
      'Already recorded for today'::text;
    RETURN;
  END IF;

  INSERT INTO attendance_records(
    person_id,person_type,scanned_at,attendance_date,status_code,period,
    review_status,recorded_by,scan_point_id
  ) VALUES (
    p_person_id,p_person_type,v_now,v_date,v_status,'morning',
    'approved',auth.uid(),p_scan_point_id
  ) RETURNING * INTO v_record;

  RETURN QUERY SELECT v_record.id,v_record.status_code,v_record.scanned_at,v_name,v_identifier,
    'Attendance recorded'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_amqm_gate_attendance(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_amqm_boarding_roster(p_date date DEFAULT (now() AT TIME ZONE 'Africa/Lagos')::date)
RETURNS TABLE(
  student_id uuid, full_name text, admission_no text, class_name text,
  status_code text, recorded_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path=public
AS $$
  SELECT s.id,s.full_name,s.admission_no,c.name,ar.status_code,ar.scanned_at
  FROM students s
  LEFT JOIN classes c ON c.id=s.class_id
  JOIN teacher_students ts ON ts.student_id=s.id AND ts.teacher_id=auth.uid()
  LEFT JOIN attendance_records ar
    ON ar.person_id=s.id AND ar.person_type='student'
   AND ar.attendance_date=p_date AND ar.period='morning'
  WHERE public.my_role()='teacher'
    AND s.status='active' AND lower(s.section::text)='boarding'
  ORDER BY coalesce(c.name,''),s.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_amqm_boarding_roster(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_amqm_record_boarding_attendance(
  p_student_id uuid,p_status text,p_date date DEFAULT (now() AT TIME ZONE 'Africa/Lagos')::date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE rid uuid;
BEGIN
  IF public.my_role()<>'teacher' THEN RAISE EXCEPTION 'Teacher access required'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM students s JOIN teacher_students ts ON ts.student_id=s.id
    WHERE s.id=p_student_id AND ts.teacher_id=auth.uid() AND s.status='active'
      AND lower(s.section::text)='boarding'
  ) THEN RAISE EXCEPTION 'This boarding student is not assigned to you'; END IF;
  IF p_status NOT IN ('present','late','absent','excused','sick') THEN RAISE EXCEPTION 'Invalid attendance status'; END IF;

  INSERT INTO attendance_records(
    person_id,person_type,scanned_at,attendance_date,status_code,period,review_status,recorded_by
  ) VALUES(p_student_id,'student',now(),p_date,p_status,'morning','approved',auth.uid())
  ON CONFLICT(person_id,attendance_date,period)
  DO UPDATE SET status_code=excluded.status_code,scanned_at=excluded.scanned_at,
    review_status='approved',recorded_by=auth.uid()
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_amqm_record_boarding_attendance(uuid,text,date) TO authenticated;

NOTIFY pgrst,'reload schema';
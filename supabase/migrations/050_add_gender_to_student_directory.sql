-- Migration 050: Add gender to admin_get_student_directory so the
-- Students page can filter by gender.

CREATE OR REPLACE FUNCTION public.admin_get_student_directory()
RETURNS TABLE (
  id uuid, admission_no text, full_name text, student_id_number text,
  id_expires_on date, section public.section_type, program_year public.program_year,
  gender text, status text, photo_url text,
  start_surah smallint, start_ayah smallint,
  current_surah smallint, current_ayah smallint,
  memorization_direction text,
  attendance_percent numeric, fees_due numeric,
  teacher_name text, class_name text, class_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance','admissions') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
  SELECT
    s.id, s.admission_no, s.full_name,
    s.student_id_number, s.id_expires_on,
    s.section, s.program_year, s.gender, s.status, s.photo_url,
    s.start_surah, s.start_ayah,
    s.current_surah, s.current_ayah,
    s.memorization_direction::text,
    COALESCE(att.pct, 0) AS attendance_percent,
    COALESCE(sf.due, 0) AS fees_due,
    p.full_name AS teacher_name,
    c.name AS class_name,
    c.id AS class_id
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.class_teachers ct ON ct.class_id = c.id AND ct.is_primary = true
  LEFT JOIN public.profiles p ON p.id = ct.teacher_id
  LEFT JOIN LATERAL (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'present') / NULLIF(COUNT(*), 0), 1) AS pct
    FROM public.attendance_records
    WHERE student_id = s.id
  ) att ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS due
    FROM public.student_fees
    WHERE student_id = s.id AND amount_paid < amount_due
  ) sf ON true
  WHERE s.status <> 'deleted'
  ORDER BY s.full_name;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_get_student_directory() TO authenticated;

NOTIFY pgrst, 'reload schema';

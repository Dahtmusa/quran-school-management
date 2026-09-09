-- Migration 084: Fix teacher_name showing as null / "Unassigned" in student directory
--
-- Root cause: admin_get_student_directory joins class_teachers with AND ct.is_primary = true.
-- If a teacher is assigned but is_primary is false/null, teacher_name returns null.
--
-- Fix: use a LATERAL subquery that orders by is_primary DESC so it prefers the primary
-- teacher but falls back to any assigned teacher if none is flagged primary.

CREATE OR REPLACE FUNCTION public.admin_get_student_directory()
RETURNS TABLE (
  id uuid, admission_no text, full_name text,
  student_id_number text, id_expires_on date,
  section text, program_year smallint, gender text, status text, photo_url text,
  start_surah smallint, start_ayah smallint,
  current_surah smallint, current_ayah smallint,
  memorization_direction text,
  attendance_percent numeric, fees_due numeric,
  teacher_name text, class_name text, class_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
  -- Prefer primary teacher, fall back to any assigned teacher
  LEFT JOIN LATERAL (
    SELECT teacher_id FROM public.class_teachers
    WHERE class_id = c.id
    ORDER BY is_primary DESC NULLS LAST, assigned_at ASC
    LIMIT 1
  ) ct ON true
  LEFT JOIN public.profiles p ON p.id = ct.teacher_id
  LEFT JOIN LATERAL (
    SELECT ROUND(
      100.0 * COUNT(*) FILTER (WHERE ast.counts_as_present) / NULLIF(COUNT(*), 0),
      1
    ) AS pct
    FROM public.attendance_records ar
    JOIN public.attendance_statuses ast ON ast.code = ar.status_code
    WHERE ar.person_id = s.id
      AND ar.person_type = 'student'
      AND ar.review_status = 'approved'
  ) att ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS due
    FROM public.student_fees
    WHERE student_id = s.id AND status NOT IN ('cancelled', 'waived')
  ) sf ON true
  WHERE s.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_student_directory() TO authenticated;
NOTIFY pgrst, 'reload schema';

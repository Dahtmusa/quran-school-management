-- Migration 078: Fix get_teacher_student_directory
-- 1. Add memorization_direction to return type (needed by teacher historical eval section)
-- 2. Filter to status = 'active' only (migration 076 introduced suspended/expelled/withdrawn)

DROP FUNCTION IF EXISTS public.get_teacher_student_directory();

CREATE OR REPLACE FUNCTION public.get_teacher_student_directory()
RETURNS TABLE(
  student_id uuid, admission_no text, full_name text, date_of_birth date,
  gender text, section public.section_type, program_year public.program_year,
  status text, photo_url text,
  start_surah smallint, start_ayah smallint,
  current_surah smallint, current_ayah smallint,
  current_page smallint, current_hizb smallint,
  memorization_direction text,
  class_id uuid, class_name text,
  parent_name text, parent_phone text, parent_relationship text
)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT
    s.id, s.admission_no, s.full_name, s.date_of_birth,
    s.gender, s.section, s.program_year,
    s.status, s.photo_url,
    s.start_surah, s.start_ayah,
    s.current_surah, s.current_ayah,
    s.current_page, s.current_hizb,
    s.memorization_direction::text,
    s.class_id, c.name,
    pp.full_name, pp.phone, ps.relationship
  FROM public.teacher_students ts
  JOIN public.students s ON s.id = ts.student_id
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN LATERAL (
    SELECT ps.parent_id, ps.relationship
    FROM public.parent_students ps
    WHERE ps.student_id = s.id
    ORDER BY ps.relationship NULLS LAST
    LIMIT 1
  ) ps ON true
  LEFT JOIN public.profiles pp ON pp.id = ps.parent_id
  WHERE ts.teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.role = 'teacher'
    )
    AND s.status = 'active'
  ORDER BY s.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_teacher_student_directory() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_teacher_student_directory() TO authenticated;

NOTIFY pgrst, 'reload schema';

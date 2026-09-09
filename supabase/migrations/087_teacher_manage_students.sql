-- Migration 087: Teacher student management
-- 1. teacher_update_student_section — teacher can change day/boarding for students in their class
-- 2. teacher_assign_student_to_class — teacher can add an unassigned student to their class
-- 3. get_unassigned_students — list students with no class assigned (for teacher to search/add)

-- ─── 1. teacher_update_student_section ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.teacher_update_student_section(
  p_student_id uuid,
  p_section    public.section_type
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class_id uuid;
  v_teacher_id uuid := auth.uid();
BEGIN
  -- Resolve which class the teacher belongs to (any class_teachers row)
  SELECT class_id INTO v_class_id
  FROM public.class_teachers
  WHERE teacher_id = v_teacher_id
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to any class';
  END IF;

  -- Ensure the student is actually in one of this teacher's classes
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.class_teachers ct ON ct.class_id = s.class_id
    WHERE s.id = p_student_id AND ct.teacher_id = v_teacher_id
  ) THEN
    RAISE EXCEPTION 'Student is not in your class';
  END IF;

  UPDATE public.students SET section = p_section WHERE id = p_student_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.teacher_update_student_section(uuid, public.section_type) FROM anon;
GRANT  EXECUTE ON FUNCTION public.teacher_update_student_section(uuid, public.section_type) TO authenticated;

-- ─── 2. teacher_assign_student_to_class ───────────────────────────────────────
-- Assigns an unassigned (class_id IS NULL) student to the teacher's primary class.
-- If teacher has multiple classes, uses the primary one; falls back to any.
CREATE OR REPLACE FUNCTION public.teacher_assign_student_to_class(
  p_student_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class_id   uuid;
  v_teacher_id uuid := auth.uid();
BEGIN
  -- Find teacher's class: prefer primary, else any
  SELECT class_id INTO v_class_id
  FROM public.class_teachers
  WHERE teacher_id = v_teacher_id
  ORDER BY is_primary DESC, class_id
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to any class';
  END IF;

  -- Only allow assigning students who have no class yet
  IF NOT EXISTS (
    SELECT 1 FROM public.students WHERE id = p_student_id AND class_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Student is already assigned to a class';
  END IF;

  UPDATE public.students SET class_id = v_class_id WHERE id = p_student_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.teacher_assign_student_to_class(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.teacher_assign_student_to_class(uuid) TO authenticated;

-- ─── 3. get_unassigned_students ───────────────────────────────────────────────
-- Returns active students with no class assignment so teacher can add them.
CREATE OR REPLACE FUNCTION public.get_unassigned_students()
RETURNS TABLE(
  student_id   uuid,
  full_name    text,
  admission_no text,
  section      text,
  program_year text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.full_name, s.admission_no, s.section::text, s.program_year::text
  FROM public.students s
  WHERE s.class_id IS NULL
    AND s.status = 'active'
  ORDER BY s.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unassigned_students() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_unassigned_students() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Migration 076: Student removal / suspension / expulsion system
-- Students are never deleted — their records are preserved and they can be reinstated.
-- Status values: active | suspended | expelled | withdrawn (plus existing 'deleted' for hard deletes)

-- ── 1. Add removal tracking columns to students ──────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS removal_reason  text,
  ADD COLUMN IF NOT EXISTS removal_notes   text,
  ADD COLUMN IF NOT EXISTS removed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by      uuid REFERENCES public.profiles(id);

-- ── 2. Update admin_get_student_directory — only return active students ───────
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
    WHERE student_id = s.id AND amount_paid < amount_due
  ) sf ON true
  WHERE s.status = 'active'
  ORDER BY s.full_name;
END $$;

-- ── 3. RPC: remove a student (suspend / expel / withdraw) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_remove_student(
  p_student_id uuid,
  p_status     text,  -- 'suspended' | 'expelled' | 'withdrawn'
  p_reason     text,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_status NOT IN ('suspended','expelled','withdrawn') THEN
    RAISE EXCEPTION 'Invalid status. Must be suspended, expelled, or withdrawn.';
  END IF;
  UPDATE public.students SET
    status         = p_status,
    removal_reason = p_reason,
    removal_notes  = p_notes,
    removed_at     = now(),
    removed_by     = auth.uid(),
    class_id       = NULL   -- remove from class
  WHERE id = p_student_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'student_removed', 'student', p_student_id,
    jsonb_build_object('status', p_status, 'reason', p_reason, 'notes', p_notes));
END $$;

-- ── 4. RPC: reinstate a student ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reinstate_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE public.students SET
    status         = 'active',
    removal_reason = NULL,
    removal_notes  = NULL,
    removed_at     = NULL,
    removed_by     = NULL
  WHERE id = p_student_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'student_reinstated', 'student', p_student_id, '{}'::jsonb);
END $$;

-- ── 5. RPC: list all removed students ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_removed_students()
RETURNS TABLE (
  id uuid, admission_no text, full_name text, photo_url text,
  gender text, section public.section_type, program_year public.program_year,
  class_name text, status text,
  removal_reason text, removal_notes text,
  removed_at timestamptz, removed_by_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
  SELECT
    s.id, s.admission_no, s.full_name, s.photo_url,
    s.gender, s.section, s.program_year,
    c.name AS class_name,
    s.status,
    s.removal_reason, s.removal_notes,
    s.removed_at,
    rb.full_name AS removed_by_name
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.profiles rb ON rb.id = s.removed_by
  WHERE s.status IN ('suspended','expelled','withdrawn')
  ORDER BY s.removed_at DESC NULLS LAST;
END $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.admin_remove_student(uuid,text,text,text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reinstate_student(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_removed_students()                 TO authenticated;

NOTIFY pgrst, 'reload schema';

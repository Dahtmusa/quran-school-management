-- Canonical teacher Quran source and direction reconciliation.
-- The public.students row is the single authoritative live Quran profile.
-- All dashboards/profiles should read direction/start/current from that row.

-- Existing production students use one of the two canonical Hifz start points.
-- Reconcile direction with that authoritative start position so the live record is internally consistent.
UPDATE public.students s
SET memorization_direction = CASE
  WHEN s.start_surah = 114 THEN 'nas_to_baqarah'::public.memorization_direction
  WHEN s.start_surah = 2 THEN 'baqarah_to_nas'::public.memorization_direction
  ELSE s.memorization_direction
END
WHERE s.status <> 'deleted'
  AND s.start_surah IN (2, 114);

-- current_page/current_hizb remain derived fields and are rebuilt from the canonical Quran position.
UPDATE public.students s
SET current_page = q.page,
    current_hizb = q.hizb
FROM public.quran_verses q
WHERE q.surah = s.current_surah
  AND q.ayah = s.current_ayah
  AND s.status <> 'deleted';

-- The teacher directory must expose the same direction stored on students.
DROP FUNCTION IF EXISTS public.get_teacher_student_directory();
CREATE OR REPLACE FUNCTION public.get_teacher_student_directory()
RETURNS TABLE(
  student_id uuid,
  admission_no text,
  full_name text,
  date_of_birth date,
  gender text,
  section public.section_type,
  program_year public.program_year,
  status text,
  photo_url text,
  start_surah smallint,
  start_ayah smallint,
  current_surah smallint,
  current_ayah smallint,
  current_page smallint,
  current_hizb smallint,
  memorization_direction text,
  class_id uuid,
  class_name text,
  parent_name text,
  parent_phone text,
  parent_relationship text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.admission_no,
    s.full_name,
    s.date_of_birth,
    s.gender,
    s.section,
    s.program_year,
    s.status,
    s.photo_url,
    s.start_surah,
    s.start_ayah,
    s.current_surah,
    s.current_ayah,
    s.current_page,
    s.current_hizb,
    s.memorization_direction::text,
    s.class_id,
    c.name,
    pp.full_name,
    pp.phone,
    ps.relationship
  FROM public.teacher_students ts
  JOIN public.students s ON s.id = ts.student_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN LATERAL (
    SELECT ps0.parent_id, ps0.relationship
    FROM public.parent_students ps0
    WHERE ps0.student_id = s.id
    ORDER BY ps0.relationship NULLS LAST
    LIMIT 1
  ) ps ON true
  LEFT JOIN public.profiles pp ON pp.id = ps.parent_id
  WHERE ts.teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.role = 'teacher'
    )
    AND s.status <> 'deleted'
  ORDER BY s.full_name;
$function$;

REVOKE ALL ON FUNCTION public.get_teacher_student_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_student_directory() TO authenticated;

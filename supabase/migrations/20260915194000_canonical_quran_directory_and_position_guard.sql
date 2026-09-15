-- Keep every current student view on the same canonical live Quran record.
-- Expand the shared directory to the school-level administrative roles.
CREATE OR REPLACE FUNCTION public.get_school_student_directory()
RETURNS TABLE(
  id uuid,
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
  memorization_direction public.memorization_direction,
  progress_percent numeric,
  class_id uuid,
  class_name text,
  teacher_name text,
  parent_name text,
  parent_phone text,
  parent_relationship text,
  attendance_percent numeric,
  fees_due numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $function$
  SELECT
    s.id,s.id,s.admission_no,s.full_name,s.date_of_birth,s.gender,s.section,s.program_year,s.status,s.photo_url,
    s.start_surah,s.start_ayah,s.current_surah,s.current_ayah,s.current_page,s.current_hizb,s.memorization_direction,
    coalesce(cp.progress_percent,0),s.class_id,c.name,tp.full_name,pp.full_name,pp.phone,ps.relationship,
    coalesce(att.pct,0),coalesce(sf.due,0)
  FROM public.students s
  LEFT JOIN public.classes c ON c.id=s.class_id
  LEFT JOIN LATERAL (
    SELECT ct.teacher_id FROM public.class_teachers ct WHERE ct.class_id=s.class_id
    ORDER BY ct.is_primary DESC NULLS LAST, ct.assigned_at ASC LIMIT 1
  ) ct ON true
  LEFT JOIN public.profiles tp ON tp.id=ct.teacher_id
  LEFT JOIN LATERAL (
    SELECT ps0.parent_id,ps0.relationship FROM public.parent_students ps0 WHERE ps0.student_id=s.id
    ORDER BY ps0.relationship NULLS LAST LIMIT 1
  ) ps ON true
  LEFT JOIN public.profiles pp ON pp.id=ps.parent_id
  LEFT JOIN LATERAL (
    SELECT cp0.progress_percent FROM public.get_student_canonical_quran_progress(s.id) cp0 LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT round(100.0*count(*) FILTER (WHERE ast.counts_as_present)/NULLIF(count(*),0),1) pct
    FROM public.attendance_records ar JOIN public.attendance_statuses ast ON ast.code=ar.status_code
    WHERE ar.person_id=s.id AND ar.person_type='student' AND ar.review_status='approved'
  ) att ON true
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(amount_due-amount_paid),0) due FROM public.student_fees
    WHERE student_id=s.id AND amount_paid<amount_due
  ) sf ON true
  WHERE s.status<>'deleted'
    AND (
      EXISTS(SELECT 1 FROM public.profiles me WHERE me.id=auth.uid() AND me.role IN ('super_admin','admin','principal'))
      OR EXISTS(SELECT 1 FROM public.teacher_students ts WHERE ts.teacher_id=auth.uid() AND ts.student_id=s.id)
      OR EXISTS(SELECT 1 FROM public.parent_students px WHERE px.parent_id=auth.uid() AND px.student_id=s.id)
    )
  ORDER BY s.full_name;
$function$;
REVOKE ALL ON FUNCTION public.get_school_student_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_school_student_directory() TO authenticated;

-- Database invariant: a student's live current position cannot silently move
-- backwards against the configured memorization direction.
CREATE OR REPLACE FUNCTION public.validate_student_quran_journey()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
declare v_start integer; v_current integer;
begin
  if new.start_surah is null or new.start_ayah is null or new.current_surah is null or new.current_ayah is null or new.memorization_direction is null then return new; end if;
  select global_ayah into v_start from public.quran_verses where surah=new.start_surah and ayah=new.start_ayah;
  select global_ayah into v_current from public.quran_verses where surah=new.current_surah and ayah=new.current_ayah;
  if v_start is null then raise exception 'Invalid Quran start position: Surah %, Ayah %',new.start_surah,new.start_ayah; end if;
  if v_current is null then raise exception 'Invalid Quran current position: Surah %, Ayah %',new.current_surah,new.current_ayah; end if;
  if new.memorization_direction='baqarah_to_nas' and v_current<v_start then raise exception 'Current Quran position cannot be before the student start position for Baqarah-to-Nas.'; end if;
  if new.memorization_direction='nas_to_baqarah' and v_current>v_start then raise exception 'Current Quran position cannot be after the student start position for Nas-to-Baqarah.'; end if;
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS trg_validate_student_quran_journey ON public.students;
CREATE TRIGGER trg_validate_student_quran_journey
BEFORE INSERT OR UPDATE OF memorization_direction,start_surah,start_ayah,current_surah,current_ayah
ON public.students FOR EACH ROW EXECUTE FUNCTION public.validate_student_quran_journey();

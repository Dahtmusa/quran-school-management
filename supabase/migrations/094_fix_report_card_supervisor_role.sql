-- Migration 094: Fix report-card School Supervisor lookup.
-- The school uses the profile job_title "School Supervisor" rather than
-- role = "principal". Keep the real name even when no signature image exists.

CREATE OR REPLACE FUNCTION public.load_signatures_for_report_cards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teachers   jsonb;
  v_supervisor jsonb;
  v_director   jsonb;
BEGIN
  -- Best teacher per class: prefer a signature, then primary assignment, then newest assignment.
  SELECT COALESCE(jsonb_object_agg(class_id::text, sig), '{}'::jsonb)
    INTO v_teachers
    FROM (
      SELECT DISTINCT ON (ct.class_id)
        ct.class_id,
        jsonb_build_object(
          'signer_name',    p.full_name,
          'signature_data', p.signature_data
        ) AS sig
      FROM class_teachers ct
      JOIN profiles p ON p.id = ct.teacher_id
      WHERE p.employment_status = 'active'
      ORDER BY ct.class_id,
               (p.signature_data IS NOT NULL) DESC,
               ct.is_primary DESC,
               ct.assigned_at DESC
    ) t;

  -- School Supervisor: prefer the actual configured job title.
  -- Keep principal as a backwards-compatible fallback for older installations.
  SELECT jsonb_build_object(
    'signer_name',    p.full_name,
    'signature_data', p.signature_data
  )
    INTO v_supervisor
    FROM profiles p
   WHERE p.employment_status = 'active'
     AND (
       lower(trim(coalesce(p.job_title, ''))) = 'school supervisor'
       OR p.role::text = 'principal'
     )
   ORDER BY
     CASE WHEN lower(trim(coalesce(p.job_title, ''))) = 'school supervisor' THEN 0 ELSE 1 END,
     (p.signature_data IS NOT NULL) DESC,
     p.updated_at DESC NULLS LAST,
     p.full_name
   LIMIT 1;

  -- School Director: prefer active super_admin, then admin; prefer a real signature.
  SELECT jsonb_build_object(
    'signer_name',    p.full_name,
    'signature_data', p.signature_data
  )
    INTO v_director
    FROM profiles p
   WHERE p.employment_status = 'active'
     AND p.role::text IN ('super_admin', 'admin')
   ORDER BY
     CASE WHEN p.role::text = 'super_admin' THEN 0 ELSE 1 END,
     (p.signature_data IS NOT NULL) DESC,
     p.updated_at DESC NULLS LAST,
     p.full_name
   LIMIT 1;

  RETURN jsonb_build_object(
    'teachers',   COALESCE(v_teachers, '{}'::jsonb),
    'supervisor', v_supervisor,
    'director',   v_director
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.load_signatures_for_report_cards() TO authenticated;
NOTIFY pgrst, 'reload schema';

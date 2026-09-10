-- Migration 094: Resolve report-card School Supervisor by job title.
-- The active School Supervisor is an admin profile with job_title = 'School Supervisor',
-- not a profile with role = 'principal'. Keep signature data optional; always return the name.

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
  SELECT COALESCE(jsonb_object_agg(class_id::text, sig), '{}'::jsonb)
    INTO v_teachers
    FROM (
      SELECT DISTINCT ON (ct.class_id)
        ct.class_id,
        jsonb_build_object(
          'signer_name', p.full_name,
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

  -- Prefer the configured job title. Keep principal as a compatibility fallback
  -- for installations that still use that role.
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_supervisor
    FROM profiles p
   WHERE p.employment_status = 'active'
     AND (
       lower(trim(coalesce(p.job_title, ''))) = 'school supervisor'
       OR p.role::text = 'principal'
     )
   ORDER BY
     (lower(trim(coalesce(p.job_title, ''))) = 'school supervisor') DESC,
     (p.signature_data IS NOT NULL) DESC,
     p.full_name
   LIMIT 1;

  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_director
    FROM profiles p
   WHERE p.role IN ('super_admin', 'admin')
     AND p.employment_status = 'active'
   ORDER BY (p.role = 'super_admin') DESC,
            (p.signature_data IS NOT NULL) DESC,
            p.full_name
   LIMIT 1;

  RETURN jsonb_build_object(
    'teachers', COALESCE(v_teachers, '{}'::jsonb),
    'supervisor', v_supervisor,
    'director', v_director
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.load_signatures_for_report_cards() TO authenticated;
NOTIFY pgrst, 'reload schema';

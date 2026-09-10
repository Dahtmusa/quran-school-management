-- Migration 093: Fix load_signatures_for_report_cards to return staff names even without uploaded signatures
-- Root cause: previous version filtered AND p.signature_data IS NOT NULL, causing class teacher
-- and supervisor to appear blank on report cards when they had not yet uploaded a signature image.
-- Now all active staff are always returned (signature_data may be null); name always appears.

CREATE OR REPLACE FUNCTION public.load_signatures_for_report_cards()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_teachers   jsonb;
  v_supervisor jsonb;
  v_director   jsonb;
BEGIN
  -- Best teacher per class: prefer those with a signature, then primary, then most recent
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

  -- Supervisor = active principal; prefer one with a signature
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_supervisor
    FROM profiles p
   WHERE p.role = 'principal'
     AND p.employment_status = 'active'
   ORDER BY (p.signature_data IS NOT NULL) DESC, p.full_name
   LIMIT 1;

  -- Director = super_admin preferred, then admin; prefer one with a signature
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_director
    FROM profiles p
   WHERE p.role IN ('super_admin', 'admin')
     AND p.employment_status = 'active'
   ORDER BY (p.role = 'super_admin') DESC, (p.signature_data IS NOT NULL) DESC, p.full_name
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

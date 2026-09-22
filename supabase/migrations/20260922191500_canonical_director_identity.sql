-- AMQM: make the configured Leadership Director the single source of truth for director identity.
-- The public leadership profile is authoritative for who is School Director.
DO $$
DECLARE
  v_director_name text;
BEGIN
  SELECT trim(full_name)
    INTO v_director_name
    FROM public.public_team_profiles
   WHERE lower(trim(coalesce(role_title,''))) = 'director'
     AND lower(trim(coalesce(category,''))) = 'leadership'
     AND coalesce(published,true) = true
   ORDER BY display_on_homepage DESC, sort_order, full_name
   LIMIT 1;

  IF v_director_name IS NOT NULL THEN
    UPDATE public.profiles p
       SET full_name = v_director_name,
           job_title = 'School Director',
           department = COALESCE(NULLIF(trim(p.department),''),'Leadership')
     WHERE p.employment_status = 'active'
       AND lower(trim(p.full_name)) = lower(v_director_name);

    -- Remove the misleading director title from any other active account.
    UPDATE public.profiles p
       SET job_title = NULL
     WHERE p.employment_status = 'active'
       AND lower(trim(coalesce(p.job_title,''))) = 'school director'
       AND lower(trim(p.full_name)) <> lower(v_director_name);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.load_signatures_for_report_cards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teachers jsonb;
  v_supervisor jsonb;
  v_director jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(class_id::text, sig), '{}'::jsonb)
    INTO v_teachers
    FROM (
      SELECT DISTINCT ON (ct.class_id)
        ct.class_id,
        jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data) AS sig
      FROM class_teachers ct
      JOIN profiles p ON p.id = ct.teacher_id
      WHERE p.employment_status = 'active'
      ORDER BY ct.class_id, (p.signature_data IS NOT NULL) DESC, ct.is_primary DESC, ct.assigned_at DESC
    ) t;

  -- Supervisor: prefer the explicitly configured leadership profile.
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_supervisor
    FROM public_team_profiles tp
    JOIN profiles p
      ON lower(trim(p.full_name)) = lower(trim(tp.full_name))
     AND p.employment_status = 'active'
   WHERE lower(trim(coalesce(tp.role_title,''))) = 'school supervisor'
     AND lower(trim(coalesce(tp.category,''))) = 'leadership'
     AND coalesce(tp.published,true) = true
   ORDER BY tp.display_on_homepage DESC, tp.sort_order, p.full_name
   LIMIT 1;

  IF v_supervisor IS NULL THEN
    SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
      INTO v_supervisor
      FROM profiles p
     WHERE p.employment_status = 'active'
       AND lower(trim(coalesce(p.job_title,''))) = 'school supervisor'
     ORDER BY (p.signature_data IS NOT NULL) DESC, p.full_name
     LIMIT 1;
  END IF;

  -- Director: ONLY the explicitly configured leadership Director.
  -- Do not infer director from admin/super_admin status.
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_director
    FROM public_team_profiles tp
    JOIN profiles p
      ON lower(trim(p.full_name)) = lower(trim(tp.full_name))
     AND p.employment_status = 'active'
   WHERE lower(trim(coalesce(tp.role_title,''))) = 'director'
     AND lower(trim(coalesce(tp.category,''))) = 'leadership'
     AND coalesce(tp.published,true) = true
   ORDER BY tp.display_on_homepage DESC, tp.sort_order, p.full_name
   LIMIT 1;

  IF v_director IS NULL THEN
    SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
      INTO v_director
      FROM profiles p
     WHERE p.employment_status = 'active'
       AND lower(trim(coalesce(p.job_title,''))) = 'school director'
     ORDER BY (p.signature_data IS NOT NULL) DESC, p.full_name
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'teachers', COALESCE(v_teachers, '{}'::jsonb),
    'supervisor', v_supervisor,
    'director', v_director
  );
END;
$function$;

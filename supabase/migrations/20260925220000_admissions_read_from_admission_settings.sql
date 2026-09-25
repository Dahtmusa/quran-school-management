-- submit_admission_application still reads the old admission_portal key
-- (the manual on/off toggle we retired) so the RPC was refusing every
-- submission with "Admissions are currently closed", even after admin had
-- set opening_date/closing_date in the new admission_settings blob.
--
-- Rewrite the function to read the current admission_settings blob for
-- open/close dates and the admission fee, with a graceful fallback to the
-- legacy admission_portal key so existing installations keep working.

CREATE OR REPLACE FUNCTION public.submit_admission_application(
  p_applicant_name text, p_date_of_birth date, p_gender text,
  p_parent_name text, p_parent_phone text,
  p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_guardian_relationship text,
  p_address text, p_state text, p_lga text,
  p_requested_section public.section_type,
  p_requested_program_year public.program_year,
  p_previous_school text, p_quran_level text,
  p_starting_surah smallint, p_starting_ayah smallint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings jsonb;
  legacy   jsonb;
  payment  jsonb;
  app_no   text;
  rec      public.admissions;
  v_opening date;
  v_closing date;
  v_fee     numeric := 5000;
BEGIN
  settings := coalesce((SELECT value FROM public.site_settings WHERE key = 'admission_settings'), '{}'::jsonb);
  legacy   := coalesce((SELECT value FROM public.site_settings WHERE key = 'admission_portal'),   '{}'::jsonb);

  -- Prefer admission_settings.opening_date/closing_date; fall back to the
  -- legacy admission_portal key so pre-migration deployments still work.
  BEGIN v_opening := nullif(settings->>'opening_date','')::date; EXCEPTION WHEN others THEN v_opening := NULL; END;
  BEGIN v_closing := nullif(settings->>'closing_date','')::date; EXCEPTION WHEN others THEN v_closing := NULL; END;
  IF v_opening IS NULL THEN BEGIN v_opening := nullif(legacy->>'opening_date','')::date; EXCEPTION WHEN others THEN v_opening := NULL; END; END IF;
  IF v_closing IS NULL THEN BEGIN v_closing := nullif(legacy->>'closing_date','')::date; EXCEPTION WHEN others THEN v_closing := NULL; END; END IF;

  IF v_opening IS NULL THEN
    RAISE EXCEPTION 'Admissions are not yet scheduled. Ask the school for the opening date.';
  END IF;
  IF current_date < v_opening THEN
    RAISE EXCEPTION 'Admissions open on %', v_opening;
  END IF;
  IF v_closing IS NOT NULL AND current_date > v_closing THEN
    RAISE EXCEPTION 'Admissions closed on %', v_closing;
  END IF;

  BEGIN v_fee := nullif(settings->>'admission_fee_ngn','')::numeric; EXCEPTION WHEN others THEN v_fee := NULL; END;
  v_fee := coalesce(v_fee, 5000);

  app_no := 'AMQM/APP/' || extract(year FROM current_date)::int || '/'
          || lpad(public.next_school_number('application', extract(year FROM current_date)::int)::text, 4, '0');

  INSERT INTO public.admissions(
    application_no, applicant_name, date_of_birth, gender,
    parent_name, parent_phone,
    guardian_name, guardian_phone, guardian_email, guardian_relationship,
    address, state, lga,
    requested_section, requested_program_year,
    previous_school, quran_level, starting_surah, starting_ayah,
    application_fee, payment_status, status
  ) VALUES (
    app_no, trim(p_applicant_name), p_date_of_birth, p_gender,
    trim(p_parent_name), p_parent_phone,
    trim(coalesce(p_guardian_name, p_parent_name)),
    coalesce(p_guardian_phone, p_parent_phone),
    p_guardian_email, p_guardian_relationship,
    p_address, p_state, p_lga,
    p_requested_section, p_requested_program_year,
    p_previous_school, p_quran_level, p_starting_surah, p_starting_ayah,
    v_fee, 'pending', 'submitted'
  ) RETURNING * INTO rec;

  payment := coalesce((SELECT value FROM public.site_settings WHERE key = 'school_payment'), '{}'::jsonb);

  RETURN jsonb_build_object(
    'application_no', rec.application_no,
    'application_fee', v_fee,
    'payment', payment,
    'status', rec.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_admission_application(
  text, date, text, text, text, text, text, text, text,
  text, text, text, public.section_type, public.program_year,
  text, text, smallint, smallint
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Admissions Phase 1.5 -- simpler applicant flow.
--
-- Adds two columns the public application form now writes to:
--   * photo_url         -- applicant passport photo (data URL or public URL).
--   * state_of_origin   -- separate from state of residence.
--
-- Adds one SECURITY DEFINER RPC that the public tracker page calls so an
-- applicant can look up their own status with just their application
-- number + phone number, without exposing the full admissions table via
-- RLS. Returns only the fields the applicant needs to see; never returns
-- another applicant's row and never leaks staff notes / scores.

ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS state_of_origin text;

CREATE OR REPLACE FUNCTION public.track_admission_application(
  p_application_no text,
  p_phone          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.admissions;
  v_normalised_phone text;
  v_app_phone text;
BEGIN
  IF trim(coalesce(p_application_no, '')) = '' OR trim(coalesce(p_phone, '')) = '' THEN
    RETURN jsonb_build_object('error', 'Application number and phone number are required.');
  END IF;

  SELECT * INTO v_app FROM public.admissions
  WHERE upper(application_no) = upper(trim(p_application_no))
  LIMIT 1;

  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No application found with that reference.');
  END IF;

  -- Normalise phones by keeping only digits so parents can enter the
  -- number in any form (0803..., +234803..., 234803...).
  v_normalised_phone := regexp_replace(coalesce(p_phone, ''),        '[^0-9]', '', 'g');
  v_app_phone        := regexp_replace(coalesce(v_app.parent_phone, '') || coalesce(v_app.guardian_phone, ''),
                                        '[^0-9]', '', 'g');

  IF v_normalised_phone = '' OR position(right(v_normalised_phone, 10) IN v_app_phone) = 0 THEN
    RETURN jsonb_build_object('error', 'The phone number does not match this application.');
  END IF;

  RETURN jsonb_build_object(
    'application_no',        v_app.application_no,
    'applicant_name',        v_app.applicant_name,
    'photo_url',             v_app.photo_url,
    'parent_name',           v_app.parent_name,
    'state',                 v_app.state,
    'state_of_origin',       v_app.state_of_origin,
    'lga',                   v_app.lga,
    'requested_section',     v_app.requested_section,
    'created_at',            v_app.created_at,
    'application_fee',       v_app.application_fee,
    'payment_status',        v_app.payment_status,
    'payment_reference',     v_app.payment_reference,
    'screening_mode',        v_app.screening_mode,
    'screening_scheduled_at', v_app.screening_scheduled_at,
    'screening_token',       v_app.screening_token,
    'screening_outcome',     v_app.screening_outcome,
    'starting_surah',        v_app.starting_surah,
    'starting_ayah',         v_app.starting_ayah,
    'status',                v_app.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_admission_application(text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

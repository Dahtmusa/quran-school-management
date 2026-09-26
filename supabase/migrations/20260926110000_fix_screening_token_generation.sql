-- amqm_schedule_admission_screening used gen_random_bytes(24) to build the
-- virtual-screening token. That function lives in the pgcrypto extension
-- and Supabase does not enable it by default in the public schema search
-- path -- so every attempt to schedule a virtual screening was failing
-- with "function gen_random_bytes(integer) does not exist".
--
-- Rewrite to use gen_random_uuid(), which is available on every modern
-- Postgres install without a separate extension. We concatenate two
-- UUIDs' hex representations to keep the token length and entropy the
-- old code delivered (48 hex chars = 192 bits of entropy, well past
-- what any brute-force attack could hit on a short-lived screening
-- link). Behaviour is otherwise identical.

CREATE OR REPLACE FUNCTION public.amqm_schedule_admission_screening(
  p_application_id uuid,
  p_scheduled_at   timestamptz,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a     public.admissions;
  mode  text;
  token text;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','admissions') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO a FROM public.admissions WHERE id = p_application_id FOR UPDATE;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF a.payment_status <> 'verified' THEN
    RAISE EXCEPTION 'Verify the application payment before scheduling screening';
  END IF;

  mode  := CASE WHEN lower(trim(coalesce(a.state, ''))) = 'adamawa' THEN 'physical' ELSE 'virtual' END;
  token := a.screening_token;

  IF mode = 'virtual' AND token IS NULL THEN
    -- gen_random_bytes required pgcrypto; gen_random_uuid is built-in.
    -- Two UUIDs concatenated give us 48 hex chars = 192 bits of entropy.
    token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    token := substr(token, 1, 48);
  END IF;

  UPDATE public.admissions
  SET screening_mode        = mode,
      screening_scheduled_at = p_scheduled_at,
      screening_token       = token,
      screening_outcome     = NULL,
      screening_notes       = coalesce(p_notes, screening_notes),
      status                = 'screening_scheduled',
      reviewed_by           = auth.uid(),
      reviewed_at           = now()
  WHERE id = a.id;

  RETURN jsonb_build_object(
    'application_id',   a.id,
    'application_no',   a.application_no,
    'screening_mode',   mode,
    'scheduled_at',     p_scheduled_at,
    'screening_token',  token,
    'portal_path',      CASE WHEN mode = 'virtual' THEN '/admissions/screening/' || token ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.amqm_schedule_admission_screening(uuid, timestamptz, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

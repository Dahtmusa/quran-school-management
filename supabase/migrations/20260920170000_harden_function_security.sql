-- Harden function execution without changing authenticated application behavior.
-- 1) Pin the search_path on the public trigger/helper functions flagged by
--    the Supabase advisor. They use public-schema objects, so this is behavior-neutral.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
      ))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.signature);
  END LOOP;
END $$;

-- 2) SECURITY DEFINER functions are privileged database entry points. Keep only
-- the intentionally public endpoints callable by anon. For every other
-- SECURITY DEFINER function, preserve its existing authenticated privilege
-- exactly, while removing the implicit PUBLIC/anon exposure.
DO $$
DECLARE
  r record;
  keep_public boolean;
BEGIN
  FOR r IN
    SELECT
      p.oid::regprocedure::text AS signature,
      p.proname,
      has_function_privilege('authenticated', p.oid, 'execute') AS had_authenticated
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    keep_public := r.proname IN (
      'submit_admission_application',
      'check_login_lookup_rate_limit',
      'get_auth_email_by_preferred_email',
      'get_email_by_username',
      'amqm_get_admission_screening'
    );

    IF NOT keep_public THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.signature);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.signature);

      IF r.had_authenticated THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Preserve the explicit public admission, login, and virtual screening endpoints.
GRANT EXECUTE ON FUNCTION public.submit_admission_application(
  text,date,text,text,text,text,text,text,text,text,text,text,section_type,program_year,text,text,smallint,smallint
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_login_lookup_rate_limit(text,text,integer,interval)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_email_by_preferred_email(text)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.amqm_get_admission_screening(text)
  TO anon, authenticated;

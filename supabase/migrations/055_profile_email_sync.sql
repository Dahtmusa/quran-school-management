-- Migration 055: Add email column to profiles, synced from auth.users.
-- Teachers and staff can log in with either their email address or their
-- admin-assigned username. This column stores the denormalized email so
-- it is visible in admin profile modals without needing a separate auth query.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill existing profiles
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- Keep email in sync whenever auth.users is created or updated
CREATE OR REPLACE FUNCTION public.sync_profile_email()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

NOTIFY pgrst, 'reload schema';

-- Backfill: src/app/auth/login/page.tsx calls supabase.rpc('get_email_by_username', ...)
-- for both staff and teacher username login, but no definition for this
-- function existed anywhere in supabase/migrations/ — it was created directly
-- against the database outside of version control, so its access rules could
-- not be reviewed from source. This defines it explicitly, scoped the same
-- way as the equivalent supabase/functions/username-login edge function:
-- only staff-facing roles are resolvable by username (parents never log in
-- this way, so they are excluded to avoid turning this into a general
-- profile-email disclosure oracle).
--
-- If a differently-scoped version already exists in the live database, this
-- CREATE OR REPLACE intentionally narrows it to the documented, auditable
-- behavior below.
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
    and p.role in ('teacher','admin','super_admin','principal','finance','admissions','security')
  limit 1;
$$;

revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, authenticated;

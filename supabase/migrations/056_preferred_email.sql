-- Add preferred_email to profiles so admins can set an alternative login email
alter table public.profiles
  add column if not exists preferred_email text;

create index if not exists profiles_preferred_email_idx
  on public.profiles (lower(preferred_email));

-- Given a preferred email, return the real auth email for that user
-- Used by the login page to support preferred-email login
create or replace function public.get_auth_email_by_preferred_email(p_preferred_email text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.preferred_email) = lower(p_preferred_email)
  limit 1;
$$;

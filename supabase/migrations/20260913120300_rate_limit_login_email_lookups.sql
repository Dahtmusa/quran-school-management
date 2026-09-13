-- get_auth_email_by_preferred_email and get_email_by_username are both
-- callable pre-login (anon) and return a real internal login email for any
-- guessed username/preferred_email, with no limit on call volume — an
-- unauthenticated email-enumeration oracle. Add a small shared rate-limit
-- table and enforce it inside both functions.
create table if not exists public.login_lookup_attempts (
  id bigserial primary key,
  scope text not null,
  lookup_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_lookup_attempts_scope_key_time_idx
  on public.login_lookup_attempts (scope, lookup_key, attempted_at desc);

alter table public.login_lookup_attempts enable row level security;
-- No policies defined: RLS defaults to deny-all for anon/authenticated.
-- Only SECURITY DEFINER functions owned by a privileged role touch this table.

revoke all on public.login_lookup_attempts from anon, authenticated;
-- No direct grants needed for anon/authenticated: all reads/writes happen
-- inside the SECURITY DEFINER function below, which runs with the owning
-- role's privileges on objects it owns.

create or replace function public.check_login_lookup_rate_limit(p_scope text, p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.login_lookup_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_count
  from public.login_lookup_attempts
  where scope = p_scope and lookup_key = p_key and attempted_at >= now() - p_window;

  insert into public.login_lookup_attempts(scope, lookup_key) values (p_scope, p_key);

  return v_count < p_max;
end;
$$;

revoke all on function public.check_login_lookup_rate_limit(text,text,integer,interval) from public;
grant execute on function public.check_login_lookup_rate_limit(text,text,integer,interval) to anon, authenticated;

create or replace function public.get_auth_email_by_preferred_email(p_preferred_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_login_lookup_rate_limit('preferred_email', lower(coalesce(p_preferred_email,'')), 10, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  return (
    select u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(p.preferred_email) = lower(p_preferred_email)
    limit 1
  );
end;
$$;

create or replace function public.get_email_by_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_login_lookup_rate_limit('username', lower(trim(coalesce(p_username,''))), 10, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  return (
    select u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(p.username) = lower(trim(p_username))
      and p.role in ('teacher','admin','super_admin','principal','finance','admissions','security')
    limit 1
  );
end;
$$;

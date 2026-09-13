-- Rate limiting for the parent-login edge function. Without this, the
-- phone+admission_no verification in supabase/functions/parent-login has no
-- limit on attempt volume, making the last-8-digits phone match brute-forceable
-- at serverless scale. Only the service_role (used exclusively by the edge
-- function) can read/write this table.
create table if not exists public.parent_login_attempts (
  id bigserial primary key,
  phone text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists parent_login_attempts_phone_time_idx
  on public.parent_login_attempts (phone, attempted_at desc);

alter table public.parent_login_attempts enable row level security;
-- No policies are defined: RLS defaults to deny-all for anon/authenticated.
-- The edge function uses the service_role client, which bypasses RLS.

revoke all on public.parent_login_attempts from anon, authenticated;
grant all on public.parent_login_attempts to service_role;
grant usage, select on sequence public.parent_login_attempts_id_seq to service_role;

-- Periodically prune old rows so the table doesn't grow unbounded.
create or replace function public.prune_parent_login_attempts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.parent_login_attempts where attempted_at < now() - interval '1 day';
$$;

revoke all on function public.prune_parent_login_attempts() from public;
grant execute on function public.prune_parent_login_attempts() to service_role;

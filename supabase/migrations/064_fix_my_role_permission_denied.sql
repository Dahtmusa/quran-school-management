-- Migration 064: Fix "permission denied for function my_role" in RLS policies.
--
-- Migration 020 revoked EXECUTE on my_role() from anon, authenticated.
-- However, RLS policies on several tables (academic_cycle_settings, parent_students,
-- profiles, etc.) still call public.my_role() directly in their USING clauses.
-- PostgreSQL evaluates ALL applicable policies per operation; if any policy
-- raises an error (not just returns false), the entire query fails — even when
-- a separate permissive policy (e.g. "using(true)") would have allowed the row.
-- Result: authenticated users get "permission denied for function my_role"
-- on get_current_academic_term(), set_current_academic_term(), and others.
--
-- Fix: recreate my_role() as SECURITY DEFINER so it reads profiles bypassing
-- RLS (preventing the recursion chain), then re-grant EXECUTE to authenticated
-- so that RLS policy expressions can invoke it.
-- Safety: the function always derives the role from auth.uid() (the JWT claim),
-- never from the postgres/owner context — so it always returns the calling
-- user's own role, regardless of who the SQL security context is.

CREATE OR REPLACE FUNCTION public.my_role()
  RETURNS public.user_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated;

NOTIFY pgrst, 'reload schema';

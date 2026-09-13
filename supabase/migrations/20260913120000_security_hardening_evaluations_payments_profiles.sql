-- Security hardening pass (2026-09-13):
--
-- 1. Teachers could self-approve their own evaluations. The "authorized
--    evaluation updates" WITH CHECK clause let a teacher flip status to
--    'approved' directly, because the CHECK only verified teacher_id, not
--    status, on the teacher branch (the USING clause correctly restricted
--    which rows could be targeted, but WITH CHECK governs the row *after*
--    the write).
--
-- 2. Payments could be permanently hard-deleted, bypassing the immutable
--    void workflow introduced in migration 101: a raw DELETE policy on
--    public.payments was never revoked, and an old single-argument
--    admin_void_payment(uuid) overload (which hard-deletes) was never
--    dropped after the two-argument soft-void version was introduced.
--    Postgres resolves an ambiguous overloaded call in favour of the
--    candidate needing fewer defaulted arguments, so the app's existing
--    one-argument RPC call was silently hitting the hard-delete function.
--
-- 3. The "public read active teachers" policy exposed every column of
--    public.profiles (phone, personal email, preferred_email, username,
--    staff_id, scan_code) to anon, not just the public-safe directory
--    fields it was meant to expose.

-- ── 1. Evaluations: teachers may only write back to non-approved states ────
DROP POLICY IF EXISTS "authorized evaluation updates" ON public.evaluations;
CREATE POLICY "authorized evaluation updates" ON public.evaluations FOR UPDATE TO authenticated
USING (
  (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]))
  OR ((teacher_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['draft'::evaluation_status,'returned'::evaluation_status])))
)
WITH CHECK (
  (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]))
  OR (
    (teacher_id = (SELECT auth.uid()))
    AND (status = ANY (ARRAY['draft'::evaluation_status,'returned'::evaluation_status,'pending_approval'::evaluation_status]))
  )
);

-- ── 2. Payments: remove the raw DELETE escape hatch and the hard-delete overload ──
DROP POLICY IF EXISTS "finance admins delete payments" ON public.payments;

-- admin_void_payment(uuid) is the pre-101 hard-delete overload. Dropping it
-- leaves only admin_void_payment(uuid, text) — the audited soft-void version
-- — as a resolvable candidate for the app's existing call site.
DROP FUNCTION IF EXISTS public.admin_void_payment(uuid);

-- ── 3. Profiles: scope the public teacher directory to safe columns only ──
DROP POLICY IF EXISTS "public read active teachers" ON public.profiles;

-- security_invoker = false (the default) is required here: the view must run
-- with the view owner's row-security context (the migration role, which has
-- BYPASSRLS) so it can read public.profiles even though anon/authenticated
-- no longer have a row-level policy granting them direct access to that
-- table. The view's own column list and WHERE clause are what keep this
-- safe — only the public-facing directory fields are exposed. The filter
-- matches the previous policy exactly (active teachers) so the public
-- teacher directory and profile pages keep showing the same people.
CREATE OR REPLACE VIEW public.public_teacher_directory
WITH (security_invoker = false) AS
SELECT id, full_name, job_title, department, bio, qualifications,
       experience, subjects, avatar_url
FROM public.profiles
WHERE role = 'teacher' AND employment_status = 'active';

GRANT SELECT ON public.public_teacher_directory TO anon, authenticated;

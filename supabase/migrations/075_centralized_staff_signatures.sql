-- Migration 075: Centralized profile-based staff signature system
-- Replaces the fragmented report_card_signatures / term_signatures approach
-- with a single signature_data column on the profiles table.
-- Every staff member owns their own signature; role determines where it is used.

-- ── 1. Remove old signature tables and functions ──────────────────────────────
DROP TABLE IF EXISTS public.report_card_signatures CASCADE;
DROP TABLE IF EXISTS public.term_signatures CASCADE;
DROP FUNCTION IF EXISTS public.save_report_card_signature(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.load_report_card_signatures();
DROP FUNCTION IF EXISTS public.save_term_signature(uuid, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.load_term_signatures(uuid);

-- ── 2. Add signature columns to profiles ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS signature_updated_at timestamptz;

-- ── 3. Signature audit log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signature_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  staff_name    text,
  action        text NOT NULL CHECK (action IN ('added','updated','removed')),
  performed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name text,
  performed_at  timestamptz NOT NULL DEFAULT now(),
  notes         text
);

ALTER TABLE public.signature_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read signature audit" ON public.signature_audit_log
  FOR SELECT TO authenticated
  USING (public.my_role() IN ('super_admin','admin','principal'));

CREATE POLICY "authenticated insert signature audit" ON public.signature_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── 4. RPC: staff member saves their own signature ────────────────────────────
CREATE OR REPLACE FUNCTION public.save_my_signature(p_signature_data text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_had  boolean;
  v_name text;
BEGIN
  SELECT (signature_data IS NOT NULL), full_name
    INTO v_had, v_name
    FROM profiles WHERE id = auth.uid();

  UPDATE profiles
     SET signature_data       = p_signature_data,
         signature_updated_at = now()
   WHERE id = auth.uid();

  INSERT INTO signature_audit_log
        (staff_id, staff_name, action, performed_by, performed_by_name)
  VALUES (auth.uid(), v_name,
          CASE WHEN v_had THEN 'updated' ELSE 'added' END,
          auth.uid(), v_name);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_my_signature(text) TO authenticated;

-- ── 5. RPC: staff member reads their own signature ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_signature()
RETURNS TABLE(signature_data text, signature_updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT signature_data, signature_updated_at
    FROM profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_signature() TO authenticated;

-- ── 6. RPC: admin clears a staff signature ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_clear_staff_signature(p_staff_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_name text;
  v_staff_name text;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT full_name INTO v_admin_name FROM profiles WHERE id = auth.uid();
  SELECT full_name INTO v_staff_name FROM profiles WHERE id = p_staff_id;

  UPDATE profiles
     SET signature_data = NULL, signature_updated_at = NULL
   WHERE id = p_staff_id;

  INSERT INTO signature_audit_log
        (staff_id, staff_name, action, performed_by, performed_by_name, notes)
  VALUES (p_staff_id, v_staff_name, 'removed',
          auth.uid(), v_admin_name, 'Cleared by administrator');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_clear_staff_signature(uuid) TO authenticated;

-- ── 7. RPC: admin views all staff signature statuses ─────────────────────────
CREATE OR REPLACE FUNCTION public.load_staff_signatures_admin()
RETURNS TABLE(
  staff_id             uuid,
  full_name            text,
  role                 text,
  job_title            text,
  department           text,
  staff_id_no          text,
  has_signature        boolean,
  signature_data       text,
  signature_updated_at timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.full_name,
    p.role::text,
    p.job_title,
    p.department,
    p.staff_id,
    (p.signature_data IS NOT NULL),
    p.signature_data,
    p.signature_updated_at
  FROM profiles p
  WHERE p.role IN ('teacher','principal','admin','super_admin','finance','admissions','security')
    AND p.employment_status = 'active'
  ORDER BY
    CASE p.role::text
      WHEN 'super_admin' THEN 1
      WHEN 'admin'       THEN 2
      WHEN 'principal'   THEN 3
      WHEN 'teacher'     THEN 4
      ELSE 5
    END,
    p.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.load_staff_signatures_admin() TO authenticated;

-- ── 8. RPC: load all signatures needed for report card printing ───────────────
-- Returns a single jsonb object:
--   { teachers: { "<class_id>": {signer_name, signature_data} },
--     supervisor: {signer_name, signature_data} | null,
--     director:   {signer_name, signature_data} | null }
CREATE OR REPLACE FUNCTION public.load_signatures_for_report_cards()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_teachers   jsonb;
  v_supervisor jsonb;
  v_director   jsonb;
BEGIN
  -- Best teacher per class: prefer primary, then any teacher with a signature
  SELECT COALESCE(jsonb_object_agg(class_id::text, sig), '{}'::jsonb)
    INTO v_teachers
    FROM (
      SELECT DISTINCT ON (ct.class_id)
        ct.class_id,
        jsonb_build_object(
          'signer_name',    p.full_name,
          'signature_data', p.signature_data
        ) AS sig
      FROM class_teachers ct
      JOIN profiles p ON p.id = ct.teacher_id
      WHERE p.signature_data IS NOT NULL
        AND p.employment_status = 'active'
      ORDER BY ct.class_id, ct.is_primary DESC, ct.assigned_at DESC
    ) t;

  -- Supervisor = any active principal with a signature
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_supervisor
    FROM profiles p
   WHERE p.role = 'principal'
     AND p.signature_data IS NOT NULL
     AND p.employment_status = 'active'
   LIMIT 1;

  -- Director = super_admin preferred, then admin
  SELECT jsonb_build_object('signer_name', p.full_name, 'signature_data', p.signature_data)
    INTO v_director
    FROM profiles p
   WHERE p.role IN ('super_admin','admin')
     AND p.signature_data IS NOT NULL
     AND p.employment_status = 'active'
   ORDER BY (p.role = 'super_admin') DESC, p.full_name
   LIMIT 1;

  RETURN jsonb_build_object(
    'teachers',   COALESCE(v_teachers, '{}'::jsonb),
    'supervisor', v_supervisor,
    'director',   v_director
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.load_signatures_for_report_cards() TO authenticated;

NOTIFY pgrst, 'reload schema';

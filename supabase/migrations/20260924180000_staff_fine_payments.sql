-- Milestone B: staff fine payments + "my fines" dashboard.
-- - New setting `school_payment_account` shown to staff so they know where
--   to send money.
-- - `staff_fine_payments` records each payment (partial or full). The
--   running balance = SUM(derived fines from attendance_records) - SUM(payments).
-- - `my_attendance_fines()` returns the caller's own occurrences, payments
--   and totals, so teachers see just their own row.
-- - `admin_staff_fines_detail(p_staff_id)` is the admin drill-down.
-- - `admin_record_staff_fine_payment(...)` writes a payment.

INSERT INTO public.attendance_settings(key, value, description) VALUES
 ('school_payment_account', to_jsonb(
    E'Bank: <bank name>\nAccount Number: <account number>\nAccount Name: Aliyu & Maimuna Center for Qur’anic Memorization\nRef: use your Staff ID as narration/reference'::text),
  'School payment account details shown to staff on their fines dashboard.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.staff_fine_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_ngn   numeric NOT NULL CHECK (amount_ngn > 0),
  paid_on      date NOT NULL DEFAULT current_date,
  method       text,          -- e.g. transfer, cash, POS
  note         text,
  recorded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_fine_payments_staff_idx
  ON public.staff_fine_payments(staff_id, paid_on DESC);

ALTER TABLE public.staff_fine_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff reads own payments" ON public.staff_fine_payments;
CREATE POLICY "staff reads own payments" ON public.staff_fine_payments
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR public.my_role() IN ('admin','super_admin','principal','finance'));
DROP POLICY IF EXISTS "admin writes payments" ON public.staff_fine_payments;
CREATE POLICY "admin writes payments" ON public.staff_fine_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('admin','super_admin','principal','finance'));
DROP POLICY IF EXISTS "admin deletes payments" ON public.staff_fine_payments;
CREATE POLICY "admin deletes payments" ON public.staff_fine_payments
  FOR DELETE TO authenticated
  USING (public.my_role() IN ('admin','super_admin','principal'));

-- Helper: rebuild a staff member's fines + payments + totals.
CREATE OR REPLACE FUNCTION public._staff_fines_payload(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_late_ngn   numeric := 0;
  v_absent_ngn numeric := 0;
  v_account    text;
  v_profile    record;
  v_fines      jsonb;
  v_payments   jsonb;
  v_fines_total numeric := 0;
  v_payments_total numeric := 0;
BEGIN
  SELECT (value#>>'{}')::numeric INTO v_late_ngn
    FROM attendance_settings WHERE key = 'staff_late_fine_ngn';
  SELECT (value#>>'{}')::numeric INTO v_absent_ngn
    FROM attendance_settings WHERE key = 'staff_absent_fine_ngn';
  SELECT (value#>>'{}')::text INTO v_account
    FROM attendance_settings WHERE key = 'school_payment_account';
  v_late_ngn   := COALESCE(v_late_ngn, 0);
  v_absent_ngn := COALESCE(v_absent_ngn, 0);

  SELECT id, full_name, staff_id, job_title
    INTO v_profile
    FROM profiles WHERE id = p_staff_id;

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('error','not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.attendance_date DESC, f.scanned_at DESC), '[]'::jsonb)
    INTO v_fines
  FROM (
    SELECT ar.id,
           ar.attendance_date,
           ar.scanned_at,
           ar.status_code,
           CASE ar.status_code
             WHEN 'late'   THEN v_late_ngn
             WHEN 'absent' THEN v_absent_ngn
             ELSE 0
           END AS amount_ngn
    FROM attendance_records ar
    WHERE ar.person_id = p_staff_id
      AND ar.person_type = 'staff'
      AND ar.status_code IN ('late','absent')
  ) f;

  SELECT COALESCE(SUM(f.amount), 0) INTO v_fines_total
  FROM (
    SELECT CASE ar.status_code
             WHEN 'late'   THEN v_late_ngn
             WHEN 'absent' THEN v_absent_ngn
             ELSE 0
           END AS amount
    FROM attendance_records ar
    WHERE ar.person_id = p_staff_id
      AND ar.person_type = 'staff'
      AND ar.status_code IN ('late','absent')
  ) f;

  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.paid_on DESC, p.created_at DESC), '[]'::jsonb),
         COALESCE(SUM(p.amount_ngn), 0)
    INTO v_payments, v_payments_total
  FROM (
    SELECT sfp.id, sfp.amount_ngn, sfp.paid_on, sfp.method, sfp.note, sfp.created_at
    FROM staff_fine_payments sfp
    WHERE sfp.staff_id = p_staff_id
  ) p;

  RETURN jsonb_build_object(
    'staff', jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'staff_no', v_profile.staff_id,
      'job_title', v_profile.job_title
    ),
    'fines',    v_fines,
    'payments', v_payments,
    'totals',   jsonb_build_object(
      'fines_ngn',    v_fines_total,
      'payments_ngn', v_payments_total,
      'balance_ngn',  GREATEST(0, v_fines_total - v_payments_total),
      'late_ngn',     v_late_ngn,
      'absent_ngn',   v_absent_ngn
    ),
    'account',  COALESCE(v_account, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_attendance_fines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  RETURN public._staff_fines_payload(auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_attendance_fines() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_staff_fines_detail(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  RETURN public._staff_fines_payload(p_staff_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_staff_fines_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_staff_fine_payment(
  p_staff_id  uuid,
  p_amount    numeric,
  p_paid_on   date DEFAULT NULL,
  p_method    text DEFAULT NULL,
  p_note      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  INSERT INTO public.staff_fine_payments(staff_id, amount_ngn, paid_on, method, note, recorded_by)
  VALUES (p_staff_id, p_amount, COALESCE(p_paid_on, current_date), p_method, p_note, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_record_staff_fine_payment(uuid,numeric,date,text,text) TO authenticated;

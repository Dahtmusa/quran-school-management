-- Migration 086: Fix payment role check + add admin_void_payment
--
-- Fixes:
-- 1. admin_record_payment was blocking super_admin / principal / finance roles
-- 2. New admin_void_payment() function lets admin reverse a mistaken payment

-- ─── 1. Fix admin_record_payment role check ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_student_id  uuid,
  p_term_id     uuid,
  p_amount      numeric,
  p_method      text    DEFAULT 'Cash',
  p_reference   text    DEFAULT NULL,
  p_notes       text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id uuid;
  v_year_id    uuid;
  v_remaining  numeric;
  v_balance    numeric;
  v_applied    numeric;
  v_fee_id     uuid;
  v_amount_due numeric;
  v_amount_paid numeric;
BEGIN
  IF NOT (public.my_role() IN ('super_admin', 'admin', 'principal', 'finance')) THEN
    RAISE EXCEPTION 'Finance access required';
  END IF;

  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id = p_term_id;

  INSERT INTO public.payments(student_id, term_id, amount, method, reference, notes, recorded_by)
  VALUES (p_student_id, p_term_id, p_amount, p_method, p_reference, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  v_remaining := p_amount;
  FOR v_fee_id IN
    SELECT sf.id
    FROM   public.student_fees sf
    JOIN   public.fee_structures fs ON fs.id = sf.fee_structure_id
    WHERE  sf.student_id = p_student_id
      AND  (
        fs.term_id = p_term_id
        OR (fs.term_id IS NULL AND fs.academic_year_id = v_year_id)
      )
    ORDER BY sf.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    SELECT amount_due, amount_paid INTO v_amount_due, v_amount_paid
    FROM public.student_fees WHERE id = v_fee_id;
    v_balance := GREATEST(0, v_amount_due - v_amount_paid);
    v_applied := LEAST(v_balance, v_remaining);
    IF v_applied > 0 THEN
      UPDATE public.student_fees SET amount_paid = amount_paid + v_applied WHERE id = v_fee_id;
      v_remaining := v_remaining - v_applied;
    END IF;
  END LOOP;

  RETURN v_payment_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, text) TO authenticated;

-- ─── 2. admin_void_payment ────────────────────────────────────────────────────
-- Deletes a payment and recalculates student_fees.amount_paid from remaining
-- payments so balances stay correct after a reversal.

CREATE OR REPLACE FUNCTION public.admin_void_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id  uuid;
  v_term_id     uuid;
  v_year_id     uuid;
  v_remaining   numeric;
  v_balance     numeric;
  v_applied     numeric;
  v_fee_id      uuid;
  v_amount_due  numeric;
  v_amount_paid numeric;
  v_pay         RECORD;
BEGIN
  IF NOT (public.my_role() IN ('super_admin', 'admin', 'principal', 'finance')) THEN
    RAISE EXCEPTION 'Finance access required';
  END IF;

  SELECT student_id, term_id INTO v_student_id, v_term_id
  FROM public.payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id = v_term_id;

  -- Delete the payment first
  DELETE FROM public.payments WHERE id = p_payment_id;

  -- Reset amount_paid to 0 for all affected student_fees rows
  UPDATE public.student_fees sf
  SET    amount_paid = 0
  FROM   public.fee_structures fs
  WHERE  sf.fee_structure_id = fs.id
    AND  sf.student_id = v_student_id
    AND  (
      fs.term_id = v_term_id
      OR (fs.term_id IS NULL AND fs.academic_year_id = v_year_id)
    );

  -- Re-apply remaining payments for this student + term in chronological order
  FOR v_pay IN
    SELECT id, amount FROM public.payments
    WHERE  student_id = v_student_id AND term_id = v_term_id
    ORDER  BY paid_on ASC, id ASC
  LOOP
    v_remaining := v_pay.amount;
    FOR v_fee_id IN
      SELECT sf.id
      FROM   public.student_fees sf
      JOIN   public.fee_structures fs ON fs.id = sf.fee_structure_id
      WHERE  sf.student_id = v_student_id
        AND  (
          fs.term_id = v_term_id
          OR (fs.term_id IS NULL AND fs.academic_year_id = v_year_id)
        )
      ORDER BY sf.id
    LOOP
      EXIT WHEN v_remaining <= 0;
      SELECT amount_due, amount_paid INTO v_amount_due, v_amount_paid
      FROM public.student_fees WHERE id = v_fee_id;
      v_balance := GREATEST(0, v_amount_due - v_amount_paid);
      v_applied := LEAST(v_balance, v_remaining);
      IF v_applied > 0 THEN
        UPDATE public.student_fees SET amount_paid = amount_paid + v_applied WHERE id = v_fee_id;
        v_remaining := v_remaining - v_applied;
      END IF;
    END LOOP;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_void_payment(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_void_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- AMQM Finance: term carry-forward ledger
-- Previous-term balances are carried into the next term as an opening balance.
-- Historical fee rows are never duplicated or deleted.

CREATE TABLE IF NOT EXISTS public.student_fee_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  source_payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  remaining_amount numeric(12,2) NOT NULL CHECK (remaining_amount >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_payment_id)
);

ALTER TABLE public.student_fee_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance staff see fee credits" ON public.student_fee_credits;
CREATE POLICY "finance staff see fee credits" ON public.student_fee_credits FOR SELECT TO authenticated
USING (public.my_role() IN ('super_admin','admin','principal','finance'));

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id, student_fee_id)
);

CREATE INDEX IF NOT EXISTS student_fee_credits_student_idx ON public.student_fee_credits(student_id);

CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_fee_idx ON public.payment_allocations(student_fee_id);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance staff see payment allocations" ON public.payment_allocations;
CREATE POLICY "finance staff see payment allocations"
ON public.payment_allocations FOR SELECT TO authenticated
USING (public.my_role() IN ('super_admin','admin','principal','finance'));

-- Backfill allocations for existing term-aware payments. This records where historical
-- payments were applied without changing existing student_fees balances.
DO $$
DECLARE
  p RECORD;
  f RECORD;
  remaining numeric;
  available numeric;
  applied numeric;
BEGIN
  FOR p IN
    SELECT id, student_id, term_id, amount, paid_on
    FROM public.payments
    WHERE term_id IS NOT NULL
    ORDER BY paid_on ASC, id ASC
  LOOP
    remaining := COALESCE(p.amount,0);
    IF remaining <= 0 THEN CONTINUE; END IF;

    FOR f IN
      SELECT sf.id, sf.amount_due,
             COALESCE((SELECT SUM(pa.amount) FROM public.payment_allocations pa WHERE pa.student_fee_id = sf.id),0) AS allocated
      FROM public.student_fees sf
      JOIN public.fee_structures fs ON fs.id = sf.fee_structure_id
      WHERE sf.student_id = p.student_id
        AND (fs.term_id = p.term_id
             OR (fs.term_id IS NULL AND fs.academic_year_id = (SELECT academic_year_id FROM public.terms WHERE id=p.term_id)))
      ORDER BY sf.id
    LOOP
      EXIT WHEN remaining <= 0;
      available := GREATEST(0, f.amount_due - f.allocated);
      applied := LEAST(available, remaining);
      IF applied > 0 THEN
        INSERT INTO public.payment_allocations(payment_id, student_fee_id, amount)
        VALUES (p.id, f.id, applied)
        ON CONFLICT (payment_id, student_fee_id) DO NOTHING;
        remaining := remaining - applied;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Record a payment and allocate it oldest-outstanding-first across all fees up to
-- the selected term. The payment's term_id records when the money was received;
-- allocations determine which outstanding obligation it settles.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_student_id uuid,
  p_term_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'Cash',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id uuid;
  v_amount numeric := ROUND(COALESCE(p_amount,0),2);
  v_remaining numeric;
  v_available numeric;
  v_applied numeric;
  v_fee RECORD;
BEGIN
  IF NOT (public.my_role() IN ('super_admin','admin','principal','finance')) THEN
    RAISE EXCEPTION 'Finance access required';
  END IF;
  IF p_term_id IS NULL THEN RAISE EXCEPTION 'Term is required'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id=p_student_id) THEN RAISE EXCEPTION 'Student not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE id=p_term_id) THEN RAISE EXCEPTION 'Term not found'; END IF;

  INSERT INTO public.payments(student_id, term_id, amount, method, reference, notes, recorded_by)
  VALUES (p_student_id, p_term_id, v_amount, p_method, p_reference, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  v_remaining := v_amount;

  FOR v_fee IN
    SELECT sf.id, sf.amount_due,
           COALESCE((SELECT SUM(pa.amount) FROM public.payment_allocations pa WHERE pa.student_fee_id=sf.id),0) AS allocated,
           COALESCE(t.starts_on, ay.starts_on, DATE '1900-01-01') AS sort_date
    FROM public.student_fees sf
    JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    LEFT JOIN public.terms t ON t.id=fs.term_id
    LEFT JOIN public.academic_years ay ON ay.id=fs.academic_year_id
    WHERE sf.student_id=p_student_id
      AND (
        (fs.term_id IS NOT NULL AND t.starts_on <= (SELECT starts_on FROM public.terms WHERE id=p_term_id))
        OR
        (fs.term_id IS NULL AND fs.academic_year_id = (SELECT academic_year_id FROM public.terms WHERE id=p_term_id))
      )
    ORDER BY sort_date ASC, sf.id ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_available := GREATEST(0, v_fee.amount_due - GREATEST(v_fee.allocated, (SELECT COALESCE(sf2.amount_paid,0) FROM public.student_fees sf2 WHERE sf2.id=v_fee.id)));
    v_applied := LEAST(v_available, v_remaining);
    IF v_applied > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, student_fee_id, amount)
      VALUES (v_payment_id, v_fee.id, v_applied);
      UPDATE public.student_fees SET amount_paid = amount_paid + v_applied WHERE id=v_fee.id;
      v_remaining := v_remaining - v_applied;
    END IF;
  END LOOP;

  -- Never silently lose an overpayment. Store it as a credit for the student.
  IF v_remaining > 0 THEN
    INSERT INTO public.student_fee_credits(student_id, source_payment_id, amount, remaining_amount, note)
    VALUES (p_student_id, v_payment_id, v_remaining, v_remaining, 'Unapplied payment credit');
  END IF;

  RETURN v_payment_id;
END $$;

-- Safe void: remove the payment's allocations, then restore the affected fee balances.
CREATE OR REPLACE FUNCTION public.admin_void_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id uuid;
BEGIN
  IF NOT (public.my_role() IN ('super_admin','admin','principal','finance')) THEN
    RAISE EXCEPTION 'Finance access required';
  END IF;

  SELECT student_id INTO v_student_id FROM public.payments WHERE id=p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

  -- Restore exactly what this payment allocated, including historical balances.
  UPDATE public.student_fees sf
  SET amount_paid = GREATEST(0, sf.amount_paid - pa.amount)
  FROM public.payment_allocations pa
  WHERE pa.payment_id=p_payment_id AND pa.student_fee_id=sf.id;

  DELETE FROM public.student_fee_credits WHERE source_payment_id=p_payment_id;
  DELETE FROM public.payment_allocations WHERE payment_id=p_payment_id;
  DELETE FROM public.payments WHERE id=p_payment_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_record_payment(uuid,uuid,numeric,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid,uuid,numeric,text,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_void_payment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_void_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

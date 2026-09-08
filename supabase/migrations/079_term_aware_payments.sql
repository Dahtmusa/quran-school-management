-- Migration 079: Term-aware payment recording & parent fee summary
-- 1. Add term_id to payments (nullable, backward-compatible)
-- 2. admin_record_payment RPC — applies payment only to selected term's fees
-- 3. parent_get_fee_summary RPC — secure parent-only fee view with bank/currency/next-term data

-- ─── 1. Schema ────────────────────────────────────────────────────────────────

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_student_term_idx ON public.payments(student_id, term_id);

-- ─── 2. admin_record_payment ──────────────────────────────────────────────────

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
  v_fee        RECORD;
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Resolve the academic_year for this term
  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id = p_term_id;

  -- Record the payment
  INSERT INTO public.payments(student_id, term_id, amount, method, reference, notes, recorded_by)
  VALUES (p_student_id, p_term_id, p_amount, p_method, p_reference, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  -- Apply the amount only to student_fees rows that belong to this term
  v_remaining := p_amount;
  FOR v_fee IN
    SELECT sf.id, sf.amount_due, sf.amount_paid
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
    v_balance := GREATEST(0, v_fee.amount_due - v_fee.amount_paid);
    v_applied := LEAST(v_balance, v_remaining);
    IF v_applied > 0 THEN
      UPDATE public.student_fees
      SET    amount_paid = v_fee.amount_paid + v_applied
      WHERE  id = v_fee.id;
      v_remaining := v_remaining - v_applied;
    END IF;
  END LOOP;

  RETURN v_payment_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, text) TO authenticated;

-- ─── 3. parent_get_fee_summary ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.parent_get_fee_summary(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_section text;
BEGIN
  -- Parent must own this student
  IF NOT EXISTS (
    SELECT 1 FROM public.parent_students
    WHERE parent_id = auth.uid() AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT section::text INTO v_section FROM public.students WHERE id = p_student_id;

  RETURN jsonb_build_object(
    -- Allocated fees for this student (with term/year labels)
    'fees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',               sf.id,
        'fee_structure_id', sf.fee_structure_id,
        'amount_due',       sf.amount_due,
        'amount_paid',      sf.amount_paid,
        'term_id',          fs.term_id,
        'academic_year_id', fs.academic_year_id,
        'due_date',         fs.due_date,
        'term_number',      t.term_number,
        'term_name',        t.name,
        'year_name',        ay.name,
        'year_is_current',  ay.is_current
      ))
      FROM   public.student_fees sf
      JOIN   public.fee_structures fs ON fs.id = sf.fee_structure_id
      LEFT JOIN public.terms t         ON t.id  = fs.term_id
      LEFT JOIN public.academic_years ay ON ay.id = fs.academic_year_id
      WHERE  sf.student_id = p_student_id
    ), '[]'::jsonb),

    -- Payment history
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',        p.id,
        'amount',    p.amount,
        'paid_on',   p.paid_on,
        'method',    p.method,
        'reference', p.reference,
        'term_id',   p.term_id
      ) ORDER BY p.paid_on DESC)
      FROM public.payments p
      WHERE p.student_id = p_student_id
    ), '[]'::jsonb),

    -- Fee structures matching the student's section (for next-term display)
    'fee_structures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',               fs.id,
        'term_id',          fs.term_id,
        'academic_year_id', fs.academic_year_id,
        'amount',           fs.amount,
        'due_date',         fs.due_date,
        'term_number',      t.term_number,
        'term_name',        t.name,
        'term_starts_on',   t.starts_on,
        'term_ends_on',     t.ends_on,
        'year_name',        ay.name,
        'year_is_current',  ay.is_current
      ))
      FROM   public.fee_structures fs
      LEFT JOIN public.terms t         ON t.id  = fs.term_id
      LEFT JOIN public.academic_years ay ON ay.id = fs.academic_year_id
      WHERE  fs.section::text = v_section
    ), '[]'::jsonb),

    -- School/payment configuration
    'bank',         COALESCE((SELECT value FROM public.site_settings WHERE key = 'school_payment'), '{}'::jsonb),
    'currency',     COALESCE((SELECT value->>'symbol' FROM public.site_settings WHERE key = 'currency'), '₦'),
    'school_name',  COALESCE((SELECT value->>'value'  FROM public.site_settings WHERE key = 'school_name'),    'AMQM'),
    'school_address', COALESCE((SELECT value->>'value' FROM public.site_settings WHERE key = 'school_address'), '')
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.parent_get_fee_summary(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.parent_get_fee_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

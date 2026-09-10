-- Professional term-to-term finance carry-forward.
-- Keeps every fee obligation tied to its original term while allowing a later
-- payment to settle the oldest outstanding balance first.

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id, student_fee_id)
);

CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_student_fee_idx ON public.payment_allocations(student_fee_id);
CREATE INDEX IF NOT EXISTS payment_allocations_term_idx ON public.payment_allocations(term_id);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocations_finance_select ON public.payment_allocations;
CREATE POLICY payment_allocations_finance_select ON public.payment_allocations
FOR SELECT TO authenticated
USING (public.my_role() IN ('super_admin','admin','principal','finance'));

-- Backfill the existing, already-correct term-scoped payments. Historical
-- payments stay attached to their original term; only new payments can cross
-- term boundaries through the carry-forward allocator below.
DO $$
DECLARE
  p RECORD;
  f RECORD;
  remaining numeric;
  applied numeric;
BEGIN
  FOR p IN SELECT id, student_id, term_id, amount FROM public.payments WHERE term_id IS NOT NULL ORDER BY paid_on, id LOOP
    IF EXISTS (SELECT 1 FROM public.payment_allocations WHERE payment_id=p.id) THEN CONTINUE; END IF;
    remaining := p.amount;
    FOR f IN
      SELECT sf.id, sf.amount_due, COALESCE((SELECT sum(pa.amount) FROM public.payment_allocations pa WHERE pa.student_fee_id=sf.id),0) AS already_allocated
      FROM public.student_fees sf
      JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
      WHERE sf.student_id=p.student_id
        AND (fs.term_id=p.term_id OR (fs.term_id IS NULL AND fs.academic_year_id=(SELECT academic_year_id FROM public.terms WHERE id=p.term_id)))
      ORDER BY fs.term_id NULLS LAST, fs.section, sf.id
    LOOP
      EXIT WHEN remaining <= 0;
      applied := LEAST(GREATEST(0,f.amount_due-f.already_allocated), remaining);
      IF applied > 0 THEN
        INSERT INTO public.payment_allocations(payment_id,student_fee_id,term_id,amount)
        VALUES(p.id,f.id,p.term_id,applied);
        remaining := remaining-applied;
      END IF;
    END LOOP;
    IF remaining > 0.01 THEN
      RAISE EXCEPTION 'Cannot backfill payment %: % remains unallocated', p.id, remaining;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.term_id IS NOT NULL
      AND abs(p.amount-COALESCE((SELECT sum(pa.amount) FROM public.payment_allocations pa WHERE pa.payment_id=p.id),0)) > 0.01
  ) THEN
    RAISE EXCEPTION 'Existing term payment backfill is incomplete';
  END IF;
END $$;

-- Rebuild one student's fee balances and allocations from the payment ledger.
-- Payments are replayed oldest-first and can settle obligations up to the
-- payment's selected term, never a future term.
CREATE OR REPLACE FUNCTION public.rebuild_student_fee_balances(p_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  pay RECORD;
  fee RECORD;
  remaining numeric;
  applied numeric;
  v_payment_term_start date;
  v_payment_year_id uuid;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Finance access required';
  END IF;

  DELETE FROM public.payment_allocations pa
  USING public.payments p
  WHERE pa.payment_id=p.id AND p.student_id=p_student_id;

  UPDATE public.student_fees SET amount_paid=0 WHERE student_id=p_student_id;

  FOR pay IN
    SELECT p.id,p.term_id,p.amount,p.paid_on
    FROM public.payments p
    WHERE p.student_id=p_student_id AND p.term_id IS NOT NULL
    ORDER BY p.paid_on ASC,p.id ASC
  LOOP
    SELECT t.starts_on, t.academic_year_id INTO v_payment_term_start,v_payment_year_id
    FROM public.terms t WHERE t.id=pay.term_id;
    remaining := pay.amount;

    FOR fee IN
      SELECT sf.id,sf.amount_due,sf.amount_paid,fs.term_id,fs.academic_year_id,fs.section,
             t.starts_on AS fee_term_start, ay.name AS year_name
      FROM public.student_fees sf
      JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
      LEFT JOIN public.terms t ON t.id=fs.term_id
      LEFT JOIN public.academic_years ay ON ay.id=fs.academic_year_id
      WHERE sf.student_id=p_student_id
        AND (
          (fs.term_id IS NOT NULL AND t.starts_on <= v_payment_term_start)
          OR
          (fs.term_id IS NULL AND fs.academic_year_id=v_payment_year_id)
          OR
          (fs.term_id IS NULL AND EXISTS (SELECT 1 FROM public.academic_years py WHERE py.id=fs.academic_year_id AND py.starts_on <= v_payment_term_start))
        )
      ORDER BY
        CASE WHEN fs.term_id IS NULL THEN 0 ELSE 1 END,
        COALESCE(t.starts_on, (SELECT starts_on FROM public.academic_years WHERE id=fs.academic_year_id)),
        COALESCE(t.term_number,0),
        sf.id
    LOOP
      EXIT WHEN remaining <= 0;
      applied := LEAST(GREATEST(0,fee.amount_due-fee.amount_paid),remaining);
      IF applied > 0 THEN
        UPDATE public.student_fees SET amount_paid=amount_paid+applied WHERE id=fee.id;
        INSERT INTO public.payment_allocations(payment_id,student_fee_id,term_id,amount)
        VALUES(pay.id,fee.id,COALESCE(fee.term_id,pay.term_id),applied);
        remaining := remaining-applied;
      END IF;
    END LOOP;

    IF remaining > 0.01 THEN
      RAISE EXCEPTION 'Payment % exceeds all fee obligations through its selected term by %', pay.id, remaining;
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.rebuild_student_fee_balances(uuid) TO authenticated;

-- Record a payment against the selected term, automatically clearing the
-- oldest outstanding prior-term balance(s) before the selected term fee.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_student_id uuid,
  p_term_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'Cash',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payment_id uuid;
  v_term_start date;
  v_year_id uuid;
  v_due numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_remaining numeric;
  v_applied numeric;
  v_fee RECORD;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN RAISE EXCEPTION 'Finance access required'; END IF;
  IF p_student_id IS NULL OR p_term_id IS NULL THEN RAISE EXCEPTION 'Student and term are required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  SELECT starts_on,academic_year_id INTO v_term_start,v_year_id FROM public.terms WHERE id=p_term_id;
  IF v_term_start IS NULL THEN RAISE EXCEPTION 'Term not found'; END IF;

  PERFORM public.sync_student_fee_allocations(p_term_id);

  SELECT COALESCE(sum(sf.amount_due),0),COALESCE(sum(sf.amount_paid),0)
  INTO v_due,v_paid
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  LEFT JOIN public.terms t ON t.id=fs.term_id
  WHERE sf.student_id=p_student_id
    AND (
      (fs.term_id IS NOT NULL AND t.starts_on <= v_term_start)
      OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id)
      OR (fs.term_id IS NULL AND EXISTS (SELECT 1 FROM public.academic_years ay WHERE ay.id=fs.academic_year_id AND ay.starts_on <= v_term_start))
    );
  v_balance:=GREATEST(0,v_due-v_paid);
  IF v_due<=0 THEN RAISE EXCEPTION 'No fee allocation exists for this student in the selected term'; END IF;
  IF p_amount>v_balance THEN RAISE EXCEPTION 'Payment exceeds total outstanding balance through the selected term of %',v_balance; END IF;

  INSERT INTO public.payments(student_id,term_id,amount,method,reference,notes,recorded_by)
  VALUES(p_student_id,p_term_id,round(p_amount,2),coalesce(nullif(trim(p_method),''),'Cash'),nullif(trim(p_reference),''),p_notes,auth.uid())
  RETURNING id INTO v_payment_id;

  v_remaining:=round(p_amount,2);
  FOR v_fee IN
    SELECT sf.id,sf.amount_due,sf.amount_paid,fs.term_id,fs.academic_year_id,
           t.starts_on AS fee_term_start,t.term_number,
           CASE WHEN fs.term_id IS NULL THEN (SELECT starts_on FROM public.academic_years WHERE id=fs.academic_year_id) ELSE t.starts_on END AS obligation_start
    FROM public.student_fees sf
    JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    LEFT JOIN public.terms t ON t.id=fs.term_id
    WHERE sf.student_id=p_student_id
      AND (
        (fs.term_id IS NOT NULL AND t.starts_on <= v_term_start)
        OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id)
        OR (fs.term_id IS NULL AND EXISTS (SELECT 1 FROM public.academic_years ay WHERE ay.id=fs.academic_year_id AND ay.starts_on <= v_term_start))
      )
    ORDER BY obligation_start ASC,COALESCE(t.term_number,0),sf.id
  LOOP
    EXIT WHEN v_remaining<=0;
    v_applied:=LEAST(GREATEST(0,v_fee.amount_due-v_fee.amount_paid),v_remaining);
    IF v_applied>0 THEN
      UPDATE public.student_fees SET amount_paid=amount_paid+v_applied WHERE id=v_fee.id;
      INSERT INTO public.payment_allocations(payment_id,student_fee_id,term_id,amount)
      VALUES(v_payment_id,v_fee.id,COALESCE(v_fee.term_id,p_term_id),v_applied);
      v_remaining:=v_remaining-v_applied;
    END IF;
  END LOOP;
  PERFORM public.refresh_invoice_for_student_term(p_student_id,p_term_id);
  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid,uuid,numeric,text,text,text) TO authenticated;

-- Voiding a payment rebuilds the complete student's ledger, so cross-term
-- allocations are recalculated safely without touching other students.
CREATE OR REPLACE FUNCTION public.admin_void_payment(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student_id uuid; v_term_id uuid;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN RAISE EXCEPTION 'Finance access required'; END IF;
  SELECT student_id INTO v_student_id FROM public.payments WHERE id=p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE id=p_payment_id AND term_id IS NULL) THEN
    RAISE EXCEPTION 'This legacy payment has no term and cannot be safely voided from the term finance workflow.';
  END IF;
  DELETE FROM public.payments WHERE id=p_payment_id;
  PERFORM public.rebuild_student_fee_balances(v_student_id);
  -- Refresh invoices for every term that has an invoice for this student.
  FOR v_term_id IN SELECT term_id FROM public.invoices WHERE student_id=v_student_id AND status<>'void' LOOP
    PERFORM public.refresh_invoice_for_student_term(v_student_id,v_term_id);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_void_payment(uuid) TO authenticated;

-- Produce a new-term invoice/statement with the current term fee plus all
-- outstanding earlier obligations. The source term is retained on every line.
CREATE OR REPLACE FUNCTION public.sync_term_invoices(p_term_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  n integer:=0; r RECORD; v_year_id uuid; v_term_no smallint; v_term_start date;
  v_current_due numeric; v_current_paid numeric; v_prior_balance numeric; v_total_due numeric; v_lines jsonb; v_inv text;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN RAISE EXCEPTION 'Finance administrator access required'; END IF;
  SELECT academic_year_id,term_number,starts_on INTO v_year_id,v_term_no,v_term_start FROM public.terms WHERE id=p_term_id;
  IF v_term_start IS NULL THEN RAISE EXCEPTION 'Term not found'; END IF;
  PERFORM public.sync_student_fee_allocations(p_term_id);

  FOR r IN SELECT st.id,st.admission_no FROM public.students st WHERE st.status='active' LOOP
    SELECT COALESCE(sum(sf.amount_due),0),COALESCE(sum(sf.amount_paid),0)
    INTO v_current_due,v_current_paid
    FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    WHERE sf.student_id=r.id AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id));

    SELECT COALESCE(sum(GREATEST(0,sf.amount_due-sf.amount_paid)),0)
    INTO v_prior_balance
    FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    LEFT JOIN public.terms t ON t.id=fs.term_id
    WHERE sf.student_id=r.id AND fs.term_id IS NOT NULL AND t.starts_on < v_term_start;

    v_total_due:=v_current_due+v_prior_balance;
    IF v_total_due>0 THEN
      SELECT jsonb_agg(x.line ORDER BY x.sort_key) INTO v_lines
      FROM (
        SELECT jsonb_build_object('type','previous_balance','description','Previous balance · '||COALESCE(t.name,'Prior term')||' '||COALESCE(ay.name,''),'source_term_id',fs.term_id,'amount',GREATEST(0,sf.amount_due-sf.amount_paid)) AS line, t.starts_on AS sort_key
        FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
        LEFT JOIN public.terms t ON t.id=fs.term_id LEFT JOIN public.academic_years ay ON ay.id=fs.academic_year_id
        WHERE sf.student_id=r.id AND fs.term_id IS NOT NULL AND t.starts_on < v_term_start AND sf.amount_due>sf.amount_paid
        UNION ALL
        SELECT jsonb_build_object('type','current_term_fee','description','Current term fee · '||COALESCE((SELECT name FROM public.terms WHERE id=p_term_id),'Term'),'source_term_id',p_term_id,'amount',v_current_due), v_term_start
      ) x;

      v_inv:='AMQM/INV/'||to_char(current_date,'YYYY')||'/'||upper(replace(r.admission_no,'/',''))||'/T'||v_term_no;
      INSERT INTO public.invoices(invoice_no,student_id,term_id,amount_due,amount_paid,due_date,status,line_items,generated_by)
      VALUES(v_inv,r.id,p_term_id,v_total_due,v_current_paid,(SELECT ends_on FROM public.terms WHERE id=p_term_id),
        CASE WHEN v_current_paid>=v_total_due AND v_total_due>0 THEN 'paid' WHEN v_current_paid>0 THEN 'part_paid' WHEN (SELECT ends_on FROM public.terms WHERE id=p_term_id)<current_date THEN 'overdue' ELSE 'issued' END,
        COALESCE(v_lines,'[]'::jsonb),auth.uid())
      ON CONFLICT(student_id,term_id) DO UPDATE SET amount_due=excluded.amount_due,amount_paid=excluded.amount_paid,due_date=excluded.due_date,status=excluded.status,line_items=excluded.line_items;
      n:=n+1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.sync_term_invoices(uuid) TO authenticated;

-- Keep the current-term invoice amount/status synchronized after its fee
-- allocations actually change. This runs after the payment allocator updates
-- student_fees, avoiding the ordering problem of an INSERT-on-payments trigger.
CREATE OR REPLACE FUNCTION public.refresh_invoice_for_student_term(p_student_id uuid,p_term_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_term_start date; v_year_id uuid; v_current_due numeric:=0; v_current_paid numeric:=0; v_prior_balance numeric:=0; v_total_due numeric:=0;
BEGIN
  SELECT starts_on,academic_year_id INTO v_term_start,v_year_id FROM public.terms WHERE id=p_term_id;
  IF v_term_start IS NULL THEN RETURN; END IF;
  SELECT COALESCE(sum(sf.amount_due),0),COALESCE(sum(sf.amount_paid),0) INTO v_current_due,v_current_paid
  FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  WHERE sf.student_id=p_student_id AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id));
  SELECT COALESCE(sum(GREATEST(0,sf.amount_due-sf.amount_paid)),0) INTO v_prior_balance
  FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  LEFT JOIN public.terms t ON t.id=fs.term_id
  WHERE sf.student_id=p_student_id AND fs.term_id IS NOT NULL AND t.starts_on < v_term_start;
  v_total_due:=v_current_due+v_prior_balance;
  UPDATE public.invoices SET amount_due=v_total_due,amount_paid=v_current_paid,
    status=CASE WHEN v_current_paid>=v_total_due AND v_total_due>0 THEN 'paid' WHEN v_current_paid>0 THEN 'part_paid' WHEN due_date IS NOT NULL AND due_date<current_date THEN 'overdue' ELSE 'issued' END
  WHERE student_id=p_student_id AND term_id=p_term_id AND status<>'void';
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_invoice_for_student_term(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_invoice_after_fee_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_term_id uuid;
BEGIN
  SELECT fs.term_id INTO v_term_id FROM public.fee_structures fs WHERE fs.id=NEW.fee_structure_id;
  IF v_term_id IS NOT NULL THEN PERFORM public.refresh_invoice_for_student_term(NEW.student_id,v_term_id); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_refresh_invoice_totals ON public.payments;
DROP TRIGGER IF EXISTS student_fee_refresh_invoice_totals ON public.student_fees;
CREATE TRIGGER student_fee_refresh_invoice_totals AFTER UPDATE OF amount_paid ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.refresh_invoice_after_fee_change();

-- Parent fee summary now exposes explicit current/prior/total balances while
-- retaining the existing fee/payment arrays for compatibility.
CREATE OR REPLACE FUNCTION public.parent_get_fee_summary(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_section text;
  v_term_id uuid;
  v_term_start date;
  v_current_due numeric:=0;
  v_current_paid numeric:=0;
  v_prior_balance numeric:=0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.parent_students WHERE parent_id=auth.uid() AND student_id=p_student_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT section::text INTO v_section FROM public.students WHERE id=p_student_id;
  SELECT s.current_term_id,t.starts_on INTO v_term_id,v_term_start
  FROM public.academic_cycle_settings s
  JOIN public.terms t ON t.id=s.current_term_id
  WHERE s.id=true;
  IF v_term_id IS NULL THEN
    SELECT t.id,t.starts_on INTO v_term_id,v_term_start
    FROM public.terms t JOIN public.academic_years ay ON ay.id=t.academic_year_id
    WHERE ay.is_current AND current_date BETWEEN t.starts_on AND t.ends_on
    ORDER BY t.term_number LIMIT 1;
  END IF;

  SELECT COALESCE(sum(sf.amount_due),0),COALESCE(sum(sf.amount_paid),0) INTO v_current_due,v_current_paid
  FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  WHERE sf.student_id=p_student_id AND (fs.term_id=v_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=(SELECT academic_year_id FROM public.terms WHERE id=v_term_id)));

  SELECT COALESCE(sum(GREATEST(0,sf.amount_due-sf.amount_paid)),0) INTO v_prior_balance
  FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  LEFT JOIN public.terms t ON t.id=fs.term_id
  WHERE sf.student_id=p_student_id AND fs.term_id IS NOT NULL AND t.starts_on < v_term_start;

  RETURN jsonb_build_object(
    'fees', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sf.id,'fee_structure_id',sf.fee_structure_id,'amount_due',sf.amount_due,'amount_paid',sf.amount_paid,'term_id',fs.term_id,'academic_year_id',fs.academic_year_id,'due_date',fs.due_date,'term_number',t.term_number,'term_name',t.name,'year_name',ay.name,'year_is_current',ay.is_current)) FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id LEFT JOIN public.terms t ON t.id=fs.term_id LEFT JOIN public.academic_years ay ON ay.id=fs.academic_year_id WHERE sf.student_id=p_student_id),'[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paid_on',p.paid_on,'method',p.method,'reference',p.reference,'term_id',p.term_id) ORDER BY p.paid_on DESC) FROM public.payments p WHERE p.student_id=p_student_id),'[]'::jsonb),
    'fee_structures', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',fs.id,'term_id',fs.term_id,'academic_year_id',fs.academic_year_id,'amount',fs.amount,'due_date',fs.due_date,'term_number',t.term_number,'term_name',t.name,'term_starts_on',t.starts_on,'term_ends_on',t.ends_on,'year_name',ay.name,'year_is_current',ay.is_current)) FROM public.fee_structures fs LEFT JOIN public.terms t ON t.id=fs.term_id LEFT JOIN public.academic_years ay ON ay.id=fs.academic_year_id WHERE fs.section::text=v_section),'[]'::jsonb),
    'current_term_id',v_term_id,
    'current_term_fee',v_current_due,
    'current_term_paid',v_current_paid,
    'previous_balance',v_prior_balance,
    'total_payable',v_current_due+v_prior_balance,
    'total_outstanding',GREATEST(0,v_current_due-v_current_paid)+v_prior_balance,
    'bank',COALESCE((SELECT value FROM public.site_settings WHERE key='school_payment'),'{}'::jsonb),
    'currency',COALESCE((SELECT value->>'symbol' FROM public.site_settings WHERE key='currency'),'₦'),
    'school_name',COALESCE((SELECT value->>'value' FROM public.site_settings WHERE key='school_name'),'AMQM'),
    'school_address',COALESCE((SELECT value->>'address' FROM public.site_settings WHERE key='contact'),'')
  );
END $$;
GRANT EXECUTE ON FUNCTION public.parent_get_fee_summary(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

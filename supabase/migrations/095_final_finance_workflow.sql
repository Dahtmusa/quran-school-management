-- Final finance workflow hardening.
-- Goals: one applicable fee allocation per student/term, safe section changes,
-- strict term-scoped payments, no overpayments, and protected paid history.

-- Prevent duplicate fee structures for the same academic year/term/section.
CREATE UNIQUE INDEX IF NOT EXISTS fee_structures_year_term_section_uidx
  ON public.fee_structures(academic_year_id, COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid), section);

-- Fee allocations must never show less paid than due.
CREATE OR REPLACE FUNCTION public.guard_student_fee_amounts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_due < 0 OR NEW.amount_paid < 0 THEN
    RAISE EXCEPTION 'Fee amounts cannot be negative';
  END IF;
  IF NEW.amount_paid > NEW.amount_due THEN
    RAISE EXCEPTION 'Paid amount cannot exceed fee amount due';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS student_fee_amount_guard ON public.student_fees;
CREATE TRIGGER student_fee_amount_guard
BEFORE INSERT OR UPDATE OF amount_due, amount_paid ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.guard_student_fee_amounts();

-- Safe deletion: paid fee history cannot be deleted accidentally.
CREATE OR REPLACE FUNCTION public.admin_delete_fee_structure(p_fee_structure_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid_count integer;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Finance administrator access required';
  END IF;
  SELECT count(*) INTO paid_count
  FROM public.student_fees
  WHERE fee_structure_id=p_fee_structure_id AND amount_paid>0;
  IF paid_count>0 THEN
    RAISE EXCEPTION 'Cannot delete this fee structure: % student fee allocation(s) already have payments. Edit the fee structure instead.', paid_count;
  END IF;
  DELETE FROM public.student_fees WHERE fee_structure_id=p_fee_structure_id;
  DELETE FROM public.fee_structures WHERE id=p_fee_structure_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_fee_structure(uuid) TO authenticated;

-- One authoritative synchronization path. It removes stale unpaid allocations
-- (for example Day fee left behind after a student became Boarding), preserves
-- anything already paid, and then creates/updates the correct allocation.
CREATE OR REPLACE FUNCTION public.sync_student_fee_allocations(p_term_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_year_id uuid;
  v_removed integer := 0;
  v_upserted integer := 0;
  v_paid_stale integer;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Finance administrator access required';
  END IF;
  IF p_term_id IS NULL THEN RAISE EXCEPTION 'Term is required'; END IF;

  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id=p_term_id;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'Term not found'; END IF;

  -- If an allocation belongs to a fee section different from the student's
  -- current section, it is stale. Never silently delete a paid allocation.
  SELECT count(*) INTO v_paid_stale
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  JOIN public.students st ON st.id=sf.student_id
  WHERE fs.academic_year_id=v_year_id
    AND (fs.term_id=p_term_id OR fs.term_id IS NULL)
    AND st.status='active'
    AND fs.section IS DISTINCT FROM st.section
    AND sf.amount_paid>0;
  IF v_paid_stale>0 THEN
    RAISE EXCEPTION 'Cannot automatically change section fees: % stale allocation(s) already contain payments. Review Finance first.', v_paid_stale;
  END IF;

  DELETE FROM public.student_fees sf
  USING public.fee_structures fs, public.students st
  WHERE sf.fee_structure_id=fs.id
    AND sf.student_id=st.id
    AND fs.academic_year_id=v_year_id
    AND (fs.term_id=p_term_id OR fs.term_id IS NULL)
    AND st.status='active'
    AND fs.section IS DISTINCT FROM st.section
    AND sf.amount_paid=0;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO public.student_fees(student_id,fee_structure_id,amount_due)
  SELECT st.id,fs.id,fs.amount
  FROM public.students st
  JOIN public.fee_structures fs
    ON fs.academic_year_id=v_year_id
   AND (fs.term_id=p_term_id OR fs.term_id IS NULL)
   AND fs.section=st.section
  WHERE st.status='active'
  ON CONFLICT(student_id,fee_structure_id)
  DO UPDATE SET amount_due=excluded.amount_due;
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  RETURN v_removed + v_upserted;
END $$;
GRANT EXECUTE ON FUNCTION public.sync_student_fee_allocations(uuid) TO authenticated;

-- Strict, term-scoped payment recording. Overpayments are rejected rather than
-- creating money that cannot be allocated to a student's fee balance.
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
  v_year_id uuid;
  v_due numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_remaining numeric;
  v_applied numeric;
  v_fee RECORD;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Finance access required';
  END IF;
  IF p_student_id IS NULL OR p_term_id IS NULL THEN RAISE EXCEPTION 'Student and term are required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id=p_term_id;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'Term not found'; END IF;

  -- Ensure the student's current section has a current allocation before taking money.
  PERFORM public.sync_student_fee_allocations(p_term_id);

  SELECT COALESCE(sum(sf.amount_due),0), COALESCE(sum(sf.amount_paid),0)
    INTO v_due,v_paid
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  WHERE sf.student_id=p_student_id
    AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id));
  v_balance := GREATEST(0,v_due-v_paid);
  IF v_due <= 0 THEN RAISE EXCEPTION 'No fee allocation exists for this student in the selected term'; END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance of %', v_balance;
  END IF;

  INSERT INTO public.payments(student_id,term_id,amount,method,reference,notes,recorded_by)
  VALUES(p_student_id,p_term_id,round(p_amount,2),coalesce(nullif(trim(p_method),''),'Cash'),nullif(trim(p_reference),''),p_notes,auth.uid())
  RETURNING id INTO v_payment_id;

  v_remaining := p_amount;
  FOR v_fee IN
    SELECT sf.id,sf.amount_due,sf.amount_paid
    FROM public.student_fees sf
    JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    WHERE sf.student_id=p_student_id
      AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id))
    ORDER BY fs.term_id NULLS LAST,fs.section,sf.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_applied := LEAST(GREATEST(0,v_fee.amount_due-v_fee.amount_paid),v_remaining);
    IF v_applied>0 THEN
      UPDATE public.student_fees SET amount_paid=amount_paid+v_applied WHERE id=v_fee.id;
      v_remaining := v_remaining-v_applied;
    END IF;
  END LOOP;
  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid,uuid,numeric,text,text,text) TO authenticated;

-- Void/rebuild balances for exactly one term, without touching other terms.
CREATE OR REPLACE FUNCTION public.admin_void_payment(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_student_id uuid; v_term_id uuid; v_year_id uuid;
  v_remaining numeric; v_applied numeric; v_fee RECORD; v_pay RECORD;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN RAISE EXCEPTION 'Finance access required'; END IF;
  SELECT student_id,term_id INTO v_student_id,v_term_id FROM public.payments WHERE id=p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id=v_term_id;
  DELETE FROM public.payments WHERE id=p_payment_id;

  UPDATE public.student_fees sf SET amount_paid=0
  FROM public.fee_structures fs
  WHERE sf.fee_structure_id=fs.id AND sf.student_id=v_student_id
    AND (fs.term_id=v_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id));

  FOR v_pay IN
    SELECT id,amount FROM public.payments
    WHERE student_id=v_student_id AND term_id=v_term_id
    ORDER BY paid_on ASC,id ASC
  LOOP
    v_remaining:=v_pay.amount;
    FOR v_fee IN
      SELECT sf.id,sf.amount_due,sf.amount_paid
      FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
      WHERE sf.student_id=v_student_id
        AND (fs.term_id=v_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id))
      ORDER BY fs.term_id NULLS LAST,fs.section,sf.id
    LOOP
      EXIT WHEN v_remaining<=0;
      v_applied:=LEAST(GREATEST(0,v_fee.amount_due-v_fee.amount_paid),v_remaining);
      IF v_applied>0 THEN
        UPDATE public.student_fees SET amount_paid=amount_paid+v_applied WHERE id=v_fee.id;
        v_remaining:=v_remaining-v_applied;
      END IF;
    END LOOP;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_void_payment(uuid) TO authenticated;

-- Keep invoices synchronized with the authoritative fee allocations.
CREATE OR REPLACE FUNCTION public.sync_term_invoices(p_term_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r RECORD; v_amount numeric; v_inv text;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN RAISE EXCEPTION 'Finance administrator access required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.terms WHERE id=p_term_id) THEN RAISE EXCEPTION 'Term not found'; END IF;
  PERFORM public.sync_student_fee_allocations(p_term_id);
  FOR r IN SELECT st.id,st.admission_no FROM public.students st WHERE st.status='active' LOOP
    SELECT COALESCE(sum(sf.amount_due),0) INTO v_amount
    FROM public.student_fees sf JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    WHERE sf.student_id=r.id AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=(SELECT academic_year_id FROM public.terms WHERE id=p_term_id)));
    IF v_amount>0 THEN
      v_inv := 'AMQM/INV/'||to_char(current_date,'YYYY')||'/'||upper(replace(r.admission_no,'/',''))||'/T'||(SELECT term_number FROM public.terms WHERE id=p_term_id);
      INSERT INTO public.invoices(invoice_no,student_id,term_id,amount_due,amount_paid,due_date,line_items,generated_by)
      VALUES(v_inv,r.id,p_term_id,v_amount,0,(SELECT ends_on FROM public.terms WHERE id=p_term_id),jsonb_build_array(jsonb_build_object('description','School fees','amount',v_amount)),auth.uid())
      ON CONFLICT(student_id,term_id) DO UPDATE SET amount_due=excluded.amount_due,due_date=excluded.due_date,line_items=excluded.line_items;
      n:=n+1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.sync_term_invoices(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

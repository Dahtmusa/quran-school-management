-- Second Term is the active parent-facing invoice/statement.  The invoice
-- carries any manually-collected First Term outstanding balance forward as a
-- separate line, then adds the Second Term fee to produce one total payable.
-- First Term fee/payment records remain intact; this does not delete or alter
-- historical student balances or payments.

CREATE OR REPLACE FUNCTION public.refresh_invoice_for_student_term(p_student_id uuid,p_term_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_term_start date;
  v_year_id uuid;
  v_term_name text;
  v_term_year text;
  v_term_no smallint;
  v_current_due numeric:=0;
  v_current_paid numeric:=0;
  v_prior_balance numeric:=0;
  v_total_due numeric:=0;
  v_lines jsonb:='[]'::jsonb;
BEGIN
  SELECT t.starts_on,t.academic_year_id,t.name,t.term_number,ay.name
  INTO v_term_start,v_year_id,v_term_name,v_term_no,v_term_year
  FROM public.terms t
  LEFT JOIN public.academic_years ay ON ay.id=t.academic_year_id
  WHERE t.id=p_term_id;
  IF v_term_start IS NULL THEN RETURN; END IF;

  SELECT COALESCE(sum(sf.amount_due),0),COALESCE(sum(sf.amount_paid),0)
  INTO v_current_due,v_current_paid
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  WHERE sf.student_id=p_student_id
    AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id));

  SELECT COALESCE(sum(GREATEST(0,sf.amount_due-sf.amount_paid)),0)
  INTO v_prior_balance
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
  LEFT JOIN public.terms t ON t.id=fs.term_id
  WHERE sf.student_id=p_student_id
    AND fs.term_id IS NOT NULL
    AND t.starts_on < v_term_start;

  v_total_due:=v_current_due+v_prior_balance;

  IF v_prior_balance > 0 THEN
    v_lines:=jsonb_build_array(
      jsonb_build_object(
        'type','previous_balance',
        'description','Balance carried forward from First Term',
        'source_term_id',(SELECT id FROM public.terms WHERE term_number=1 AND academic_year_id=v_year_id LIMIT 1),
        'amount',v_prior_balance
      ),
      jsonb_build_object(
        'type','current_term_fee',
        'description',COALESCE(v_term_name,'Second Term')||' fee',
        'source_term_id',p_term_id,
        'amount',v_current_due
      )
    );
  ELSE
    v_lines:=jsonb_build_array(
      jsonb_build_object(
        'type','current_term_fee',
        'description',COALESCE(v_term_name,'Second Term')||' fee',
        'source_term_id',p_term_id,
        'amount',v_current_due
      )
    );
  END IF;

  UPDATE public.invoices
  SET amount_due=v_total_due,
      amount_paid=v_current_paid,
      status=CASE
        WHEN v_current_paid>=v_total_due AND v_total_due>0 THEN 'paid'
        WHEN v_current_paid>0 THEN 'part_paid'
        WHEN due_date IS NOT NULL AND due_date<current_date THEN 'overdue'
        ELSE 'issued'
      END,
      line_items=v_lines
  WHERE student_id=p_student_id
    AND term_id=p_term_id
    AND status<>'void';
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_invoice_for_student_term(uuid,uuid) TO authenticated;

-- Keep generated Second Term statements using explicit, parent-friendly
-- descriptions. This remains safe for future terms while the UI selects the
-- active/upcoming term invoice.
CREATE OR REPLACE FUNCTION public.sync_term_invoices(p_term_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  n integer:=0; r RECORD; v_year_id uuid; v_term_no smallint; v_term_start date;
  v_term_name text; v_current_due numeric; v_current_paid numeric; v_prior_balance numeric; v_total_due numeric; v_lines jsonb; v_inv text;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN RAISE EXCEPTION 'Finance administrator access required'; END IF;
  SELECT academic_year_id,term_number,starts_on,name INTO v_year_id,v_term_no,v_term_start,v_term_name FROM public.terms WHERE id=p_term_id;
  IF v_term_start IS NULL THEN RAISE EXCEPTION 'Term not found'; END IF;
  PERFORM public.sync_student_fee_allocations(p_term_id);

  FOR r IN SELECT st.id,st.admission_no FROM public.students st WHERE st.status='active' LOOP
    SELECT COALESCE(sum(sf.amount_due),0),COALESCE(sum(sf.amount_paid),0)
    INTO v_current_due,v_current_paid
    FROM public.student_fees sf
    JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    WHERE sf.student_id=r.id AND (fs.term_id=p_term_id OR (fs.term_id IS NULL AND fs.academic_year_id=v_year_id));

    SELECT COALESCE(sum(GREATEST(0,sf.amount_due-sf.amount_paid)),0)
    INTO v_prior_balance
    FROM public.student_fees sf
    JOIN public.fee_structures fs ON fs.id=sf.fee_structure_id
    LEFT JOIN public.terms t ON t.id=fs.term_id
    WHERE sf.student_id=r.id AND fs.term_id IS NOT NULL AND t.starts_on < v_term_start;

    v_total_due:=v_current_due+v_prior_balance;
    IF v_total_due>0 THEN
      IF v_prior_balance > 0 THEN
        v_lines:=jsonb_build_array(
          jsonb_build_object('type','previous_balance','description','Balance carried forward from First Term','source_term_id',(SELECT id FROM public.terms WHERE term_number=1 AND academic_year_id=v_year_id LIMIT 1),'amount',v_prior_balance),
          jsonb_build_object('type','current_term_fee','description',COALESCE(v_term_name,'Second Term')||' fee','source_term_id',p_term_id,'amount',v_current_due)
        );
      ELSE
        v_lines:=jsonb_build_array(jsonb_build_object('type','current_term_fee','description',COALESCE(v_term_name,'Second Term')||' fee','source_term_id',p_term_id,'amount',v_current_due));
      END IF;

      v_inv:='AMQM/INV/'||to_char(current_date,'YYYY')||'/'||upper(replace(r.admission_no,'/',''))||'/T'||v_term_no;
      INSERT INTO public.invoices(invoice_no,student_id,term_id,amount_due,amount_paid,due_date,status,line_items,generated_by)
      VALUES(v_inv,r.id,p_term_id,v_total_due,v_current_paid,(SELECT ends_on FROM public.terms WHERE id=p_term_id),
        CASE WHEN v_current_paid>=v_total_due AND v_total_due>0 THEN 'paid' WHEN v_current_paid>0 THEN 'part_paid' WHEN (SELECT ends_on FROM public.terms WHERE id=p_term_id)<current_date THEN 'overdue' ELSE 'issued' END,
        v_lines,auth.uid())
      ON CONFLICT(student_id,term_id) DO UPDATE SET invoice_no=excluded.invoice_no,amount_due=excluded.amount_due,amount_paid=excluded.amount_paid,due_date=excluded.due_date,status=excluded.status,line_items=excluded.line_items;
      n:=n+1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.sync_term_invoices(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

-- AMQM Finance: definitive next-term carry-forward invoice logic
-- Run this ONCE in the Supabase SQL editor after the application patch.
-- It does not delete historical fee or payment records.

CREATE OR REPLACE FUNCTION public.refresh_invoice_for_student_term(
  p_student_id uuid,
  p_term_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term_start date;
  v_year_id uuid;
  v_term_name text;
  v_term_no smallint;
  v_year_name text;
  v_current_due numeric := 0;
  v_current_paid numeric := 0;
  v_prior_balance numeric := 0;
  v_total_due numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_inv text;
  v_due_date date;
BEGIN
  SELECT t.starts_on, t.academic_year_id, t.name, t.term_number,
         ay.name, t.ends_on
  INTO v_term_start, v_year_id, v_term_name, v_term_no,
       v_year_name, v_due_date
  FROM public.terms t
  LEFT JOIN public.academic_years ay ON ay.id = t.academic_year_id
  WHERE t.id = p_term_id;

  IF v_term_start IS NULL THEN
    RAISE EXCEPTION 'Term not found';
  END IF;

  -- Current-term fee(s).
  SELECT
    COALESCE(SUM(sf.amount_due), 0),
    COALESCE(SUM(sf.amount_paid), 0)
  INTO v_current_due, v_current_paid
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id = sf.fee_structure_id
  WHERE sf.student_id = p_student_id
    AND (
      fs.term_id = p_term_id
      OR (fs.term_id IS NULL AND fs.academic_year_id = v_year_id)
    );

  -- ALL outstanding obligations before the target term.
  -- Previous terms in the same academic year are included, and older
  -- academic years are included as well.
  SELECT COALESCE(SUM(GREATEST(0, sf.amount_due - sf.amount_paid)), 0)
  INTO v_prior_balance
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id = sf.fee_structure_id
  LEFT JOIN public.terms source_term ON source_term.id = fs.term_id
  LEFT JOIN public.academic_years source_year ON source_year.id = fs.academic_year_id
  WHERE sf.student_id = p_student_id
    AND (
      (fs.term_id IS NOT NULL AND source_term.starts_on < v_term_start)
      OR
      (fs.term_id IS NULL AND source_year.starts_on < v_term_start
       AND fs.academic_year_id <> v_year_id)
    )
    AND GREATEST(0, sf.amount_due - sf.amount_paid) > 0;

  v_total_due := v_current_due + v_prior_balance;

  -- Itemize every previous outstanding fee separately.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'type', 'previous_balance',
        'description',
          'Outstanding · ' ||
          COALESCE(source_term.name,
                   CASE WHEN source_year.name IS NOT NULL
                        THEN source_year.name
                        ELSE 'Previous academic year'
                   END) ||
          ' · ' ||
          COALESCE(fs.name, 'School fee'),
        'source_term_id', fs.term_id,
        'source_academic_year_id', fs.academic_year_id,
        'amount', GREATEST(0, sf.amount_due - sf.amount_paid)
      )
      ORDER BY COALESCE(source_term.starts_on, source_year.starts_on),
               fs.name,
               sf.id
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM public.student_fees sf
  JOIN public.fee_structures fs ON fs.id = sf.fee_structure_id
  LEFT JOIN public.terms source_term ON source_term.id = fs.term_id
  LEFT JOIN public.academic_years source_year ON source_year.id = fs.academic_year_id
  WHERE sf.student_id = p_student_id
    AND (
      (fs.term_id IS NOT NULL AND source_term.starts_on < v_term_start)
      OR
      (fs.term_id IS NULL AND source_year.starts_on < v_term_start
       AND fs.academic_year_id <> v_year_id)
    )
    AND GREATEST(0, sf.amount_due - sf.amount_paid) > 0;

  -- Add the current/next-term charge as its own line.
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'type', 'current_term_fee',
      'description',
        COALESCE(v_term_name, 'Current Term') ||
        CASE WHEN v_year_name IS NOT NULL THEN ' · ' || v_year_name ELSE '' END ||
        ' fee',
      'source_term_id', p_term_id,
      'amount', v_current_due
    )
  );

  v_inv :=
    'AMQM/INV/' ||
    to_char(current_date, 'YYYY') || '/' ||
    upper(replace(
      COALESCE(
        (SELECT admission_no FROM public.students WHERE id = p_student_id),
        p_student_id::text
      ), '/', ''
    )) ||
    '/T' || v_term_no;

  INSERT INTO public.invoices(
    invoice_no,
    student_id,
    term_id,
    amount_due,
    amount_paid,
    due_date,
    status,
    line_items,
    generated_by
  )
  VALUES(
    v_inv,
    p_student_id,
    p_term_id,
    v_total_due,
    v_current_paid,
    v_due_date,
    CASE
      WHEN v_total_due <= 0 THEN 'issued'
      WHEN v_current_paid >= v_total_due THEN 'paid'
      WHEN v_current_paid > 0 THEN 'part_paid'
      WHEN v_due_date IS NOT NULL AND v_due_date < current_date THEN 'overdue'
      ELSE 'issued'
    END,
    v_lines,
    auth.uid()
  )
  ON CONFLICT(student_id, term_id)
  DO UPDATE SET
    invoice_no = EXCLUDED.invoice_no,
    amount_due = EXCLUDED.amount_due,
    amount_paid = EXCLUDED.amount_paid,
    due_date = EXCLUDED.due_date,
    status = EXCLUDED.status,
    line_items = EXCLUDED.line_items;

END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_invoice_for_student_term(uuid, uuid)
TO authenticated;


CREATE OR REPLACE FUNCTION public.sync_term_invoices(p_term_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance') THEN
    RAISE EXCEPTION 'Finance administrator access required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE id = p_term_id) THEN
    RAISE EXCEPTION 'Term not found';
  END IF;

  PERFORM public.sync_student_fee_allocations(p_term_id);

  FOR r IN
    SELECT st.id
    FROM public.students st
    WHERE st.status = 'active'
  LOOP
    PERFORM public.refresh_invoice_for_student_term(r.id, p_term_id);
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_term_invoices(uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

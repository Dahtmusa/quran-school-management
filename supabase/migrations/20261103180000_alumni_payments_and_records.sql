-- Alumni records page: take payments against an alumni's outstanding balance
-- and show their full fee, payment and report-card history.

-- Record a payment for an alumni. Same ledger as admin_record_payment
-- (payments + payment_allocations + student_fees + invoices), allocating to
-- the oldest unpaid obligation first. Deliberately does NOT call
-- sync_student_fee_allocations: that re-syncs fees for every active student in
-- the term it is given, and an alumni's term is usually in the past, where it
-- would charge later-joining students for a term they never attended.
create or replace function public.admin_record_alumni_payment(
  p_student_id uuid,
  p_amount numeric,
  p_method text default 'Cash',
  p_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students;
  v_balance numeric;
  v_term uuid;
  v_payment uuid;
  v_remaining numeric;
  v_applied numeric;
  v_fee record;
  v_t uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal','finance') then
    raise exception 'Finance access required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then raise exception 'Student not found'; end if;
  if v_student.status <> 'alumni'
     and not exists (select 1 from public.alumni_profiles where student_id = p_student_id) then
    raise exception '% is not an alumni. Record this payment from Finance instead.', v_student.full_name;
  end if;

  select coalesce(sum(amount_due - amount_paid), 0) into v_balance
    from public.student_fees
   where student_id = p_student_id and amount_paid < amount_due;
  if v_balance <= 0 then raise exception 'This alumni has no outstanding balance.'; end if;
  if round(p_amount, 2) > round(v_balance, 2) then
    raise exception 'Payment of % is more than the outstanding balance of %.', p_amount, v_balance;
  end if;

  -- File the payment under the latest term the student was charged for, so
  -- every older obligation is within its reach (matches how voiding replays
  -- the ledger in rebuild_student_fee_balances).
  select t.id into v_term
    from public.student_fees sf
    join public.fee_structures fs on fs.id = sf.fee_structure_id
    join public.terms t on (t.id = fs.term_id or (fs.term_id is null and t.academic_year_id = fs.academic_year_id))
   where sf.student_id = p_student_id
   order by t.starts_on desc
   limit 1;
  if v_term is null then raise exception 'No term found for this student''s fees.'; end if;

  insert into public.payments(student_id, term_id, amount, method, reference, notes, recorded_by)
  values (p_student_id, v_term, round(p_amount, 2), coalesce(nullif(trim(p_method), ''), 'Cash'),
          nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_payment;

  v_remaining := round(p_amount, 2);
  for v_fee in
    select sf.id, sf.amount_due, sf.amount_paid, fs.term_id,
           case when fs.term_id is null
                then (select starts_on from public.academic_years where id = fs.academic_year_id)
                else t.starts_on end as obligation_start,
           coalesce(t.term_number, 0) as term_number
      from public.student_fees sf
      join public.fee_structures fs on fs.id = sf.fee_structure_id
      left join public.terms t on t.id = fs.term_id
     where sf.student_id = p_student_id and sf.amount_paid < sf.amount_due
     order by obligation_start asc, term_number, sf.id
  loop
    exit when v_remaining <= 0;
    v_applied := least(greatest(0, v_fee.amount_due - v_fee.amount_paid), v_remaining);
    if v_applied > 0 then
      update public.student_fees set amount_paid = amount_paid + v_applied where id = v_fee.id;
      insert into public.payment_allocations(payment_id, student_fee_id, term_id, amount)
      values (v_payment, v_fee.id, coalesce(v_fee.term_id, v_term), v_applied);
      v_remaining := v_remaining - v_applied;
    end if;
  end loop;

  for v_t in select distinct term_id from public.payment_allocations where payment_id = v_payment loop
    perform public.refresh_invoice_for_student_term(p_student_id, v_t);
  end loop;
  perform public.refresh_invoice_for_student_term(p_student_id, v_term);

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'alumni:payment_recorded', 'students', p_student_id,
          jsonb_build_object('payment_id', v_payment, 'amount', round(p_amount, 2),
                             'method', coalesce(nullif(trim(p_method), ''), 'Cash'),
                             'balance_before', v_balance, 'balance_after', v_balance - round(p_amount, 2)));

  return v_payment;
end;
$$;
revoke all on function public.admin_record_alumni_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.admin_record_alumni_payment(uuid, numeric, text, text, text) to authenticated;

-- Full alumni record, now with term ids (for report-card links), payment
-- references/notes, per-term fee lines and the terms they have report data for.
create or replace function public.amqm_alumni_full(p_alumni_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumni public.alumni_profiles;
  v_result jsonb;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into v_alumni from public.alumni_profiles where id = p_alumni_id;
  if not found then raise exception 'Alumni record not found'; end if;

  select jsonb_build_object(
    'alumni', to_jsonb(v_alumni),
    'student', (select to_jsonb(s) from public.students s where s.id = v_alumni.student_id),
    'class', (
      select jsonb_build_object('id', c.id, 'name', c.name)
        from public.students s join public.classes c on c.id = s.class_id
       where s.id = v_alumni.student_id
    ),
    'teacher', (
      select jsonb_build_object('id', tp.id, 'full_name', tp.full_name,
                                'job_title', coalesce(tp.job_title, 'Quran Teacher'),
                                'phone', tp.phone, 'email', tp.email, 'photo', tp.avatar_url,
                                'signature_data', tp.signature_data)
        from public.students s
        join public.class_teachers ct on ct.class_id = s.class_id
        join public.profiles tp on tp.id = ct.teacher_id
       where s.id = v_alumni.student_id
       order by ct.is_primary desc nulls last, ct.assigned_at asc
       limit 1
    ),
    'principal', (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                'job_title', coalesce(p.job_title, 'Principal'), 'signature_data', p.signature_data)
        from public.profiles p
       where p.employment_status = 'active' and p.role in ('principal','admin')
       order by case p.role when 'principal' then 0 when 'admin' then 1 else 2 end, p.created_at asc
       limit 1
    ),
    'director', (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                'job_title', coalesce(p.job_title, 'Director'), 'signature_data', p.signature_data)
        from public.profiles p
       where p.employment_status = 'active' and p.role = 'super_admin'
       order by p.created_at asc
       limit 1
    ),
    'certificates', (
      select coalesce(jsonb_agg(to_jsonb(gc) order by gc.issued_at desc), '[]'::jsonb)
        from public.graduation_certificates gc
       where gc.alumni_id = v_alumni.id
    ),
    'evaluations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'term_id', t.id, 'term', t.name, 'evaluation_number', e.evaluation_number,
        'status', e.status, 'from_surah', e.from_surah, 'from_ayah', e.from_ayah,
        'to_surah', e.to_surah, 'to_ayah', e.to_ayah, 'score', e.score, 'grade', e.grade,
        'memorization_score', e.memorization_score, 'accuracy_score', e.accuracy_score,
        'fluency_score', e.fluency_score, 'tajweed_score', e.tajweed_score,
        'retention_score', e.retention_score, 'teacher_comment', e.teacher_comment,
        'approved_at', e.approved_at
      ) order by t.starts_on, e.evaluation_number), '[]'::jsonb)
        from public.evaluations e join public.terms t on t.id = e.term_id
       where e.student_id = v_alumni.student_id
    ),
    'report_terms', (
      select coalesce(jsonb_agg(x order by x->>'starts_on'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'term_id', t.id, 'term', t.name, 'academic_year', ay.name, 'starts_on', t.starts_on,
                 'approved', count(*) filter (where e.status = 'approved'),
                 'total', count(*)) as x
          from public.evaluations e
          join public.terms t on t.id = e.term_id
          left join public.academic_years ay on ay.id = t.academic_year_id
         where e.student_id = v_alumni.student_id
         group by t.id, t.name, ay.name, t.starts_on
      ) r
    ),
    'fees', (
      select jsonb_build_object(
        'total_due', coalesce(sum(amount_due), 0),
        'total_paid', coalesce(sum(amount_paid), 0),
        'outstanding', coalesce(sum(greatest(0, amount_due - amount_paid)), 0))
        from public.student_fees where student_id = v_alumni.student_id
    ),
    'fee_lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sf.id, 'name', fs.name, 'amount_due', sf.amount_due, 'amount_paid', sf.amount_paid,
        'balance', greatest(0, sf.amount_due - sf.amount_paid),
        'term_id', fs.term_id, 'term', coalesce(t.name, ay.name), 'academic_year', ay.name
      ) order by coalesce(t.starts_on, ay.starts_on), sf.id), '[]'::jsonb)
        from public.student_fees sf
        join public.fee_structures fs on fs.id = sf.fee_structure_id
        left join public.terms t on t.id = fs.term_id
        left join public.academic_years ay on ay.id = fs.academic_year_id
       where sf.student_id = v_alumni.student_id
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method,
        'reference', p.reference, 'notes', p.notes, 'term_id', p.term_id, 'term', t.name,
        'term_number', t.term_number, 'academic_year', ay.name
      ) order by p.paid_on desc, p.id), '[]'::jsonb)
        from public.payments p
        left join public.terms t on t.id = p.term_id
        left join public.academic_years ay on ay.id = t.academic_year_id
       where p.student_id = v_alumni.student_id
    )
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function public.amqm_alumni_full(uuid) to authenticated;

notify pgrst, 'reload schema';

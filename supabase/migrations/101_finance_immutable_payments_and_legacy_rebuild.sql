alter table public.payments add column if not exists voided_at timestamptz;
alter table public.payments add column if not exists voided_by uuid references public.profiles(id);
alter table public.payments add column if not exists void_reason text;

create or replace function public.rebuild_student_fee_balances(p_student_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare pay record; fee record; remaining numeric; applied numeric; payment_date date;
begin
  if public.my_role() not in ('super_admin','admin','principal','finance') then raise exception 'Finance access required'; end if;
  delete from public.payment_allocations pa using public.payments p where pa.payment_id=p.id and p.student_id=p_student_id;
  update public.student_fees set amount_paid=0 where student_id=p_student_id;
  for pay in select p.id,p.term_id,p.amount,p.paid_on from public.payments p where p.student_id=p_student_id and p.voided_at is null order by p.paid_on,p.id loop
    payment_date:=pay.paid_on::date;
    if pay.term_id is not null then select t.starts_on into payment_date from public.terms t where t.id=pay.term_id; end if;
    remaining:=round(coalesce(pay.amount,0),2);
    for fee in select sf.id,sf.amount_due,sf.amount_paid,fs.term_id,fs.academic_year_id,case when fs.term_id is null then ay.starts_on else t.starts_on end obligation_start,coalesce(t.term_number,0) term_number from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id left join public.terms t on t.id=fs.term_id left join public.academic_years ay on ay.id=fs.academic_year_id where sf.student_id=p_student_id and ((fs.term_id is not null and t.starts_on<=payment_date) or (fs.term_id is null and ay.starts_on<=payment_date)) order by obligation_start,term_number,sf.id loop
      exit when remaining<=0;
      applied:=least(greatest(0,fee.amount_due-fee.amount_paid),remaining);
      if applied>0 then
        update public.student_fees set amount_paid=amount_paid+applied where id=fee.id;
        insert into public.payment_allocations(payment_id,student_fee_id,term_id,amount) values(pay.id,fee.id,coalesce(fee.term_id,pay.term_id,(select id from public.terms where starts_on<=payment_date order by starts_on desc,term_number desc limit 1)),applied);
        remaining:=remaining-applied;
      end if;
    end loop;
    if remaining>0.01 then
      insert into public.student_fee_credits(student_id,source_payment_id,amount,remaining_amount,note) values(p_student_id,pay.id,remaining,remaining,'Legacy payment amount not matched to a fee obligation during balance rebuild.') on conflict do nothing;
    end if;
  end loop;
end;
$$;
grant execute on function public.rebuild_student_fee_balances(uuid) to authenticated;

create or replace function public.admin_void_payment(p_payment_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_student_id uuid; v_term_id uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal','finance') then raise exception 'Finance access required'; end if;
  select student_id into v_student_id from public.payments where id=p_payment_id and voided_at is null;
  if not found then raise exception 'Payment not found or already voided'; end if;
  update public.payments set voided_at=now(),voided_by=auth.uid(),void_reason=coalesce(nullif(trim(p_reason),''),'Voided by authorised finance administrator') where id=p_payment_id;
  perform public.rebuild_student_fee_balances(v_student_id);
  for v_term_id in select term_id from public.invoices where student_id=v_student_id and status<>'void' loop perform public.refresh_invoice_for_student_term(v_student_id,v_term_id); end loop;
end;
$$;
grant execute on function public.admin_void_payment(uuid,text) to authenticated;

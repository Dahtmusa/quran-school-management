-- AMQM fee exemptions
-- Fee exemptions are term-specific. Exempted students keep their student/history records,
-- but the current term fee obligation is not created, no payments may be recorded for
-- that term, and unpaid invoices for that term are voided.

create table if not exists public.student_fee_exemptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  reason text not null,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_fee_exemptions_student_term_key unique (student_id, term_id),
  constraint student_fee_exemptions_reason_check check (length(trim(reason)) > 0)
);

create index if not exists idx_student_fee_exemptions_term_active
  on public.student_fee_exemptions(term_id, active);
create index if not exists idx_student_fee_exemptions_student
  on public.student_fee_exemptions(student_id);

alter table public.student_fee_exemptions enable row level security;

drop policy if exists "finance manage fee exemptions" on public.student_fee_exemptions;
create policy "finance manage fee exemptions"
  on public.student_fee_exemptions
  for all to authenticated
  using (public.my_role() in ('super_admin','admin','principal','finance'))
  with check (public.my_role() in ('super_admin','admin','principal','finance'));

-- Keep created_by correct for direct browser inserts.
create or replace function public.set_fee_exemption_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_fee_exemption_actor on public.student_fee_exemptions;
create trigger trg_set_fee_exemption_actor
before insert or update on public.student_fee_exemptions
for each row execute function public.set_fee_exemption_actor();

-- An exemption cannot be added after money has already been recorded for that term.
-- Existing payment history remains immutable.
create or replace function public.guard_fee_exemption_payment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active then
    if exists (
      select 1
      from public.payments p
      where p.student_id = new.student_id
        and p.term_id = new.term_id
        and p.voided_at is null
    ) then
      raise exception 'Cannot exempt this student for the selected term because a payment has already been recorded for that term.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_fee_exemption_payment_history on public.student_fee_exemptions;
create trigger trg_guard_fee_exemption_payment_history
before insert or update of active, student_id, term_id on public.student_fee_exemptions
for each row execute function public.guard_fee_exemption_payment_history();

-- Once active, remove current-term fee obligations and void unpaid invoices.
create or replace function public.apply_fee_exemption_to_finance_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active then
    delete from public.student_fees sf
    using public.fee_structures fs
    where sf.fee_structure_id = fs.id
      and sf.student_id = new.student_id
      and (
        fs.term_id = new.term_id
        or (
          fs.term_id is null
          and fs.academic_year_id = (select t.academic_year_id from public.terms t where t.id = new.term_id)
        )
      );

    update public.invoices
       set status = 'void',
           updated_at = now()
     where student_id = new.student_id
       and term_id = new.term_id
       and coalesce(amount_paid, 0) = 0
       and coalesce(status, '') <> 'void';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_fee_exemption_to_finance_records on public.student_fee_exemptions;
create trigger trg_apply_fee_exemption_to_finance_records
after insert or update of active on public.student_fee_exemptions
for each row execute function public.apply_fee_exemption_to_finance_records();

-- Fee allocation syncs use the same student_fees table. Silently skip an exempt
-- student's fee row so bulk synchronization never fails because one learner is exempt.
create or replace function public.skip_exempt_student_fee_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_term_id uuid; v_year_id uuid;
begin
  select fs.term_id, fs.academic_year_id into v_term_id, v_year_id
  from public.fee_structures fs
  where fs.id = new.fee_structure_id;

  if exists (
    select 1
    from public.student_fee_exemptions e
    join public.terms et on et.id = e.term_id
    where e.student_id = new.student_id
      and e.active
      and (
        e.term_id = v_term_id
        or (v_term_id is null and et.academic_year_id = v_year_id)
      )
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_skip_exempt_student_fee_row on public.student_fees;
create trigger trg_skip_exempt_student_fee_row
before insert or update of student_id, fee_structure_id on public.student_fees
for each row execute function public.skip_exempt_student_fee_row();

-- Defense in depth: no payment can be recorded for an actively exempt learner.
create or replace function public.guard_exempt_student_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.student_fee_exemptions e
    where e.student_id = new.student_id
      and e.term_id = new.term_id
      and e.active
  ) then
    raise exception 'This student is exempted from school fees for the selected term. No payment should be recorded.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_exempt_student_payment on public.payments;
create trigger trg_guard_exempt_student_payment
before insert on public.payments
for each row execute function public.guard_exempt_student_payment();

grant select, insert, update, delete on public.student_fee_exemptions to authenticated;
revoke all on function public.set_fee_exemption_actor() from public;
revoke all on function public.guard_fee_exemption_payment_history() from public;
revoke all on function public.apply_fee_exemption_to_finance_records() from public;
revoke all on function public.skip_exempt_student_fee_row() from public;
revoke all on function public.guard_exempt_student_payment() from public;

notify pgrst, 'reload schema';

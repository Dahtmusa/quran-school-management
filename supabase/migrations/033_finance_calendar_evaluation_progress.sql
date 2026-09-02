-- AMQM production hardening: evaluation campaign ambiguity, simpler calendar windows,
-- term naming, fee allocation/reporting, bank settings, and absolute Qur'an progress.

-- Human-friendly term names used throughout the school UI.
update public.terms
set name = case term_number when 1 then 'First Term' when 2 then 'Second Term' when 3 then 'Third Term' else name end
where term_number in (1,2,3);

-- Keep newly-created terms consistent with the same naming convention.
create or replace function public.ensure_academic_term(
  p_year_name text,
  p_year_start date,
  p_year_end date,
  p_term_number smallint,
  p_term_start date,
  p_term_end date
) returns uuid
language plpgsql security definer set search_path=public as $$
declare ay_id uuid; t_id uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  if p_term_number not between 1 and 3 then raise exception 'Term number must be 1, 2 or 3'; end if;
  insert into public.academic_years(name,starts_on,ends_on,is_current)
  values(trim(p_year_name),p_year_start,p_year_end,(current_date between p_year_start and p_year_end))
  on conflict(name) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on,is_current=excluded.is_current
  returning id into ay_id;
  if (select is_current from public.academic_years where id=ay_id) then
    update public.academic_years set is_current=false where id<>ay_id;
    update public.academic_years set is_current=true where id=ay_id;
  end if;
  insert into public.terms(academic_year_id,name,term_number,starts_on,ends_on)
  values(ay_id,case p_term_number when 1 then 'First Term' when 2 then 'Second Term' else 'Third Term' end,p_term_number,p_term_start,p_term_end)
  on conflict(academic_year_id,term_number) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on,name=excluded.name
  returning id into t_id;
  return t_id;
end $$;
grant execute on function public.ensure_academic_term(text,date,date,smallint,date,date) to authenticated;

-- Fix the PL/pgSQL variable/column name collision that caused:
-- "column reference campaign_id is ambiguous".
create or replace function public.create_evaluation_campaign(
  p_term_id uuid,
  p_evaluation_number smallint,
  p_title text,
  p_calendar_event_id uuid,
  p_class_ids uuid[]
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_campaign_id uuid; v_class_id uuid; ev public.school_calendar_events; s record; teacher uuid; missing_count integer;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  if p_evaluation_number not between 1 and 3 then raise exception 'Evaluation number must be 1, 2 or 3'; end if;
  select * into ev from public.school_calendar_events where id=p_calendar_event_id;
  if ev.id is null then raise exception 'Select a calendar evaluation window'; end if;
  if ev.event_type <> ('evaluation_'||p_evaluation_number) then raise exception 'Calendar event type must match Evaluation %',p_evaluation_number; end if;
  if ev.starts_at is null or ev.ends_at is null then raise exception 'Evaluation calendar event needs both opening and closing times'; end if;
  if ev.term_id is distinct from p_term_id then raise exception 'Calendar event is linked to a different term'; end if;
  if coalesce(array_length(p_class_ids,1),0)=0 then raise exception 'Select at least one class'; end if;
  if p_evaluation_number>1 then
    select count(*) into missing_count
    from public.students st
    where st.status='active' and st.class_id=any(p_class_ids)
      and not exists(select 1 from public.evaluations e where e.student_id=st.id and e.term_id=p_term_id and e.evaluation_number=p_evaluation_number-1 and e.status='approved');
    if missing_count>0 then raise exception 'Evaluation % cannot open yet: % student(s) in the selected classes still need Evaluation % approved.',p_evaluation_number,missing_count,p_evaluation_number-1; end if;
  end if;
  insert into public.evaluation_campaigns(term_id,evaluation_number,title,calendar_event_id,opens_at,closes_at,created_by)
  values(p_term_id,p_evaluation_number,trim(p_title),p_calendar_event_id,ev.starts_at,ev.ends_at,auth.uid())
  returning id into v_campaign_id;
  foreach v_class_id in array p_class_ids loop
    insert into public.evaluation_campaign_classes(campaign_id,class_id) values(v_campaign_id,v_class_id) on conflict do nothing;
  end loop;
  for s in
    select distinct st.*
    from public.students st
    join public.evaluation_campaign_classes ecc on ecc.class_id=st.class_id
    where ecc.campaign_id=v_campaign_id and st.status='active'
  loop
    select ct.teacher_id into teacher
    from public.class_teachers ct
    where ct.class_id=s.class_id
    order by ct.is_primary desc,ct.assigned_at asc limit 1;
    if teacher is not null then
      insert into public.evaluations(
        student_id,teacher_id,term_id,evaluation_number,status,teacher_visible,teacher_visible_at,campaign_id,
        from_surah,from_ayah,to_surah,to_ayah
      ) values(
        s.id,teacher,p_term_id,p_evaluation_number,'draft',false,null,v_campaign_id,
        s.current_surah,s.current_ayah,s.current_surah,s.current_ayah
      ) on conflict(student_id,term_id,evaluation_number) do update set campaign_id=excluded.campaign_id;
    end if;
  end loop;
  return v_campaign_id;
end $$;
grant execute on function public.create_evaluation_campaign(uuid,smallint,text,uuid,uuid[]) to authenticated;

-- The window worker is an internal operation; teachers/admin clients do not need direct execution.
revoke execute on function public.refresh_evaluation_windows() from authenticated;

-- Allow one fee allocation per student/fee structure so fee edits can safely synchronize balances.
create unique index if not exists student_fees_student_structure_uidx on public.student_fees(student_id,fee_structure_id);

-- Allocate configured fees to active students for a term. Term-null structures apply to every term
-- in that academic year; term-specific structures apply only to their own term.
create or replace function public.sync_student_fee_allocations(p_term_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if public.my_role() not in ('super_admin','admin','principal','finance') then raise exception 'Finance administrator access required'; end if;
  if p_term_id is null then raise exception 'Term is required'; end if;
  insert into public.student_fees(student_id,fee_structure_id,amount_due)
  select st.id,fs.id,fs.amount
  from public.students st
  join public.terms t on t.id=p_term_id
  join public.fee_structures fs on fs.academic_year_id=t.academic_year_id
    and (fs.term_id is null or fs.term_id=p_term_id)
    and fs.section=st.section
  where st.status='active'
  on conflict(student_id,fee_structure_id) do update set amount_due=excluded.amount_due;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.sync_student_fee_allocations(uuid) to authenticated;

-- Bank/account settings are stored in the existing CMS settings table under school_payment.
insert into public.site_settings(key,value)
values('school_payment','{"bank_name":"","account_name":"","account_number":"","reference_instruction":""}'::jsonb)
on conflict(key) do nothing;

-- Realtime finance updates where the project's publication supports them.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.payments'; exception when duplicate_object then null; when undefined_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.student_fees'; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

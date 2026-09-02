-- Evaluation campaigns, calendar-driven windows, automatic submission, term completion,
-- student promotion, report cards, and next-term invoices.

alter table public.school_calendar_events
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists term_id uuid references public.terms(id) on delete set null,
  add column if not exists evaluation_number smallint check (evaluation_number between 1 and 3);

create table if not exists public.evaluation_campaigns (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  evaluation_number smallint not null check(evaluation_number between 1 and 3),
  title text not null,
  calendar_event_id uuid references public.school_calendar_events(id) on delete set null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','open','closed','completed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(closes_at > opens_at),
  unique(term_id,evaluation_number)
);

create table if not exists public.evaluation_campaign_classes (
  campaign_id uuid not null references public.evaluation_campaigns(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key(campaign_id,class_id)
);

alter table public.evaluations
  add column if not exists campaign_id uuid references public.evaluation_campaigns(id) on delete set null,
  add column if not exists auto_submitted boolean not null default false,
  add column if not exists returned_at timestamptz;

create index if not exists evaluation_campaign_window_idx on public.evaluation_campaigns(opens_at,closes_at,status);
create index if not exists evaluation_campaign_class_idx on public.evaluation_campaign_classes(class_id,campaign_id);
create index if not exists evaluations_campaign_idx on public.evaluations(campaign_id,status);

alter table public.evaluation_campaigns enable row level security;
alter table public.evaluation_campaign_classes enable row level security;

drop policy if exists "admins manage evaluation campaigns" on public.evaluation_campaigns;
create policy "admins manage evaluation campaigns" on public.evaluation_campaigns for all to authenticated
using(public.my_role() in ('super_admin','admin','principal'))
with check(public.my_role() in ('super_admin','admin','principal'));

drop policy if exists "authorized users read evaluation campaigns" on public.evaluation_campaigns;
create policy "authorized users read evaluation campaigns" on public.evaluation_campaigns for select to authenticated
using(
  public.my_role() in ('super_admin','admin','principal')
  or exists(select 1 from public.evaluations e where e.campaign_id=evaluation_campaigns.id and e.teacher_id=auth.uid())
);

drop policy if exists "admins manage campaign classes" on public.evaluation_campaign_classes;
create policy "admins manage campaign classes" on public.evaluation_campaign_classes for all to authenticated
using(public.my_role() in ('super_admin','admin','principal'))
with check(public.my_role() in ('super_admin','admin','principal'));

drop policy if exists "teachers read assigned campaign classes" on public.evaluation_campaign_classes;
create policy "teachers read assigned campaign classes" on public.evaluation_campaign_classes for select to authenticated
using(exists(select 1 from public.class_teachers ct where ct.class_id=evaluation_campaign_classes.class_id and ct.teacher_id=auth.uid()));

-- Academic calendar helper. This creates the real operational academic year/term rows used by evaluations.
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
  values(ay_id,'Term '||p_term_number,p_term_number,p_term_start,p_term_end)
  on conflict(academic_year_id,term_number) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on,name=excluded.name
  returning id into t_id;
  return t_id;
end $$;
grant execute on function public.ensure_academic_term(text,date,date,smallint,date,date) to authenticated;

-- Create an evaluation campaign and seed one draft record per active student in the selected classes.
create or replace function public.create_evaluation_campaign(
  p_term_id uuid,
  p_evaluation_number smallint,
  p_title text,
  p_calendar_event_id uuid,
  p_class_ids uuid[]
) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; campaign_id uuid; ev public.school_calendar_events; s record; teacher uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  if p_evaluation_number not between 1 and 3 then raise exception 'Evaluation number must be 1, 2 or 3'; end if;
  select * into ev from public.school_calendar_events where id=p_calendar_event_id;
  if ev.id is null then raise exception 'Select a calendar evaluation window'; end if;
  if ev.event_type <> ('evaluation_'||p_evaluation_number) then raise exception 'Calendar event type must match Evaluation %',p_evaluation_number; end if;
  if ev.starts_at is null or ev.ends_at is null then raise exception 'Evaluation calendar event needs both opening and closing times'; end if;
  if ev.term_id is distinct from p_term_id then raise exception 'Calendar event is linked to a different term'; end if;
  if coalesce(array_length(p_class_ids,1),0)=0 then raise exception 'Select at least one class'; end if;

  insert into public.evaluation_campaigns(term_id,evaluation_number,title,calendar_event_id,opens_at,closes_at,created_by)
  values(p_term_id,p_evaluation_number,trim(p_title),p_calendar_event_id,ev.starts_at,ev.ends_at,auth.uid())
  returning id into campaign_id;

  foreach cid in array p_class_ids loop
    insert into public.evaluation_campaign_classes(campaign_id,class_id) values(campaign_id,cid) on conflict do nothing;
  end loop;

  for s in
    select distinct st.*
    from public.students st
    join public.evaluation_campaign_classes ecc on ecc.class_id=st.class_id
    where ecc.campaign_id=campaign_id and st.status='active'
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
        s.id,teacher,p_term_id,p_evaluation_number,'draft',false,null,campaign_id,
        s.current_surah,s.current_ayah,s.current_surah,s.current_ayah
      ) on conflict(student_id,term_id,evaluation_number) do update set campaign_id=excluded.campaign_id;
    end if;
  end loop;
  return campaign_id;
end $$;
grant execute on function public.create_evaluation_campaign(uuid,smallint,text,uuid,uuid[]) to authenticated;

-- Campaign state is derived from the calendar window. Teachers only see open draft records.
create or replace function public.refresh_evaluation_windows()
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.evaluation_campaigns
  set status=case when now()<opens_at then 'scheduled' when now()<closes_at then 'open' else 'closed' end,
      updated_at=now()
  where status <> 'completed';

  update public.evaluations e
  set teacher_visible=true,teacher_visible_at=coalesce(teacher_visible_at,now())
  from public.evaluation_campaigns c
  where e.campaign_id=c.id and e.status='draft' and now() between c.opens_at and c.closes_at;

  update public.evaluations e
  set status='pending_approval',submitted_at=coalesce(submitted_at,now()),teacher_visible=false,auto_submitted=true
  from public.evaluation_campaigns c
  where e.campaign_id=c.id and e.status='draft' and now()>=c.closes_at;

  update public.evaluation_campaigns c
  set status='closed',updated_at=now()
  where c.status='open' and now()>=c.closes_at;
end $$;

grant execute on function public.refresh_evaluation_windows() to authenticated;

-- Teachers can only see their active campaign drafts or records explicitly returned by Admin.
drop policy if exists "teachers see pushed assigned evaluations" on public.evaluations;
create policy "teachers see campaign evaluations" on public.evaluations for select to authenticated using(
  public.my_role() in ('super_admin','admin','principal')
  or ((teacher_id=auth.uid()) and (
    (status='returned' and teacher_visible=true)
    or (status='draft' and exists(select 1 from public.evaluation_campaigns c where c.id=evaluations.campaign_id and now() between c.opens_at and c.closes_at))
  ))
  or ((status='approved') and exists(select 1 from public.parent_students ps where ps.student_id=evaluations.student_id and ps.parent_id=auth.uid()))
);

drop policy if exists "teachers update visible evaluations" on public.evaluations;
create policy "teachers update active evaluations" on public.evaluations for update to authenticated
using(
 public.my_role() in ('super_admin','admin','principal')
 or (teacher_id=auth.uid() and public.my_role()='teacher' and (
   status='returned' and teacher_visible=true
   or status='draft' and exists(select 1 from public.evaluation_campaigns c where c.id=evaluations.campaign_id and now() between c.opens_at and c.closes_at)
 ))
with check(public.my_role() in ('super_admin','admin','principal') or (teacher_id=auth.uid() and public.my_role()='teacher'));

-- Teacher submission must close teacher visibility immediately.
create or replace function public.finalize_teacher_evaluation_submission()
returns trigger language plpgsql security invoker as $$
begin
  if public.my_role()='teacher' and new.status='pending_approval' and old.status in ('draft','returned') then
    new.teacher_visible=false;
    new.submitted_at=coalesce(new.submitted_at,now());
  end if;
  return new;
end $$;
drop trigger if exists teacher_evaluation_submit_visibility on public.evaluations;
create trigger teacher_evaluation_submit_visibility before update on public.evaluations
for each row execute function public.finalize_teacher_evaluation_submission();

-- Term completion: all active students in the term must have three approved evaluations.
create table if not exists public.term_completions (
  term_id uuid primary key references public.terms(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id),
  notes text
);
alter table public.term_completions enable row level security;
drop policy if exists "admins manage term completions" on public.term_completions;
create policy "admins manage term completions" on public.term_completions for all to authenticated
using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "authorized users read term completions" on public.term_completions;
create policy "authorized users read term completions" on public.term_completions for select to authenticated using(true);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  amount_due numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  due_date date,
  status text not null default 'issued' check(status in ('draft','issued','part_paid','paid','overdue','void')),
  line_items jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id),
  unique(student_id,term_id)
);
alter table public.invoices enable row level security;
drop policy if exists "admins manage invoices" on public.invoices;
create policy "admins manage invoices" on public.invoices for all to authenticated using(public.my_role() in ('super_admin','admin','principal','finance')) with check(public.my_role() in ('super_admin','admin','principal','finance'));
drop policy if exists "parents read own invoices" on public.invoices;
create policy "parents read own invoices" on public.invoices for select to authenticated using(
 public.my_role() in ('super_admin','admin','principal','finance')
 or exists(select 1 from public.parent_students ps where ps.student_id=invoices.student_id and ps.parent_id=auth.uid())
);

create or replace function public.complete_term(p_term_id uuid,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare missing_count integer; next_term_id uuid; n integer; s record; fee numeric; inv_no text;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select count(*) into missing_count
  from public.students s
  where s.status='active'
    and not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=1 and e.status='approved')
     or (s.status='active' and not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=2 and e.status='approved'))
     or (s.status='active' and not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=3 and e.status='approved'));
  if missing_count>0 then raise exception 'Term cannot be completed: % active student(s) still have an unapproved evaluation.',missing_count; end if;

  insert into public.term_completions(term_id,completed_by,notes) values(p_term_id,auth.uid(),p_notes)
  on conflict(term_id) do update set completed_at=now(),completed_by=auth.uid(),notes=excluded.notes;

  -- Find the next operational term across academic years.
  select t.id,t.term_number into next_term_id,n from public.terms t join public.terms cur on cur.id=p_term_id join public.academic_years ay on ay.id=t.academic_year_id join public.academic_years cay on cay.id=cur.academic_year_id
  where (t.academic_year_id=cur.academic_year_id and t.term_number=cur.term_number+1)
     or (cur.term_number=3 and ay.starts_on>cay.starts_on and t.term_number=1)
  order by ay.starts_on,t.term_number limit 1;

  if next_term_id is not null then
    for s in select * from public.students where status='active' loop
      select coalesce(sum(fs.amount),0) into fee
      from public.fee_structures fs where fs.term_id=next_term_id and fs.section=s.section;
      if fee=0 then
        select coalesce(sum(fs.amount),0) into fee from public.fee_structures fs where fs.term_id=next_term_id;
      end if;
      inv_no:='AMQM/INV/'||extract(year from current_date)::int||'/'||upper(substr(replace(s.admission_no,'/',''),1,12))||'/T'||(select term_number from public.terms where id=next_term_id);
      insert into public.invoices(invoice_no,student_id,term_id,amount_due,due_date,line_items,generated_by)
      values(inv_no,s.id,next_term_id,fee,(select ends_on from public.terms where id=next_term_id),jsonb_build_array(jsonb_build_object('description','Next term school fees','amount',fee)),auth.uid())
      on conflict(student_id,term_id) do update set amount_due=excluded.amount_due,line_items=excluded.line_items,due_date=excluded.due_date;
    end loop;

    -- Year 1 Term 3 -> Year 2 for active students. The Quran current position is intentionally untouched.
    if (select term_number from public.terms where id=p_term_id)=3 then
      update public.students set program_year='year_2' where status='active' and program_year='year_1';
    end if;
  end if;

  return jsonb_build_object('term_id',p_term_id,'completed',true,'next_term_id',next_term_id,'next_term_invoices_generated',(select count(*) from public.invoices where term_id=next_term_id));
end $$;
grant execute on function public.complete_term(uuid,text) to authenticated;

-- Keep operational windows moving without requiring a user to open a page.
do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
    perform cron.schedule('amqm-evaluation-window-worker','*/5 * * * *','select public.refresh_evaluation_windows();');
  exception when others then
    raise notice 'pg_cron could not be enabled automatically: %',sqlerrm;
  end;
end $$;

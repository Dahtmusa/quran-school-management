-- AMQM academic session + term lifecycle v2
-- A controlled state machine for term progression, session closure and new-session opening.
-- Historical First Term remains handled by the existing protected import transition.

alter table public.academic_years
  add column if not exists lifecycle_status text not null default 'scheduled',
  add column if not exists opened_at timestamptz,
  add column if not exists opened_by uuid references public.profiles(id),
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id),
  add column if not exists predecessor_year_id uuid references public.academic_years(id),
  add column if not exists closure_notes text;

alter table public.academic_years
  drop constraint if exists academic_years_lifecycle_status_check;
alter table public.academic_years
  add constraint academic_years_lifecycle_status_check
  check (lifecycle_status in ('draft','scheduled','open','closed','archived'));

alter table public.terms
  drop constraint if exists terms_lifecycle_status_check;
alter table public.terms
  add constraint terms_lifecycle_status_check
  check (lifecycle_status in ('historical_baseline','historical_closed','scheduled','prepared','digital_active','digital_closed'));

create unique index if not exists ux_academic_year_one_current
  on public.academic_years((is_current)) where is_current=true;
create unique index if not exists ux_terms_one_current
  on public.terms((is_current)) where is_current=true;

-- Backfill lifecycle state without changing the active cycle.
update public.academic_years
set lifecycle_status='open',
    opened_at=coalesce(opened_at, now())
where is_current=true;

update public.academic_years
set lifecycle_status='scheduled'
where is_current=false and lifecycle_status is null;

create table if not exists public.academic_cycle_events (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid references public.academic_years(id) on delete set null,
  term_id uuid references public.terms(id) on delete set null,
  action text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_academic_cycle_events_year
  on public.academic_cycle_events(academic_year_id, created_at desc);
create index if not exists idx_academic_cycle_events_term
  on public.academic_cycle_events(term_id, created_at desc);

alter table public.academic_cycle_events enable row level security;
drop policy if exists "admins read cycle events" on public.academic_cycle_events;
create policy "admins read cycle events"
on public.academic_cycle_events for select to authenticated
using (public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "admins write cycle events" on public.academic_cycle_events;
create policy "admins write cycle events"
on public.academic_cycle_events for all to authenticated
using (public.my_role() in ('super_admin','admin','principal'))
with check (public.my_role() in ('super_admin','admin','principal'));

grant select on public.academic_cycle_events to authenticated;

create or replace function public.amqm_cycle_snapshot()
returns jsonb
language sql
security definer
set search_path=public
as $$
with cur as (
  select s.current_academic_year_id ay_id, s.current_term_id term_id
  from public.academic_cycle_settings s
  where s.id=true
),
ay as (
  select a.*
  from public.academic_years a
  join cur on cur.ay_id=a.id
),
ct as (
  select t.*
  from public.terms t
  join cur on cur.term_id=t.id
),
next_term as (
  select t.*
  from public.terms t
  join ct c on true
  where t.starts_on > c.starts_on
  order by t.starts_on, t.term_number
  limit 1
),
next_session as (
  select a.*
  from public.academic_years a
  left join ay c on true
  where a.lifecycle_status='scheduled'
    and (c.id is null or a.starts_on>c.starts_on)
  order by a.starts_on
  limit 1
),
missing_evals as (
  select count(*) n
  from public.students s
  join ct c on true
  where s.status='active'
    and c.lifecycle_status='digital_active'
    and (
      select count(*)
      from public.evaluations e
      where e.student_id=s.id
        and e.term_id=c.id
        and e.status='approved'
        and e.evaluation_number between 1 and 3
    ) < 3
),
placement as (
  select count(*) n
  from public.students s
  join next_term nt on true
  where s.status='active'
    and nt.term_number=1
    and not exists (
      select 1
      from public.student_enrollments se
      where se.student_id=s.id
        and se.term_id=nt.id
        and se.status='active'
        and se.class_id is not null
    )
),
session_placement as (
  select count(*) n
  from public.students s
  join next_session ns on true
  join public.terms nt on nt.academic_year_id=ns.id and nt.term_number=1
  where s.status='active'
    and not exists (
      select 1 from public.student_enrollments se
      where se.student_id=s.id and se.term_id=nt.id
        and se.status='active' and se.class_id is not null
    )
)
select jsonb_build_object(
  'session', (select jsonb_build_object(
    'id',ay.id,'name',ay.name,'starts_on',ay.starts_on,'ends_on',ay.ends_on,
    'status',ay.lifecycle_status,'is_current',ay.is_current,
    'opened_at',ay.opened_at,'closed_at',ay.closed_at
  ) from ay),
  'current_term', (select jsonb_build_object(
    'id',ct.id,'name',ct.name,'term_number',ct.term_number,
    'starts_on',ct.starts_on,'ends_on',ct.ends_on,
    'status',ct.lifecycle_status,'is_current',ct.is_current
  ) from ct),
  'next_term', (select jsonb_build_object(
    'id',next_term.id,'name',next_term.name,'term_number',next_term.term_number,
    'starts_on',next_term.starts_on,'ends_on',next_term.ends_on,
    'status',next_term.lifecycle_status,'academic_year_id',next_term.academic_year_id
  ) from next_term),
  'next_session', (select jsonb_build_object(
    'id',next_session.id,'name',next_session.name,
    'starts_on',next_session.starts_on,'ends_on',next_session.ends_on,
    'status',next_session.lifecycle_status
  ) from next_session),
  'missing_current_evaluations',(select n from missing_evals),
  'next_term_placement_pending',(select n from placement),
  'next_session_placement_pending',(select n from session_placement),
  'can_close_current_term',(
    select (ct.id is not null and ct.lifecycle_status='digital_active' and missing_evals.n=0)
    from ct cross join missing_evals
  ),
  'can_open_next_term',(
    select (
      next_term.id is not null
      and next_term.lifecycle_status='prepared'
      and next_term.starts_on <= current_date
    ) from next_term
  ),
  'can_close_session',(
    select (
      ay.id is not null
      and ay.lifecycle_status='open'
      and not exists(select 1 from public.terms t where t.academic_year_id=ay.id and t.lifecycle_status not in ('historical_closed','digital_closed'))
      and not exists(select 1 from public.academic_cycle_settings s where s.id=true and s.current_academic_year_id=ay.id and s.current_term_id is not null)
    ) from ay
  ),
  'can_open_next_session',(
    select (next_session.id is not null and next_session.starts_on <= current_date)
    from next_session
  )
);
$$;

grant execute on function public.amqm_cycle_snapshot() to authenticated;

create or replace function public.ensure_academic_term(
  p_year_name text,
  p_year_start date,
  p_year_end date,
  p_term_number smallint,
  p_term_start date,
  p_term_end date
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare ay_id uuid; t_id uuid; existing_is_current boolean; existing_status text;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if p_term_number not between 1 and 3 then
    raise exception 'Term number must be 1, 2 or 3';
  end if;
  if p_year_start > p_year_end then
    raise exception 'Session start date must be before session end date';
  end if;
  if p_term_start > p_term_end then
    raise exception 'Term start date must be before term end date';
  end if;

  select is_current,lifecycle_status
    into existing_is_current,existing_status
  from public.academic_years
  where name=trim(p_year_name);

  insert into public.academic_years(
    name,starts_on,ends_on,is_current,lifecycle_status
  )
  values(
    trim(p_year_name),p_year_start,p_year_end,
    coalesce(existing_is_current,false),
    coalesce(existing_status,'scheduled')
  )
  on conflict(name) do update set
    starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    is_current=public.academic_years.is_current,
    lifecycle_status=public.academic_years.lifecycle_status
  returning id into ay_id;

  insert into public.terms(
    academic_year_id,name,term_number,starts_on,ends_on,
    lifecycle_status,is_current
  )
  values(
    ay_id,
    case p_term_number when 1 then 'First Term' when 2 then 'Second Term' else 'Third Term' end,
    p_term_number,p_term_start,p_term_end,
    'scheduled',false
  )
  on conflict(academic_year_id,term_number) do update set
    starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    name=excluded.name
  returning id into t_id;

  return t_id;
end;
$$;

grant execute on function public.ensure_academic_term(text,date,date,smallint,date,date) to authenticated;

create or replace function public.amqm_prepare_next_term(p_term_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  cur public.terms;
  nxt public.terms;
  copied_enrollments integer:=0;
  copied_progress integer:=0;
  fee_rows integer:=0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into cur from public.terms where id=p_term_id for update;
  if cur.id is null then raise exception 'Current term not found'; end if;
  if cur.lifecycle_status not in ('digital_closed','historical_closed') then
    raise exception 'Only a closed term can prepare its successor.';
  end if;

  select t.* into nxt
  from public.terms t
  where t.starts_on > cur.starts_on
  order by t.starts_on,t.term_number
  limit 1;

  if nxt.id is null then
    return jsonb_build_object(
      'prepared',false,'next_term_id',null,
      'message','There is no next configured term. Close the academic session, then create the next session.'
    );
  end if;

  if nxt.academic_year_id <> cur.academic_year_id then
    return jsonb_build_object(
      'prepared',false,'next_term_id',nxt.id,
      'next_academic_year_id',nxt.academic_year_id,
      'requires_new_session',true,
      'message','The next term belongs to a new academic session. Open the new session first.'
    );
  end if;

  insert into public.student_enrollments(
    student_id,term_id,class_id,section,program_year,teacher_id,status,source
  )
  select
    s.id,nxt.id,se.class_id,s.section,s.program_year,se.teacher_id,'active','term_progression'
  from public.students s
  join public.student_enrollments se
    on se.student_id=s.id and se.term_id=cur.id and se.status='active'
  where s.status='active'
  on conflict(student_id,term_id) do update set
    class_id=excluded.class_id,
    section=excluded.section,
    program_year=excluded.program_year,
    teacher_id=excluded.teacher_id,
    status='active',
    updated_at=now();
  get diagnostics copied_enrollments=row_count;

  insert into public.student_term_progress(
    student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb
  )
  select
    p.student_id,nxt.id,p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb
  from public.student_term_progress p
  join public.students s on s.id=p.student_id and s.status='active'
  where p.term_id=cur.id
  on conflict(student_id,term_id) do update set
    opening_surah=excluded.opening_surah,
    opening_ayah=excluded.opening_ayah,
    opening_page=excluded.opening_page,
    opening_hizb=excluded.opening_hizb,
    updated_at=now();
  get diagnostics copied_progress=row_count;

  insert into public.term_teacher_assignments(
    term_id,class_id,teacher_id,is_primary,source
  )
  select nxt.id,ct.class_id,ct.teacher_id,ct.is_primary,'term_progression'
  from public.class_teachers ct
  join public.classes c on c.id=ct.class_id
    and c.academic_year_id=nxt.academic_year_id
    and c.active=true
  on conflict(term_id,class_id,teacher_id) do update set
    is_primary=excluded.is_primary;

  if nxt.lifecycle_status='scheduled' then
    update public.terms
    set lifecycle_status='prepared'
    where id=nxt.id;
  end if;

  select public.sync_term_invoices(nxt.id) into fee_rows;

  insert into public.academic_cycle_events(
    academic_year_id,term_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    nxt.academic_year_id,nxt.id,'prepare_next_term',nxt.lifecycle_status,'prepared',
    jsonb_build_object(
      'source_term_id',p_term_id,
      'enrollments',copied_enrollments,
      'progress_rows',copied_progress,
      'fee_rows',fee_rows,
      'notes',p_notes
    ),auth.uid()
  );

  return jsonb_build_object(
    'prepared',true,'next_term_id',nxt.id,
    'next_term_number',nxt.term_number,
    'enrollments',copied_enrollments,
    'progress_rows',copied_progress,
    'fee_rows',fee_rows,
    'message','Next term prepared. It still requires its scheduled opening date before it can become active.'
  );
end;
$$;

grant execute on function public.amqm_prepare_next_term(uuid,text) to authenticated;

create or replace function public.amqm_close_current_term(p_term_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  cur public.terms;
  required_evals integer:=3;
  missing integer:=0;
  active_students integer:=0;
  reports integer:=0;
  r record;
  ev record;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into cur from public.terms where id=p_term_id for update;
  if cur.id is null then raise exception 'Term not found'; end if;
  if cur.lifecycle_status='historical_baseline' then
    raise exception 'This is the protected historical baseline. Use the Historical First-Term transition control.';
  end if;
  if cur.lifecycle_status<>'digital_active' or not cur.is_current then
    raise exception 'Only the current digital-active term can be closed.';
  end if;

  select coalesce(ptd.evaluation_count,3)
    into required_evals
  from public.program_term_definitions ptd
  where ptd.id=cur.term_definition_id;
  required_evals:=coalesce(required_evals,3);

  select count(*) into missing
  from public.students s
  where s.status='active'
    and (
      select count(*)
      from public.evaluations e
      where e.student_id=s.id
        and e.term_id=cur.id
        and e.status='approved'
        and e.evaluation_number between 1 and required_evals
    ) < required_evals;

  if missing>0 then
    raise exception 'Term cannot close: % active student(s) are missing approved evaluations (% required).',missing,required_evals;
  end if;

  select count(*) into active_students from public.students where status='active';

  for r in select id from public.students where status='active' loop
    select e.* into ev
    from public.evaluations e
    where e.student_id=r.id
      and e.term_id=cur.id
      and e.status='approved'
    order by e.evaluation_number desc, e.approved_at desc nulls last, e.id desc
    limit 1;

    if ev.id is null then
      raise exception 'Student % has no approved evaluation to close the Quran position.',r.id;
    end if;

    insert into public.student_term_progress(
      student_id,term_id,
      opening_surah,opening_ayah,opening_page,opening_hizb,
      closing_surah,closing_ayah,closing_page,closing_hizb,
      status,closed_at,closed_by
    )
    select
      r.id,cur.id,
      ev.from_surah,ev.from_ayah,ev.from_page,null,
      ev.to_surah,ev.to_ayah,ev.to_page,null,
      'closed',now(),auth.uid()
    where not exists (
      select 1 from public.student_term_progress p
      where p.student_id=r.id and p.term_id=cur.id
    )
    on conflict(student_id,term_id) do update set
      closing_surah=excluded.closing_surah,
      closing_ayah=excluded.closing_ayah,
      closing_page=excluded.closing_page,
      closing_hizb=excluded.closing_hizb,
      status='closed',
      closed_at=now(),
      closed_by=auth.uid(),
      updated_at=now();

    insert into public.report_cards(
      student_id,term_id,generated_by,finalized,snapshot_data
    )
    select
      r.id,cur.id,auth.uid(),true,
      jsonb_build_object(
        'student',(select to_jsonb(s) from public.students s where s.id=r.id),
        'term',(select to_jsonb(t) from public.terms t where t.id=cur.id),
        'evaluations',coalesce((
          select jsonb_agg(to_jsonb(e) order by e.evaluation_number)
          from public.evaluations e
          where e.student_id=r.id and e.term_id=cur.id and e.status='approved'
        ),'[]'::jsonb),
        'term_progress',(select to_jsonb(p) from public.student_term_progress p where p.student_id=r.id and p.term_id=cur.id),
        'captured_at',now()
      )
    on conflict(student_id,term_id) do update set
      finalized=true,
      snapshot_data=excluded.snapshot_data,
      generated_at=now();

    reports:=reports+1;
  end loop;

  insert into public.term_completions(term_id,completed_by,notes)
  values(cur.id,auth.uid(),p_notes)
  on conflict(term_id) do update set
    completed_at=now(),
    completed_by=auth.uid(),
    notes=coalesce(excluded.notes,public.term_completions.notes);

  update public.student_enrollments se
  set status='completed',updated_at=now()
  from public.students s
  where se.term_id=cur.id and se.student_id=s.id
    and s.status='active';

  update public.terms
  set lifecycle_status='digital_closed',
      is_current=false,
      closed_at=now(),
      closed_by=auth.uid()
  where id=cur.id;

  update public.academic_cycle_settings
  set current_term_id=null, updated_at=now(), updated_by=auth.uid()
  where id=true and current_term_id=cur.id;

  insert into public.academic_cycle_events(
    academic_year_id,term_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    cur.academic_year_id,cur.id,'close_term','digital_active','digital_closed',
    jsonb_build_object(
      'active_students',active_students,
      'report_cards_finalized',reports,
      'notes',p_notes
    ),auth.uid()
  );

  return jsonb_build_object(
    'closed',true,'term_id',cur.id,
    'report_cards_finalized',reports,
    'next_term_id',(select t.id from public.terms t where t.starts_on>cur.starts_on order by t.starts_on,t.term_number limit 1),
    'message','Term closed. Prepare and explicitly open the next term when its start date arrives.'
  );
end;
$$;

grant execute on function public.amqm_close_current_term(uuid,text) to authenticated;

create or replace function public.amqm_open_term(p_term_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.terms;
  ay public.academic_years;
  previous public.terms;
  placement_pending integer:=0;
  missing_enrollment integer:=0;
  missing_teacher integer:=0;
  invoice_count integer:=0;
  prev_year public.academic_years;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into target from public.terms where id=p_term_id for update;
  if target.id is null then raise exception 'Term not found'; end if;

  select * into ay from public.academic_years where id=target.academic_year_id for update;
  if ay.id is null then raise exception 'Academic session not found'; end if;

  if target.lifecycle_status not in ('scheduled','prepared') then
    if target.lifecycle_status='digital_active' then
      return jsonb_build_object('opened',true,'term_id',target.id,'message','This term is already active.');
    end if;
    raise exception 'Term is not available to open from its current state.';
  end if;

  if target.starts_on > current_date then
    raise exception 'This term is scheduled to start on %, so it cannot be opened yet.',target.starts_on;
  end if;

  if target.term_number>1 then
    select * into previous
    from public.terms t
    where t.academic_year_id=target.academic_year_id
      and t.term_number=target.term_number-1;
    if previous.id is null or previous.lifecycle_status not in ('digital_closed','historical_closed') then
      raise exception 'The previous term must be closed before this term can open.';
    end if;
  else
    if ay.lifecycle_status<>'open' then
      raise exception 'The academic session must be opened before its First Term can open.';
    end if;
    select * into prev_year
    from public.academic_years p
    where p.starts_on < ay.starts_on
    order by p.starts_on desc limit 1;
    if prev_year.id is not null and prev_year.lifecycle_status not in ('closed','archived') then
      raise exception 'The previous academic session must be closed before opening this session.';
    end if;
  end if;

  select count(*) into missing_enrollment
  from public.students s
  where s.status='active'
    and not exists(
      select 1 from public.student_enrollments se
      where se.student_id=s.id and se.term_id=target.id and se.status='active'
    );

  select count(*) into placement_pending
  from public.students s
  where s.status='active'
    and not exists(
      select 1
      from public.student_enrollments se
      join public.classes c on c.id=se.class_id and c.active=true and c.academic_year_id=target.academic_year_id
      where se.student_id=s.id and se.term_id=target.id and se.status='active'
    );

  select count(*) into missing_teacher
  from public.student_enrollments se
  join public.students s on s.id=se.student_id and s.status='active'
  left join public.classes c on c.id=se.class_id and c.active=true and c.academic_year_id=target.academic_year_id
  left join lateral (
    select ct.teacher_id
    from public.class_teachers ct
    where ct.class_id=c.id
    order by ct.is_primary desc,ct.assigned_at asc
    limit 1
  ) ct on true
  where se.term_id=target.id and se.status='active'
    and (c.id is null or ct.teacher_id is null);

  if missing_enrollment>0 then
    raise exception 'Term cannot open: % active student(s) do not have a term enrollment.',missing_enrollment;
  end if;

  if placement_pending>0 then
    raise exception 'Term cannot open: % active student(s) still need class placement in this session.',placement_pending;
  end if;

  if missing_teacher>0 then
    raise exception 'Term cannot open: % enrolled student(s) do not have a class with a teacher assignment.',missing_teacher;
  end if;

  select public.sync_term_invoices(target.id) into invoice_count;

  update public.terms set is_current=false where is_current=true;
  update public.academic_years set is_current=false where is_current=true and id<>target.academic_year_id;

  update public.terms
  set lifecycle_status='digital_active',
      is_current=true,
      closed_at=null,
      closed_by=null
  where id=target.id;

  update public.academic_years
  set is_current=true,
      lifecycle_status='open',
      opened_at=coalesce(opened_at,now()),
      opened_by=coalesce(opened_by,auth.uid())
  where id=target.academic_year_id;

  update public.academic_cycle_settings
  set current_academic_year_id=target.academic_year_id,
      current_term_id=target.id,
      updated_at=now(),
      updated_by=auth.uid()
  where id=true;

  insert into public.academic_cycle_events(
    academic_year_id,term_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    target.academic_year_id,target.id,'open_term',target.lifecycle_status,'digital_active',
    jsonb_build_object('invoice_rows',invoice_count,'notes',p_notes),auth.uid()
  );

  return jsonb_build_object(
    'opened',true,'term_id',target.id,'term_number',target.term_number,
    'academic_year_id',target.academic_year_id,'invoice_rows',invoice_count,
    'message','Term is now active. Evaluation windows and daily operations can proceed normally.'
  );
end;
$$;

grant execute on function public.amqm_open_term(uuid,text) to authenticated;

create or replace function public.amqm_close_session(p_academic_year_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare ay public.academic_years; term_count integer:=0; open_terms integer:=0; current_term uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select * into ay from public.academic_years where id=p_academic_year_id for update;
  if ay.id is null then raise exception 'Academic session not found'; end if;
  if ay.lifecycle_status<>'open' then
    raise exception 'Only an open academic session can be closed.';
  end if;

  select count(*) into term_count from public.terms where academic_year_id=ay.id;
  if term_count<3 then raise exception 'Session cannot close until First, Second and Third Term are configured.'; end if;

  select count(*) into open_terms
  from public.terms
  where academic_year_id=ay.id
    and lifecycle_status not in ('historical_closed','digital_closed');

  if open_terms>0 then
    raise exception 'Session cannot close: % term(s) are not closed.',open_terms;
  end if;

  select current_term_id into current_term
  from public.academic_cycle_settings where id=true;
  if current_term is not null and exists(select 1 from public.terms t where t.id=current_term and t.academic_year_id=ay.id) then
    raise exception 'Session cannot close while a term is still active.';
  end if;

  update public.academic_years
  set lifecycle_status='closed',
      is_current=false,
      closed_at=now(),
      closed_by=auth.uid(),
      closure_notes=coalesce(p_notes,closure_notes)
  where id=ay.id;

  update public.academic_cycle_settings
  set current_academic_year_id=null,
      current_term_id=null,
      updated_at=now(),
      updated_by=auth.uid()
  where id=true
    and current_academic_year_id=ay.id;

  insert into public.academic_cycle_events(
    academic_year_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    ay.id,'close_session','open','closed',
    jsonb_build_object('term_count',term_count,'notes',p_notes),auth.uid()
  );

  return jsonb_build_object(
    'closed',true,'academic_year_id',ay.id,
    'message','Academic session closed. The next session must be opened explicitly when its start date arrives.'
  );
end;
$$;

grant execute on function public.amqm_close_session(uuid,text) to authenticated;

create or replace function public.amqm_open_session(p_academic_year_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ay public.academic_years;
  prev public.academic_years;
  prev_t3 public.terms;
  first_term public.terms;
  student_count integer:=0;
  promoted integer:=0;
  placement_pending integer:=0;
  fee_rows integer:=0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;

  select * into ay from public.academic_years where id=p_academic_year_id for update;
  if ay.id is null then raise exception 'Academic session not found'; end if;
  if ay.lifecycle_status='open' then
    return jsonb_build_object('opened',true,'academic_year_id',ay.id,'message','This academic session is already open.');
  end if;
  if ay.lifecycle_status<>'scheduled' then
    raise exception 'Only a scheduled academic session can be opened.';
  end if;
  if ay.starts_on > current_date then
    raise exception 'This academic session starts on %, so it cannot be opened yet.',ay.starts_on;
  end if;

  select count(*) into student_count
  from public.terms where academic_year_id=ay.id;
  if student_count<3 then
    raise exception 'Session cannot open until all 3 terms are configured.';
  end if;

  select * into prev
  from public.academic_years p
  where p.starts_on < ay.starts_on
  order by p.starts_on desc
  limit 1;

  if prev.id is not null and prev.lifecycle_status not in ('closed','archived') then
    raise exception 'Previous academic session % must be closed before opening %.',prev.name,ay.name;
  end if;

  select t.* into prev_t3
  from public.terms t
  where prev.id is not null
    and t.academic_year_id=prev.id
    and t.term_number=3
  limit 1;

  select t.* into first_term
  from public.terms t
  where t.academic_year_id=ay.id and t.term_number=1;

  -- Carry Year 1 students from the previous session into Year 2.
  -- New admissions without a previous-session enrollment remain in Year 1.
  if prev_t3.id is not null then
    update public.students s
    set program_year='year_2'
    where s.status='active'
      and s.program_year='year_1'
      and exists(
        select 1 from public.student_enrollments se
        where se.student_id=s.id
          and se.term_id=prev_t3.id
      );
    get diagnostics promoted=row_count;

    update public.students s
    set class_id=null
    where s.status='active'
      and (
        s.class_id is null
        or not exists(
          select 1 from public.classes c
          where c.id=s.class_id
            and c.academic_year_id=ay.id
            and c.active=true
        )
      );

    delete from public.teacher_students ts
    where exists(
      select 1 from public.students s
      where s.id=ts.student_id
        and s.status='active'
        and (
          s.class_id is null
          or not exists(
            select 1 from public.classes c
            where c.id=s.class_id
              and c.academic_year_id=ay.id
              and c.active=true
          )
        )
    );
  end if;

  insert into public.term_teacher_assignments(
    term_id,class_id,teacher_id,is_primary,source
  )
  select first_term.id,ct.class_id,ct.teacher_id,ct.is_primary,'session_open'
  from public.class_teachers ct
  join public.classes c on c.id=ct.class_id
    and c.academic_year_id=ay.id
    and c.active=true
  on conflict(term_id,class_id,teacher_id) do update set
    is_primary=excluded.is_primary;

  insert into public.student_enrollments(
    student_id,term_id,class_id,section,program_year,teacher_id,status,source
  )
  select
    s.id,
    first_term.id,
    case when c.id is not null then s.class_id else null end,
    s.section,
    s.program_year,
    ct.teacher_id,
    'active',
    'session_open'
  from public.students s
  left join public.classes c
    on c.id=s.class_id
   and c.academic_year_id=ay.id
   and c.active=true
  left join lateral (
    select ct0.teacher_id
    from public.class_teachers ct0
    where ct0.class_id=c.id
    order by ct0.is_primary desc,ct0.assigned_at asc
    limit 1
  ) ct on true
  where s.status='active'
  on conflict(student_id,term_id) do update set
    class_id=excluded.class_id,
    section=excluded.section,
    program_year=excluded.program_year,
    teacher_id=excluded.teacher_id,
    status='active',
    updated_at=now();

  if prev_t3.id is not null then
    insert into public.student_term_progress(
      student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb
    )
    select
      s.id,first_term.id,
      p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb
    from public.students s
    join public.student_term_progress p
      on p.student_id=s.id and p.term_id=prev_t3.id
    where s.status='active'
    on conflict(student_id,term_id) do update set
      opening_surah=excluded.opening_surah,
      opening_ayah=excluded.opening_ayah,
      opening_page=excluded.opening_page,
      opening_hizb=excluded.opening_hizb,
      updated_at=now();
  end if;

  -- New/admitted students without a carried closing position start at their live profile position.
  insert into public.student_term_progress(
    student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb
  )
  select s.id,first_term.id,s.current_surah,s.current_ayah,s.current_page,s.current_hizb
  from public.students s
  where s.status='active'
    and not exists(
      select 1 from public.student_term_progress p
      where p.student_id=s.id and p.term_id=first_term.id
    )
  on conflict(student_id,term_id) do nothing;

  update public.terms
  set lifecycle_status='prepared',is_current=false
  where academic_year_id=ay.id and lifecycle_status='scheduled';

  select public.sync_term_invoices(first_term.id) into fee_rows;

  select count(*) into placement_pending
  from public.students s
  where s.status='active'
    and not exists(
      select 1 from public.student_enrollments se
      where se.student_id=s.id and se.term_id=first_term.id
        and se.status='active' and se.class_id is not null
    );

  update public.academic_years
  set lifecycle_status='open',
      is_current=true,
      opened_at=now(),
      opened_by=auth.uid(),
      predecessor_year_id=prev.id
  where id=ay.id;

  update public.academic_cycle_settings
  set current_academic_year_id=ay.id,
      current_term_id=null,
      updated_at=now(),
      updated_by=auth.uid()
  where id=true;

  insert into public.academic_cycle_events(
    academic_year_id,term_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    ay.id,first_term.id,'open_session','scheduled','open',
    jsonb_build_object(
      'previous_session_id',prev.id,
      'promoted_year1_to_year2',promoted,
      'placement_pending',placement_pending,
      'fee_rows',fee_rows,
      'notes',p_notes
    ),auth.uid()
  );

  return jsonb_build_object(
    'opened',true,'academic_year_id',ay.id,
    'first_term_id',first_term.id,
    'promoted_year1_to_year2',promoted,
    'placement_pending',placement_pending,
    'fee_rows',fee_rows,
    'message',case
      when placement_pending>0
        then 'Academic session opened. Returning students were carried forward; place students into the new session classes before opening First Term.'
      else 'Academic session opened. First Term is prepared and ready to open when its start date and final checks are satisfied.'
    end
  );
end;
$$;

grant execute on function public.amqm_open_session(uuid,text) to authenticated;

-- Compatibility: existing callers can no longer jump to an arbitrary term.
create or replace function public.set_current_academic_term(p_term_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  return public.amqm_open_term(p_term_id);
end;
$$;

grant execute on function public.set_current_academic_term(uuid) to authenticated;

create or replace function public.close_term_and_start_next(p_term_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare closed_result jsonb; prepared_result jsonb; opened_result jsonb; next_id uuid; next_start date;
begin
  closed_result:=public.amqm_close_current_term(p_term_id,p_notes);
  next_id:=(closed_result->>'next_term_id')::uuid;
  if next_id is null then
    return closed_result || jsonb_build_object('message','Term closed. There is no next configured term; close the academic session when all terms are complete.');
  end if;
  prepared_result:=public.amqm_prepare_next_term(p_term_id,p_notes);
  if coalesce((prepared_result->>'requires_new_session')::boolean,false) then
    return closed_result || prepared_result;
  end if;
  select starts_on into next_start from public.terms where id=next_id;
  if next_start>current_date then
    return closed_result || prepared_result || jsonb_build_object(
      'opened',false,
      'message','Term closed and the next term is prepared. It will remain scheduled until its start date.'
    );
  end if;
  opened_result:=public.amqm_open_term(next_id,p_notes);
  return closed_result || prepared_result || opened_result;
end;
$$;

grant execute on function public.close_term_and_start_next(uuid,text) to authenticated;

notify pgrst,'reload schema';
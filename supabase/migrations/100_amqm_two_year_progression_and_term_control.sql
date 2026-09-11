-- AMQM 2-year Qur'an memorization lifecycle
-- 2 academic years -> 6 terms -> 3 evaluations per term.
-- Each approved evaluation opens the next evaluation from its exact ending position.
-- Evaluation 3 closes the term; the next term opens from that exact closing position.
-- Historical imports remain outside the live chain; Historical Eval 3 seeds the first live position.

create table if not exists public.student_term_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  term_id uuid not null references public.terms(id),
  opening_surah smallint,
  opening_ayah smallint,
  opening_page smallint,
  opening_hizb smallint,
  eval1_start_surah smallint,
  eval1_start_ayah smallint,
  eval1_end_surah smallint,
  eval1_end_ayah smallint,
  eval2_start_surah smallint,
  eval2_start_ayah smallint,
  eval2_end_surah smallint,
  eval2_end_ayah smallint,
  eval3_start_surah smallint,
  eval3_start_ayah smallint,
  eval3_end_surah smallint,
  eval3_end_ayah smallint,
  closing_surah smallint,
  closing_ayah smallint,
  closing_page smallint,
  closing_hizb smallint,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, term_id)
);

create index if not exists student_term_progress_term_idx
  on public.student_term_progress(term_id, student_id);

create table if not exists public.student_program_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id),
  academic_year_id uuid references public.academic_years(id),
  final_term_id uuid references public.terms(id),
  final_evaluation_id uuid references public.evaluations(id),
  final_surah smallint,
  final_ayah smallint,
  final_global_ayah integer,
  completion_percentage numeric(6,2) not null default 100,
  certificate_id uuid references public.graduation_certificates(id),
  completed_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id),
  snapshot jsonb not null default '{}'::jsonb
);

alter table public.student_term_progress enable row level security;
alter table public.student_program_completions enable row level security;

drop policy if exists student_term_progress_admin_select on public.student_term_progress;
create policy student_term_progress_admin_select on public.student_term_progress
  for select to authenticated using (public.my_role() in ('super_admin','admin','principal','teacher','finance'));

drop policy if exists student_term_progress_admin_write on public.student_term_progress;
create policy student_term_progress_admin_write on public.student_term_progress
  for all to authenticated using (public.my_role() in ('super_admin','admin','principal'))
  with check (public.my_role() in ('super_admin','admin','principal'));

drop policy if exists student_program_completions_admin_select on public.student_program_completions;
create policy student_program_completions_admin_select on public.student_program_completions
  for select to authenticated using (public.my_role() in ('super_admin','admin','principal','teacher'));

drop policy if exists student_program_completions_admin_write on public.student_program_completions;
create policy student_program_completions_admin_write on public.student_program_completions
  for all to authenticated using (public.my_role() in ('super_admin','admin','principal'))
  with check (public.my_role() in ('super_admin','admin','principal'));

-- Find the immediately preceding operational term by date.
create or replace function public.amqm_previous_term(p_term_id uuid)
returns uuid
language sql stable security definer set search_path=public
as $$
  select t.id
  from public.terms cur
  join public.terms t on t.starts_on < cur.starts_on
  where cur.id = p_term_id
  order by t.starts_on desc, t.term_number desc
  limit 1
$$;

-- The first live term starts from the student's current official position. For an imported
-- student that position is established by Historical Eval 3. Later terms start from the
-- previous term's locked closing position.
create or replace function public.amqm_term_opening_position(
  p_student_id uuid, p_term_id uuid
)
returns table(surah smallint, ayah smallint, page smallint, hizb smallint)
language plpgsql stable security definer set search_path=public
as $$
declare
  prev uuid;
begin
  prev := public.amqm_previous_term(p_term_id);
  if prev is not null then
    select p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb
      into surah,ayah,page,hizb
    from public.student_term_progress p
    where p.student_id=p_student_id and p.term_id=prev and p.status='closed';
    if surah is not null then return next; return; end if;
  end if;

  select s.current_surah,s.current_ayah,s.current_page,s.current_hizb
    into surah,ayah,page,hizb
  from public.students s where s.id=p_student_id;
  return next;
end;
$$;

-- Backfill term snapshots from the existing approved live evaluations. Historical imports
-- (campaign_id NULL) are intentionally not treated as live evaluations.
do $$
declare r record; o record; e1 record; e2 record; e3 record;
begin
  for r in
    select distinct e.student_id,e.term_id
    from public.evaluations e
    where e.campaign_id is not null
  loop
    select * into e1 from public.evaluations e where e.student_id=r.student_id and e.term_id=r.term_id and e.evaluation_number=1 and e.status='approved' order by e.approved_at desc limit 1;
    select * into e2 from public.evaluations e where e.student_id=r.student_id and e.term_id=r.term_id and e.evaluation_number=2 and e.status='approved' order by e.approved_at desc limit 1;
    select * into e3 from public.evaluations e where e.student_id=r.student_id and e.term_id=r.term_id and e.evaluation_number=3 and e.status='approved' order by e.approved_at desc limit 1;
    select * into o from public.amqm_term_opening_position(r.student_id,r.term_id);
    insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb,
      eval1_start_surah,eval1_start_ayah,eval1_end_surah,eval1_end_ayah,
      eval2_start_surah,eval2_start_ayah,eval2_end_surah,eval2_end_ayah,
      eval3_start_surah,eval3_start_ayah,eval3_end_surah,eval3_end_ayah,
      closing_surah,closing_ayah,closing_page,closing_hizb,status,closed_at)
    values(r.student_id,r.term_id,
      coalesce(e1.from_surah,o.surah),coalesce(e1.from_ayah,o.ayah),o.page,o.hizb,
      e1.from_surah,e1.from_ayah,e1.to_surah,e1.to_ayah,
      e2.from_surah,e2.from_ayah,e2.to_surah,e2.to_ayah,
      e3.from_surah,e3.from_ayah,e3.to_surah,e3.to_ayah,
      e3.to_surah,e3.to_ayah,e3.to_page,null,
      case when e3.id is not null then 'closed' else 'open' end,
      case when e3.id is not null then coalesce(e3.approved_at,now()) else null end)
    on conflict(student_id,term_id) do update set
      opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,
      eval1_start_surah=excluded.eval1_start_surah,eval1_start_ayah=excluded.eval1_start_ayah,
      eval1_end_surah=excluded.eval1_end_surah,eval1_end_ayah=excluded.eval1_end_ayah,
      eval2_start_surah=excluded.eval2_start_surah,eval2_start_ayah=excluded.eval2_start_ayah,
      eval2_end_surah=excluded.eval2_end_surah,eval2_end_ayah=excluded.eval2_end_ayah,
      eval3_start_surah=excluded.eval3_start_surah,eval3_start_ayah=excluded.eval3_start_ayah,
      eval3_end_surah=excluded.eval3_end_surah,eval3_end_ayah=excluded.eval3_end_ayah,
      closing_surah=excluded.closing_surah,closing_ayah=excluded.closing_ayah,
      closing_page=excluded.closing_page,status=excluded.status,updated_at=now();
  end loop;
end $$;

-- Every live evaluation receives its start from the preceding stage. Teachers never type
-- the opening position manually. Historical rows remain exempt.
create or replace function public.amqm_enforce_evaluation_chain()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare
  expected_surah smallint; expected_ayah smallint;
  op record; prev record;
begin
  if new.campaign_id is null then return new; end if;

  if new.evaluation_number = 1 then
    select * into op from public.amqm_term_opening_position(new.student_id,new.term_id);
    expected_surah := op.surah; expected_ayah := op.ayah;
  else
    select e.to_surah,e.to_ayah into prev
    from public.evaluations e
    where e.student_id=new.student_id and e.term_id=new.term_id
      and e.evaluation_number=new.evaluation_number-1 and e.status='approved'
    order by e.approved_at desc limit 1;
    if prev.to_surah is null or prev.to_ayah is null then
      raise exception 'Evaluation % cannot proceed until Evaluation % is approved.',new.evaluation_number,new.evaluation_number-1;
    end if;
    expected_surah := prev.to_surah; expected_ayah := prev.to_ayah;
  end if;

  if expected_surah is null or expected_ayah is null then
    raise exception 'No official Qur''an opening position is available for Evaluation %.',new.evaluation_number;
  end if;

  new.from_surah := expected_surah;
  new.from_ayah := expected_ayah;
  return new;
end;
$$;

drop trigger if exists amqm_enforce_evaluation_chain on public.evaluations;
create trigger amqm_enforce_evaluation_chain
before insert or update of status,to_surah,to_ayah,from_surah,from_ayah,campaign_id
on public.evaluations for each row execute function public.amqm_enforce_evaluation_chain();

-- Persist each approved evaluation into the term chain and move the student's official
-- current position immediately. Evaluation 1 therefore opens Evaluation 2, etc.
create or replace function public.amqm_record_approved_evaluation_position()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare v_page smallint; v_hizb smallint;
begin
  if new.status='approved' and old.status is distinct from 'approved' and new.campaign_id is not null then
    select q.page,q.hizb into v_page,v_hizb from public.quran_verses q where q.surah=new.to_surah and q.ayah=new.to_ayah;

    insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb)
    select new.student_id,new.term_id,op.surah,op.ayah,op.page,op.hizb
    from public.amqm_term_opening_position(new.student_id,new.term_id) op
    on conflict(student_id,term_id) do nothing;

    update public.student_term_progress p set
      eval1_start_surah=case when new.evaluation_number=1 then new.from_surah else p.eval1_start_surah end,
      eval1_start_ayah=case when new.evaluation_number=1 then new.from_ayah else p.eval1_start_ayah end,
      eval1_end_surah=case when new.evaluation_number=1 then new.to_surah else p.eval1_end_surah end,
      eval1_end_ayah=case when new.evaluation_number=1 then new.to_ayah else p.eval1_end_ayah end,
      eval2_start_surah=case when new.evaluation_number=2 then new.from_surah else p.eval2_start_surah end,
      eval2_start_ayah=case when new.evaluation_number=2 then new.from_ayah else p.eval2_start_ayah end,
      eval2_end_surah=case when new.evaluation_number=2 then new.to_surah else p.eval2_end_surah end,
      eval2_end_ayah=case when new.evaluation_number=2 then new.to_ayah else p.eval2_end_ayah end,
      eval3_start_surah=case when new.evaluation_number=3 then new.from_surah else p.eval3_start_surah end,
      eval3_start_ayah=case when new.evaluation_number=3 then new.from_ayah else p.eval3_start_ayah end,
      eval3_end_surah=case when new.evaluation_number=3 then new.to_surah else p.eval3_end_surah end,
      eval3_end_ayah=case when new.evaluation_number=3 then new.to_ayah else p.eval3_end_ayah end,
      closing_surah=case when new.evaluation_number=3 then new.to_surah else p.closing_surah end,
      closing_ayah=case when new.evaluation_number=3 then new.to_ayah else p.closing_ayah end,
      closing_page=case when new.evaluation_number=3 then v_page else p.closing_page end,
      closing_hizb=case when new.evaluation_number=3 then v_hizb else p.closing_hizb end,
      status=case when new.evaluation_number=3 then 'closed' else 'open' end,
      closed_at=case when new.evaluation_number=3 then coalesce(new.approved_at,now()) else p.closed_at end,
      updated_at=now()
    where p.student_id=new.student_id and p.term_id=new.term_id;

    update public.students set
      current_surah=new.to_surah,current_ayah=new.to_ayah,current_page=v_page,current_hizb=v_hizb
    where id=new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists amqm_record_approved_evaluation_position on public.evaluations;
create trigger amqm_record_approved_evaluation_position
after update on public.evaluations for each row execute function public.amqm_record_approved_evaluation_position();

-- Calendar is the master schedule. This job opens due campaigns and creates the student
-- work queue only when the preceding evaluation is approved. It also advances the
-- operational term by date, without silently closing incomplete academic work.
create or replace function public.amqm_process_calendar_automation()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare c record; ev record; n integer:=0; opened integer:=0; closed integer:=0; nxt record; cur record;
begin
  -- Keep campaign status synchronized with its calendar window.
  for c in select * from public.evaluation_campaigns where status in ('scheduled','open') loop
    if now() >= c.opens_at and now() < c.closes_at and c.status='scheduled' then
      -- E2/E3 only become teacher-visible when the previous evaluation is complete.
      if c.evaluation_number=1 or not exists(
        select 1 from public.students s
        join public.evaluation_campaign_classes cc on cc.class_id=s.class_id and cc.campaign_id=c.id
        where s.status='active'
          and not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=c.term_id and e.evaluation_number=c.evaluation_number-1 and e.status='approved')
      ) then
        update public.evaluation_campaigns set status='open',updated_at=now() where id=c.id;
        opened:=opened+1;
      end if;
    elsif now() >= c.closes_at and c.status='open' then
      update public.evaluation_campaigns set status='closed',updated_at=now() where id=c.id;
      closed:=closed+1;
    end if;
  end loop;

  -- Create/update drafts for campaigns that are open. The trigger enforces the exact chain.
  for c in select * from public.evaluation_campaigns where status='open' loop
    for ev in
      select s.id as student_id,s.class_id,ct.teacher_id
      from public.students s
      join public.evaluation_campaign_classes cc on cc.campaign_id=c.id and cc.class_id=s.class_id
      left join lateral (
        select ct2.teacher_id from public.class_teachers ct2 where ct2.class_id=s.class_id order by ct2.is_primary desc,ct2.assigned_at asc limit 1
      ) ct on true
      where s.status='active'
    loop
      if ev.teacher_id is not null and (c.evaluation_number=1 or exists(
        select 1 from public.evaluations pe where pe.student_id=ev.student_id and pe.term_id=c.term_id and pe.evaluation_number=c.evaluation_number-1 and pe.status='approved')) then
        insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,teacher_visible,teacher_visible_at,campaign_id)
        values(ev.student_id,ev.teacher_id,c.term_id,c.evaluation_number,'draft',true,now(),c.id)
        on conflict(student_id,term_id,evaluation_number) do update set
          teacher_id=excluded.teacher_id,campaign_id=excluded.campaign_id,teacher_visible=true,teacher_visible_at=coalesce(public.evaluations.teacher_visible_at,now());
        n:=n+1;
      end if;
    end loop;
  end loop;

  -- Date-based operational advancement. Term closure itself remains a controlled action.
  select t.* into cur from public.terms t join public.academic_cycle_settings ac on ac.current_term_id=t.id where ac.id=true;
  if cur.id is not null and current_date > cur.ends_on then
    select t.* into nxt
    from public.terms t
    where t.starts_on >= cur.ends_on
      and t.id<>cur.id
      and t.starts_on <= current_date
    order by t.starts_on,t.term_number limit 1;
    if nxt.id is not null then
      update public.terms set is_current=false where is_current;
      update public.academic_years set is_current=false where is_current;
      update public.terms set is_current=true where id=nxt.id;
      update public.academic_years set is_current=true where id=nxt.academic_year_id;
      update public.academic_cycle_settings set current_academic_year_id=nxt.academic_year_id,current_term_id=nxt.id,updated_at=now() where id=true;
    end if;
  end if;

  return jsonb_build_object('opened_campaigns',opened,'closed_campaigns',closed,'drafts_prepared',n);
end;
$$;

grant execute on function public.amqm_process_calendar_automation() to authenticated;

-- Replace the old calendar evaluation marker workflow with the real evaluation event type.
-- Existing historical calendar rows are preserved.

-- One controlled term transition. It is intentionally not the same as date-based activation.
create or replace function public.close_term_and_start_next(p_term_id uuid,p_notes text default null)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare missing integer; next_id uuid; next_no smallint; current_no smallint; current_year uuid; next_year uuid; graduated integer:=0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;

  select term_number,academic_year_id into current_no,current_year from public.terms where id=p_term_id for update;
  if current_no is null then raise exception 'Term not found'; end if;

  select count(*) into missing from public.students s
  where s.status='active' and (
    not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=1 and e.status='approved') or
    not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=2 and e.status='approved') or
    not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=3 and e.status='approved')
  );
  if missing>0 then raise exception 'Term cannot close: % active student(s) do not have all 3 approved evaluations.',missing; end if;

  insert into public.term_completions(term_id,completed_by,notes)
  values(p_term_id,auth.uid(),p_notes)
  on conflict(term_id) do update set completed_at=now(),completed_by=auth.uid(),notes=excluded.notes;

  update public.student_term_progress set status='closed',closed_at=coalesce(closed_at,now()),closed_by=auth.uid(),updated_at=now() where term_id=p_term_id;

  select t.id,t.term_number,t.academic_year_id into next_id,next_no,next_year
  from public.terms t
  where t.starts_on > (select starts_on from public.terms where id=p_term_id)
  order by t.starts_on,t.term_number limit 1;

  if next_id is null then
    -- Year 2 Term 3 is the final stage. Graduation is only allowed when the final
    -- Evaluation 3 reaches the configured Quran endpoint.
    if current_no=3 and exists(select 1 from public.academic_years ay where ay.id=current_year and ay.starts_on > (select starts_on from public.academic_years where id=current_year) ) then
      raise exception 'No next term exists. Complete the Year 2 graduation workflow.';
    end if;
    return jsonb_build_object('closed',true,'next_term_id',null,'message','Term closed. No next term is configured.');
  end if;

  if current_no=3 then
    update public.students set program_year='year_2' where status='active' and program_year='year_1';
  end if;

  -- Prepare the next-term opening snapshot for every active student from the previous
  -- term's exact Eval 3 closing position.
  insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb)
  select s.id,next_id,p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb
  from public.students s join public.student_term_progress p on p.student_id=s.id and p.term_id=p_term_id
  where s.status='active'
  on conflict(student_id,term_id) do update set
    opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,
    opening_page=excluded.opening_page,opening_hizb=excluded.opening_hizb,updated_at=now();

  -- Activate the next term only after the current term has been completed.
  update public.terms set is_current=false where is_current;
  update public.academic_years set is_current=false where is_current;
  update public.terms set is_current=true where id=next_id;
  update public.academic_years set is_current=true where id=next_year;
  update public.academic_cycle_settings set current_academic_year_id=next_year,current_term_id=next_id,updated_at=now() where id=true;

  return jsonb_build_object('closed',true,'next_term_id',next_id,'next_term_number',next_no,'program_years_updated',current_no=3);
end;
$$;

grant execute on function public.close_term_and_start_next(uuid,text) to authenticated;

-- Permanent graduation snapshot. Existing alumni/certificate lifecycle remains in place;
-- this adds a complete immutable-at-completion record for audit and future verification.
create or replace function public.capture_program_completion_snapshot(p_student_id uuid,p_final_term_id uuid,p_final_eval_id uuid,p_certificate_id uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare rid uuid; s jsonb;
begin
  select jsonb_build_object(
    'student',to_jsonb(st),
    'terms',coalesce((select jsonb_agg(to_jsonb(p) order by t.starts_on) from public.student_term_progress p join public.terms t on t.id=p.term_id where p.student_id=st.id),'[]'::jsonb),
    'evaluations',coalesce((select jsonb_agg(to_jsonb(e) order by t.starts_on,e.evaluation_number) from public.evaluations e join public.terms t on t.id=e.term_id where e.student_id=st.id and e.status='approved'),'[]'::jsonb),
    'report_cards',coalesce((select jsonb_agg(to_jsonb(rc) order by t.starts_on) from public.report_cards rc join public.terms t on t.id=rc.term_id where rc.student_id=st.id),'[]'::jsonb),
    'certificate_id',p_certificate_id,
    'captured_at',now()
  ) into s from public.students st where st.id=p_student_id;

  insert into public.student_program_completions(student_id,academic_year_id,final_term_id,final_evaluation_id,final_surah,final_ayah,final_global_ayah,completion_percentage,certificate_id,completed_by,snapshot)
  select p_student_id,t.academic_year_id,p_final_term_id,p_final_eval_id,e.to_surah,e.to_ayah,q.global_ayah,100,p_certificate_id,auth.uid(),s
  from public.evaluations e join public.terms t on t.id=e.term_id left join public.quran_verses q on q.surah=e.to_surah and q.ayah=e.to_ayah
  where e.id=p_final_eval_id
  on conflict(student_id) do update set final_term_id=excluded.final_term_id,final_evaluation_id=excluded.final_evaluation_id,final_surah=excluded.final_surah,final_ayah=excluded.final_ayah,final_global_ayah=excluded.final_global_ayah,certificate_id=excluded.certificate_id,completed_at=now(),completed_by=excluded.completed_by,snapshot=excluded.snapshot
  returning id into rid;
  return rid;
end;
$$;

-- Strengthen the existing graduation trigger by capturing the complete programme snapshot
-- immediately after a Year 2 Term 3 completion certificate is issued.
create or replace function public.amqm_capture_graduation_snapshot()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare term_no smallint; ay_name text; cert_id uuid;
begin
  if new.status='graduated' and old.status is distinct from 'graduated' then
    select t.term_number,ay.name into term_no,ay_name from public.terms t join public.academic_years ay on ay.id=t.academic_year_id
      where exists(select 1 from public.evaluations e where e.student_id=new.id and e.term_id=t.id and e.evaluation_number=3 and e.status='approved')
      order by t.starts_on desc limit 1;
    if term_no=3 then
      select gc.id into cert_id from public.graduation_certificates gc join public.alumni_profiles ap on ap.id=gc.alumni_id where ap.student_id=new.id and gc.status='issued' order by gc.issued_at desc limit 1;
      perform public.capture_program_completion_snapshot(new.id,(select t.id from public.terms t join public.evaluations e on e.term_id=t.id where e.student_id=new.id and e.evaluation_number=3 and e.status='approved' order by t.starts_on desc limit 1),(select e.id from public.evaluations e join public.terms t on t.id=e.term_id where e.student_id=new.id and e.evaluation_number=3 and e.status='approved' order by t.starts_on desc limit 1),cert_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists amqm_capture_graduation_snapshot on public.students;
create trigger amqm_capture_graduation_snapshot
after update of status on public.students for each row execute function public.amqm_capture_graduation_snapshot();

-- Ensure the historical import tools are explicitly identifiable and can be hidden by UI
-- after migration verification without deleting the imported records.
insert into public.site_settings(key,value)
values('amqm_historical_import_verified','false'::jsonb)
on conflict(key) do nothing;

-- Performance indexes for the new continuity path.
create index if not exists evaluations_student_term_number_status_idx
  on public.evaluations(student_id,term_id,evaluation_number,status);
create index if not exists evaluation_campaigns_window_status_idx
  on public.evaluation_campaigns(status,opens_at,closes_at);

-- Hourly database automation: evaluation windows, teacher work queues, and date-based
-- operational term activation. Term closure remains an explicit administrator action.
select cron.schedule('amqm-calendar-automation-hourly','5 * * * *','select public.amqm_process_calendar_automation();')
where not exists (select 1 from cron.job where jobname='amqm-calendar-automation-hourly');

-- Certificate insertion is the final graduation event; attach the certificate to the
-- permanent completion snapshot even though the student status update happens first.
create or replace function public.amqm_capture_completion_on_certificate()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare sid uuid;
begin
  select ap.student_id into sid from public.alumni_profiles ap where ap.id=new.alumni_id;
  if sid is not null then
    perform public.capture_program_completion_snapshot(
      sid,
      (select t.id from public.terms t join public.evaluations e on e.term_id=t.id where e.student_id=sid and e.evaluation_number=3 and e.status='approved' order by t.starts_on desc limit 1),
      (select e.id from public.evaluations e join public.terms t on t.id=e.term_id where e.student_id=sid and e.evaluation_number=3 and e.status='approved' order by t.starts_on desc limit 1),
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists amqm_capture_completion_on_certificate on public.graduation_certificates;
create trigger amqm_capture_completion_on_certificate
after insert or update of status on public.graduation_certificates
for each row when (new.status='issued') execute function public.amqm_capture_completion_on_certificate();

-- Calendar automation also creates the scheduled campaign itself. Classes are the
-- programme's stable teaching groups, so the configured active classes are targeted
-- automatically; no repeated admin assignment is required every term.
create or replace function public.amqm_process_calendar_automation()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare c record; ev record; cl uuid[]; cid uuid; e_num smallint; n integer:=0; opened integer:=0; closed integer:=0; created integer:=0; nxt record; cur record;
begin
  for ev in
    select e.*, ('evaluation_'||e.evaluation_number::text) as expected_type
    from public.school_calendar_events e
    where e.event_type in ('evaluation_1','evaluation_2','evaluation_3')
      and e.term_id is not null and e.starts_at is not null and e.ends_at is not null
  loop
    e_num := ev.evaluation_number;
    if not exists(select 1 from public.evaluation_campaigns c where c.term_id=ev.term_id and c.evaluation_number=e_num) then
      select coalesce(array_agg(c.id order by c.name),'{}'::uuid[]) into cl
      from public.classes c where c.active=true;
      if coalesce(array_length(cl,1),0)>0 and now() >= ev.starts_at then
        if e_num=1 or not exists(
          select 1 from public.students s
          where s.status='active' and s.class_id=any(cl)
            and not exists(select 1 from public.evaluations pe where pe.student_id=s.id and pe.term_id=ev.term_id and pe.evaluation_number=e_num-1 and pe.status='approved')
        ) then
          insert into public.evaluation_campaigns(term_id,evaluation_number,title,calendar_event_id,opens_at,closes_at,status,created_by)
          values(ev.term_id,e_num,ev.title,ev.id,ev.starts_at,ev.ends_at,case when now()<ev.closes_at then 'open' else 'closed' end,null)
          returning id into cid;
          insert into public.evaluation_campaign_classes(campaign_id,class_id) select cid,x from unnest(cl) x on conflict do nothing;
          created:=created+1;
        end if;
      end if;
    end if;
  end loop;

  for c in select * from public.evaluation_campaigns where status in ('scheduled','open') loop
    if now() >= c.opens_at and now() < c.closes_at and c.status='scheduled' then
      if c.evaluation_number=1 or not exists(
        select 1 from public.students s
        join public.evaluation_campaign_classes cc on cc.class_id=s.class_id and cc.campaign_id=c.id
        where s.status='active'
          and not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=c.term_id and e.evaluation_number=c.evaluation_number-1 and e.status='approved')
      ) then
        update public.evaluation_campaigns set status='open',updated_at=now() where id=c.id;
        opened:=opened+1;
      end if;
    elsif now() >= c.closes_at and c.status='open' then
      update public.evaluation_campaigns set status='closed',updated_at=now() where id=c.id;
      closed:=closed+1;
    end if;
  end loop;

  for c in select * from public.evaluation_campaigns where status='open' loop
    for ev in
      select s.id as student_id,ct.teacher_id
      from public.students s
      left join lateral (select ct2.teacher_id from public.class_teachers ct2 where ct2.class_id=s.class_id order by ct2.is_primary desc,ct2.assigned_at asc limit 1) ct on true
      where s.status='active' and exists(select 1 from public.evaluation_campaign_classes cc where cc.campaign_id=c.id and cc.class_id=s.class_id)
    loop
      if ev.teacher_id is not null and (c.evaluation_number=1 or exists(select 1 from public.evaluations pe where pe.student_id=ev.student_id and pe.term_id=c.term_id and pe.evaluation_number=c.evaluation_number-1 and pe.status='approved')) then
        insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,teacher_visible,teacher_visible_at,campaign_id)
        values(ev.student_id,ev.teacher_id,c.term_id,c.evaluation_number,'draft',true,now(),c.id)
        on conflict(student_id,term_id,evaluation_number) do update set teacher_id=excluded.teacher_id,campaign_id=excluded.campaign_id,teacher_visible=true,teacher_visible_at=coalesce(public.evaluations.teacher_visible_at,now());
        n:=n+1;
      end if;
    end loop;
  end loop;

  select t.* into cur from public.terms t join public.academic_cycle_settings ac on ac.current_term_id=t.id where ac.id=true;
  if cur.id is not null and current_date > cur.ends_on then
    select t.* into nxt from public.terms t where t.starts_on >= cur.ends_on and t.id<>cur.id and t.starts_on <= current_date order by t.starts_on,t.term_number limit 1;
    if nxt.id is not null then
      update public.terms set is_current=false where is_current;
      update public.academic_years set is_current=false where is_current;
      update public.terms set is_current=true where id=nxt.id;
      update public.academic_years set is_current=true where id=nxt.academic_year_id;
      update public.academic_cycle_settings set current_academic_year_id=nxt.academic_year_id,current_term_id=nxt.id,updated_at=now() where id=true;
    end if;
  end if;

  return jsonb_build_object('created_campaigns',created,'opened_campaigns',opened,'closed_campaigns',closed,'drafts_prepared',n);
end;
$$;

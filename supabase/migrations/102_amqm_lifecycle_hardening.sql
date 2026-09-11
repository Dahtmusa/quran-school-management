-- AMQM lifecycle hardening: one controlled term transition, no date-based term switching,
-- immutable report-card completion snapshots, next-term finance preparation, and alumni safety.

alter table public.report_cards
  add column if not exists snapshot_data jsonb;

-- The old worker is retained for compatibility but must never move an academic term by date.
-- Remove its legacy cron schedule and block direct execution by API roles.
do $$ begin
  perform cron.unschedule('amqm-academic-term-worker');
exception when others then null;
end $$;

revoke execute on function public.advance_current_academic_term() from anon, authenticated;

-- Calendar automation controls evaluation windows only. Academic term activation is explicit.
create or replace function public.amqm_process_calendar_automation()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  c record; ev record; cl uuid[]; cid uuid; e_num smallint;
  n integer:=0; opened integer:=0; closed integer:=0; created integer:=0;
begin
  for ev in
    select e.*, ('evaluation_'||e.evaluation_number::text) as expected_type
    from public.school_calendar_events e
    where e.event_type in ('evaluation_1','evaluation_2','evaluation_3')
      and e.term_id is not null and e.starts_at is not null and e.ends_at is not null
  loop
    e_num := ev.evaluation_number;
    if not exists(select 1 from public.evaluation_campaigns c where camp.term_id=ev.term_id and camp.evaluation_number=e_num) then
      select coalesce(array_agg(camp.id order by c.name),'{}'::uuid[]) into cl
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
          insert into public.evaluation_campaign_classes(campaign_id,class_id)
          select cid,x from unnest(cl) x on conflict do nothing;
          created:=created+1;
        end if;
      end if;
    end if;
  end loop;

  for camp in select * from public.evaluation_campaigns where status in ('scheduled','open') loop
    if now() >= camp.opens_at and now() < camp.closes_at and camp.status='scheduled' then
      if camp.evaluation_number=1 or not exists(
        select 1 from public.students s
        join public.evaluation_campaign_classes cc on cc.class_id=s.class_id and cc.campaign_id=camp.id
        where s.status='active'
          and not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=camp.term_id and e.evaluation_number=camp.evaluation_number-1 and e.status='approved')
      ) then
        update public.evaluation_campaigns set status='open',updated_at=now() where id=camp.id;
        opened:=opened+1;
      end if;
    elsif now() >= camp.closes_at and camp.status='open' then
      update public.evaluation_campaigns set status='closed',updated_at=now() where id=camp.id;
      closed:=closed+1;
    end if;
  end loop;

  for camp in select * from public.evaluation_campaigns where status='open' loop
    for ev in
      select s.id as student_id,ct.teacher_id
      from public.students s
      left join lateral (
        select ct2.teacher_id from public.class_teachers ct2
        where ct2.class_id=s.class_id
        order by ct2.is_primary desc,ct2.assigned_at asc limit 1
      ) ct on true
      where s.status='active'
        and exists(select 1 from public.evaluation_campaign_classes cc where cc.campaign_id=camp.id and cc.class_id=s.class_id)
    loop
      if ev.teacher_id is not null and (camp.evaluation_number=1 or exists(
        select 1 from public.evaluations pe
        where pe.student_id=ev.student_id and pe.term_id=camp.term_id
          and pe.evaluation_number=camp.evaluation_number-1 and pe.status='approved'
      )) then
        insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,teacher_visible,teacher_visible_at,campaign_id)
        values(ev.student_id,ev.teacher_id,camp.term_id,camp.evaluation_number,'draft',true,now(),camp.id)
        on conflict(student_id,term_id,evaluation_number) do update set
          teacher_id=excluded.teacher_id,
          campaign_id=excluded.campaign_id,
          teacher_visible=true,
          teacher_visible_at=coalesce(public.evaluations.teacher_visible_at,now());
        n:=n+1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('created_campaigns',created,'opened_campaigns',opened,'closed_campaigns',closed,'drafts_prepared',n);
end;
$$;

grant execute on function public.amqm_process_calendar_automation() to authenticated;

-- The sole authoritative term transition. It is deliberately idempotent for a term already closed.
create or replace function public.close_term_and_start_next(p_term_id uuid,p_notes text default null)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  missing integer; next_id uuid; next_no smallint; current_no smallint;
  current_year uuid; next_year uuid; report_count integer:=0; invoice_count integer:=0; snapshot_count integer:=0;
  r record; cert_id uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select term_number,academic_year_id into current_no,current_year
  from public.terms where id=p_term_id for update;
  if current_no is null then raise exception 'Term not found'; end if;

  -- Refuse a transition that would leave an active learner without the full approved term record.
  select count(*) into missing
  from public.students s
  where s.status='active' and (
    not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=1 and e.status='approved') or
    not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=2 and e.status='approved') or
    not exists(select 1 from public.evaluations e where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=3 and e.status='approved')
  );
  if missing>0 then
    raise exception 'Term cannot close: % active student(s) do not have all 3 approved evaluations.',missing;
  end if;

  insert into public.term_completions(term_id,completed_by,notes)
  values(p_term_id,auth.uid(),p_notes)
  on conflict(term_id) do update set completed_at=now(),completed_by=auth.uid(),notes=coalesce(excluded.notes,public.term_completions.notes);

  update public.student_term_progress
  set status='closed',closed_at=coalesce(closed_at,now()),closed_by=auth.uid(),updated_at=now()
  where term_id=p_term_id;

  -- Freeze a database-side report-card snapshot for every learner with 3 approved evaluations.
  for r in
    select distinct s.id student_id
    from public.students s
    join public.evaluations e on e.student_id=s.id and e.term_id=p_term_id and e.status='approved' and e.evaluation_number in (1,2,3)
    group by s.id
    having count(*)=3
  loop
    insert into public.report_cards(student_id,term_id,generated_by,finalized,snapshot_data)
    select r.student_id,p_term_id,auth.uid(),true,jsonb_build_object(
      'student',(select to_jsonb(s) from public.students s where s.id=r.student_id),
      'term',(select to_jsonb(t) from public.terms t where t.id=p_term_id),
      'evaluations',coalesce((select jsonb_agg(to_jsonb(e) order by e.evaluation_number) from public.evaluations e where e.student_id=r.student_id and e.term_id=p_term_id and e.status='approved'),'[]'::jsonb),
      'term_progress',(select to_jsonb(p) from public.student_term_progress p where p.student_id=r.student_id and p.term_id=p_term_id),
      'captured_at',now()
    )
    on conflict(student_id,term_id) do update set
      finalized=true,
      snapshot_data=coalesce(public.report_cards.snapshot_data,excluded.snapshot_data),
      generated_at=coalesce(public.report_cards.generated_at,now());
    report_count:=report_count+1;
  end loop;

  -- If there is another term, prepare its exact opening position and invoice statement before activation.
  select t.id,t.term_number,t.academic_year_id into next_id,next_no,next_year
  from public.terms t
  where t.starts_on > (select starts_on from public.terms where id=p_term_id)
  order by t.starts_on,t.term_number limit 1;

  if next_id is not null then
    if current_no=3 then
      update public.students set program_year='year_2' where status='active' and program_year='year_1';
    end if;

    insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb)
    select s.id,next_id,p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb
    from public.students s
    join public.student_term_progress p on p.student_id=s.id and p.term_id=p_term_id
    where s.status='active'
    on conflict(student_id,term_id) do update set
      opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,
      opening_page=excluded.opening_page,opening_hizb=excluded.opening_hizb,updated_at=now();

    invoice_count := public.sync_term_invoices(next_id);

    update public.terms set is_current=false where is_current;
    update public.academic_years set is_current=false where is_current;
    update public.terms set is_current=true where id=next_id;
    update public.academic_years set is_current=true where id=next_year;
    update public.academic_cycle_settings
      set current_academic_year_id=next_year,current_term_id=next_id,updated_at=now()
      where id=true;

    return jsonb_build_object('closed',true,'next_term_id',next_id,'next_term_number',next_no,
      'report_cards_finalized',report_count,'next_term_invoices',invoice_count,'snapshots',report_count);
  end if;

  -- Final term: graduation itself remains governed by the existing structure-driven graduation trigger.
  -- Here we only capture immutable completion snapshots for students already graduated by the final Eval 3.
  for r in
    select s.id student_id
    from public.students s
    where s.status='graduated'
  loop
    select gcamp.id into cert_id
    from public.graduation_certificates gc
    join public.alumni_profiles ap on ap.id=gc.alumni_id
    where ap.student_id=r.student_id and gcamp.status='issued'
    order by gc.issued_at desc limit 1;

    if cert_id is not null then
      perform public.capture_program_completion_snapshot(r.student_id,p_term_id,
        (select e.id from public.evaluations e where e.student_id=r.student_id and e.term_id=p_term_id and e.evaluation_number=3 and e.status='approved' limit 1),
        cert_id);
      snapshot_count:=snapshot_count+1;
    end if;
  end loop;

  return jsonb_build_object('closed',true,'next_term_id',null,'report_cards_finalized',report_count,'completion_snapshots',snapshot_count,
    'message','Final term closed. Graduation records remain preserved.');
end;
$$;

grant execute on function public.close_term_and_start_next(uuid,text) to authenticated;

-- Protect the credit table that the finance hardening introduced.
alter table public.student_fee_credits enable row level security;
drop policy if exists "admins manage fee credits" on public.student_fee_credits;
create policy "admins manage fee credits" on public.student_fee_credits
for all to authenticated
using (public.my_role() in ('super_admin','admin','principal','finance'))
with check (public.my_role() in ('super_admin','admin','principal','finance'));

-- Newly introduced SECURITY DEFINER helpers must not be callable anonymously.
revoke execute on function public.close_term_and_start_next(uuid,text) from anon;
revoke execute on function public.amqm_process_calendar_automation() from anon;
revoke execute on function public.capture_program_completion_snapshot(uuid,uuid,uuid,uuid) from anon;

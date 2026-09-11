create or replace function public.amqm_process_calendar_automation()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  camp record; ev record; cl uuid[]; cid uuid; e_num smallint;
  n integer:=0; opened integer:=0; closed integer:=0; created integer:=0;
begin
  for ev in
    select e.*, ('evaluation_'||e.evaluation_number::text) as expected_type
    from public.school_calendar_events e
    where e.event_type in ('evaluation_1','evaluation_2','evaluation_3')
      and e.term_id is not null and e.starts_at is not null and e.ends_at is not null
  loop
    e_num := ev.evaluation_number;
    if not exists(select 1 from public.evaluation_campaigns existing_campaign where existing_campaign.term_id=ev.term_id and existing_campaign.evaluation_number=e_num) then
      select coalesce(array_agg(cls.id order by cls.name),'{}'::uuid[]) into cl
      from public.classes cls where cls.active=true;
      if coalesce(array_length(cl,1),0)>0 and now() >= ev.starts_at then
        if e_num=1 or not exists(
          select 1 from public.students s
          where s.status='active' and s.class_id=any(cl)
            and not exists(select 1 from public.evaluations pe where pe.student_id=s.id and pe.term_id=ev.term_id and pe.evaluation_number=e_num-1 and pe.status='approved')
        ) then
          insert into public.evaluation_campaigns(term_id,evaluation_number,title,calendar_event_id,opens_at,closes_at,status,created_by)
          values(ev.term_id,e_num,ev.title,ev.id,ev.starts_at,ev.ends_at,case when now()<ev.ends_at then 'open' else 'closed' end,null)
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

  -- Do not pre-create evaluation rows. The database position guard requires a real stopping
  -- position, which only exists after the teacher completes the assessment. Campaigns are
  -- the teacher work queue; evaluation rows are created when the teacher starts an assessment.

  return jsonb_build_object('created_campaigns',created,'opened_campaigns',opened,'closed_campaigns',closed,'drafts_prepared',n);
end;
$$;


grant execute on function public.amqm_process_calendar_automation() to authenticated;

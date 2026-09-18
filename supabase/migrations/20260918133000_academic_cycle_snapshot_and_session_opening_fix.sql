-- AMQM lifecycle v2.1: reliable between-term and between-session state reporting.

create or replace function public.amqm_cycle_snapshot()
returns jsonb
language sql
security definer
set search_path=public
as $$
with cur as (
  select s.current_academic_year_id ay_id, s.current_term_id term_id
  from public.academic_cycle_settings s where s.id=true
),
ay as (
  select a.* from public.academic_years a join cur on cur.ay_id=a.id
),
current_term as (
  select t.* from public.terms t join cur on cur.term_id=t.id
),
anchor_term as (
  select * from current_term
  union all
  select t.*
  from public.terms t
  join ay on ay.id=t.academic_year_id
  where (select count(*) from current_term)=0
    and t.lifecycle_status in ('historical_closed','digital_closed')
  order by t.starts_on desc,t.term_number desc
  limit 1
),
next_term as (
  select t.*
  from public.terms t join anchor_term a on t.starts_on>a.starts_on
  order by t.starts_on,t.term_number
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
  join current_term c on true
  where s.status='active'
    and c.lifecycle_status='digital_active'
    and (
      select count(*) from public.evaluations e
      where e.student_id=s.id and e.term_id=c.id
        and e.status='approved' and e.evaluation_number between 1 and 3
    )<3
),
next_term_placement as (
  select count(*) n
  from public.students s join next_term nt on true
  where s.status='active'
    and not exists(
      select 1 from public.student_enrollments se
      where se.student_id=s.id and se.term_id=nt.id
        and se.status='active' and se.class_id is not null
    )
),
next_session_placement as (
  select count(*) n
  from public.students s
  join next_session ns on true
  join public.terms nt on nt.academic_year_id=ns.id and nt.term_number=1
  where s.status='active'
    and not exists(
      select 1 from public.student_enrollments se
      where se.student_id=s.id and se.term_id=nt.id
        and se.status='active' and se.class_id is not null
    )
)
select jsonb_build_object(
  'session',(select jsonb_build_object(
    'id',ay.id,'name',ay.name,'starts_on',ay.starts_on,'ends_on',ay.ends_on,
    'status',ay.lifecycle_status,'is_current',ay.is_current,
    'opened_at',ay.opened_at,'closed_at',ay.closed_at
  ) from ay),
  'current_term',(select jsonb_build_object(
    'id',ct.id,'name',ct.name,'term_number',ct.term_number,
    'starts_on',ct.starts_on,'ends_on',ct.ends_on,
    'status',ct.lifecycle_status,'is_current',ct.is_current
  ) from current_term ct),
  'last_closed_term',(select jsonb_build_object(
    'id',at.id,'name',at.name,'term_number',at.term_number,
    'starts_on',at.starts_on,'ends_on',at.ends_on,
    'status',at.lifecycle_status,'is_current',at.is_current
  ) from anchor_term at),
  'next_term',(select jsonb_build_object(
    'id',nt.id,'name',nt.name,'term_number',nt.term_number,
    'starts_on',nt.starts_on,'ends_on',nt.ends_on,
    'status',nt.lifecycle_status,'academic_year_id',nt.academic_year_id
  ) from next_term nt),
  'next_session',(select jsonb_build_object(
    'id',ns.id,'name',ns.name,'starts_on',ns.starts_on,'ends_on',ns.ends_on,
    'status',ns.lifecycle_status
  ) from next_session ns),
  'missing_current_evaluations',(select n from missing_evals),
  'next_term_placement_pending',(select n from next_term_placement),
  'next_session_placement_pending',(select n from next_session_placement),
  'can_close_current_term',(select (
    ct.id is not null and ct.lifecycle_status='digital_active' and missing_evals.n=0
  ) from current_term ct cross join missing_evals),
  'can_open_next_term',(select (
    nt.id is not null and nt.lifecycle_status='prepared' and nt.starts_on<=current_date
  ) from next_term nt),
  'can_close_session',(select (
    ay.id is not null and ay.lifecycle_status='open'
    and not exists(
      select 1 from public.terms t
      where t.academic_year_id=ay.id
        and t.lifecycle_status not in ('historical_closed','digital_closed')
    )
    and not exists(
      select 1 from public.academic_cycle_settings s
      where s.id=true
        and s.current_academic_year_id=ay.id
        and s.current_term_id is not null
    )
  ) from ay),
  'can_open_next_session',(select (
    ns.id is not null and ns.starts_on<=current_date
    and coalesce((select ay.lifecycle_status from ay),'')='closed'
  ) from next_session ns)
);
$$;

grant execute on function public.amqm_cycle_snapshot() to authenticated;

create or replace function public.amqm_open_session(p_academic_year_id uuid,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ay public.academic_years; prev public.academic_years; prev_t3 public.terms; first_term public.terms; term_count integer:=0; promoted integer:=0; placement_pending integer:=0; fee_rows integer:=0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select * into ay from public.academic_years where id=p_academic_year_id for update;
  if ay.id is null then raise exception 'Academic session not found'; end if;
  if ay.lifecycle_status='open' then return jsonb_build_object('opened',true,'academic_year_id',ay.id,'message','This academic session is already open.'); end if;
  if ay.lifecycle_status<>'scheduled' then raise exception 'Only a scheduled academic session can be opened.'; end if;
  if ay.starts_on>current_date then raise exception 'This academic session starts on %, so it cannot be opened yet.',ay.starts_on; end if;
  select count(*) into term_count from public.terms where academic_year_id=ay.id;
  if term_count<3 then raise exception 'Session cannot open until all 3 terms are configured.'; end if;
  select * into prev from public.academic_years p where p.starts_on<ay.starts_on order by p.starts_on desc limit 1;
  if prev.id is not null and prev.lifecycle_status not in ('closed','archived') then raise exception 'Previous academic session % must be closed before opening %.',prev.name,ay.name; end if;
  select t.* into prev_t3 from public.terms t where prev.id is not null and t.academic_year_id=prev.id and t.term_number=3 limit 1;
  select t.* into first_term from public.terms t where t.academic_year_id=ay.id and t.term_number=1;

  if prev_t3.id is not null then
    update public.students s set program_year='year_2'
    where s.status='active' and s.program_year='year_1'
      and exists(select 1 from public.student_enrollments se where se.student_id=s.id and se.term_id=prev_t3.id);
    get diagnostics promoted=row_count;

    -- A new session deliberately resets returning students' old class/teacher links.
    -- Their previous placements remain preserved in term history.
    update public.students s set class_id=null
    where s.status='active'
      and not exists(
        select 1 from public.classes c
        where c.id=s.class_id
          and c.academic_year_id=ay.id
          and c.active=true
      );

    delete from public.teacher_students ts
    where exists(
      select 1 from public.students s
      where s.id=ts.student_id
        and s.status='active'
        and not exists(
          select 1 from public.classes c
          where c.id=s.class_id
            and c.academic_year_id=ay.id
            and c.active=true
        )
    );
  end if;

  insert into public.term_teacher_assignments(term_id,class_id,teacher_id,is_primary,source)
  select first_term.id,ct.class_id,ct.teacher_id,ct.is_primary,'session_open'
  from public.class_teachers ct
  join public.classes c on c.id=ct.class_id and c.academic_year_id=ay.id and c.active=true
  on conflict(term_id,class_id,teacher_id) do update set is_primary=excluded.is_primary;

  insert into public.student_enrollments(student_id,term_id,class_id,section,program_year,teacher_id,status,source)
  select s.id,first_term.id,
    case when c.id is not null then s.class_id else null end,
    s.section,s.program_year,ct.teacher_id,'active','session_open'
  from public.students s
  left join public.classes c on c.id=s.class_id and c.academic_year_id=ay.id and c.active=true
  left join lateral(
    select ct0.teacher_id from public.class_teachers ct0
    where ct0.class_id=c.id order by ct0.is_primary desc,ct0.assigned_at asc limit 1
  ) ct on true
  where s.status='active'
  on conflict(student_id,term_id) do update set
    class_id=excluded.class_id,section=excluded.section,program_year=excluded.program_year,
    teacher_id=excluded.teacher_id,status='active',updated_at=now();

  if prev_t3.id is not null then
    insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb)
    select s.id,first_term.id,p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb
    from public.students s
    join public.student_term_progress p on p.student_id=s.id and p.term_id=prev_t3.id
    where s.status='active'
    on conflict(student_id,term_id) do update set
      opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,
      opening_page=excluded.opening_page,opening_hizb=excluded.opening_hizb,updated_at=now();
  end if;

  insert into public.student_term_progress(student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb)
  select s.id,first_term.id,s.current_surah,s.current_ayah,s.current_page,s.current_hizb
  from public.students s
  where s.status='active'
    and not exists(select 1 from public.student_term_progress p where p.student_id=s.id and p.term_id=first_term.id)
  on conflict(student_id,term_id) do nothing;

  update public.terms set lifecycle_status='prepared',is_current=false
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

  update public.academic_years set is_current=false
  where is_current=true and id<>ay.id;

  update public.academic_years
  set lifecycle_status='open',is_current=true,opened_at=now(),opened_by=auth.uid(),predecessor_year_id=prev.id
  where id=ay.id;

  update public.academic_cycle_settings
  set current_academic_year_id=ay.id,current_term_id=null,updated_at=now(),updated_by=auth.uid()
  where id=true;

  insert into public.academic_cycle_events(academic_year_id,term_id,action,from_status,to_status,metadata,actor_id)
  values(ay.id,first_term.id,'open_session','scheduled','open',
    jsonb_build_object('previous_session_id',prev.id,'promoted_year1_to_year2',promoted,'placement_pending',placement_pending,'fee_rows',fee_rows,'notes',p_notes),auth.uid());

  return jsonb_build_object(
    'opened',true,'academic_year_id',ay.id,'first_term_id',first_term.id,
    'promoted_year1_to_year2',promoted,'placement_pending',placement_pending,'fee_rows',fee_rows,
    'message',case when placement_pending>0
      then 'Academic session opened. Returning students were carried forward; place students into the new session classes before opening First Term.'
      else 'Academic session opened. First Term is prepared and ready to open when its start date and final checks are satisfied.'
    end
  );
end;
$$;

grant execute on function public.amqm_open_session(uuid,text) to authenticated;
notify pgrst,'reload schema';
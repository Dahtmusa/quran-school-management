-- AMQM simple academic calendar control
-- One save action drives the academic year, terms, evaluation windows,
-- current-term flags and evaluation campaign processing.

create or replace function public.amqm_sync_calendar_state()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_year public.academic_years;
  v_term public.terms;
  v_current_year uuid;
  v_current_term uuid;
begin
  select * into v_year
  from public.academic_years
  where current_date between starts_on and ends_on
  order by starts_on desc
  limit 1;

  if v_year.id is not null then
    update public.academic_years set is_current=false where is_current=true and id<>v_year.id;
    update public.academic_years set is_current=true where id=v_year.id;

    select * into v_term
    from public.terms
    where academic_year_id=v_year.id
      and current_date between starts_on and ends_on
    order by term_number
    limit 1;

    if v_term.id is not null then
      update public.terms
      set is_current=false
      where is_current=true and id<>v_term.id;

      if v_term.lifecycle_status = 'scheduled' then
        update public.terms
        set lifecycle_status='digital_active'
        where id=v_term.id;
      end if;

      update public.terms set is_current=true where id=v_term.id;

      update public.academic_cycle_settings
      set current_academic_year_id=v_year.id,
          current_term_id=v_term.id,
          updated_at=now()
      where id=true;

      v_current_year := v_year.id;
      v_current_term := v_term.id;
    else
      select current_academic_year_id,current_term_id
      into v_current_year,v_current_term
      from public.academic_cycle_settings
      where id=true;
    end if;
  else
    select current_academic_year_id,current_term_id
    into v_current_year,v_current_term
    from public.academic_cycle_settings
    where id=true;
  end if;

  return jsonb_build_object(
    'academic_year_id',v_current_year,
    'term_id',v_current_term
  );
end;
$$;

grant execute on function public.amqm_sync_calendar_state() to authenticated;


create or replace function public.amqm_save_simple_calendar(
  p_year_name text,
  p_year_start date,
  p_year_end date,
  p_terms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid := auth.uid();
  ay_id uuid;
  term_id uuid;
  existing_term record;
  term_item jsonb;
  eval_item jsonb;
  n integer;
  saved_terms integer := 0;
  saved_evals integer := 0;
  v_term_start date;
  v_term_end date;
  open_ts timestamptz;
  close_ts timestamptz;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  if trim(coalesce(p_year_name,''))='' then
    raise exception 'Academic year name is required';
  end if;

  if p_year_end <= p_year_start then
    raise exception 'Session closing date must be after the opening date';
  end if;

  if jsonb_typeof(coalesce(p_terms,'[]'::jsonb)) <> 'array' then
    raise exception 'Term configuration is invalid';
  end if;

  insert into public.academic_years(name,starts_on,ends_on,is_current,lifecycle_status)
  values(trim(p_year_name),p_year_start,p_year_end,(current_date between p_year_start and p_year_end),'open')
  on conflict(name) do update set
    starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    is_current=excluded.is_current,
    lifecycle_status=case
      when public.academic_years.lifecycle_status in ('closed','archived') then public.academic_years.lifecycle_status
      else excluded.lifecycle_status
    end
  returning id into ay_id;

  if current_date between p_year_start and p_year_end then
    update public.academic_years set is_current=false where is_current=true and id<>ay_id;
    update public.academic_years set is_current=true where id=ay_id;
  end if;

  for term_item in
    select value from jsonb_array_elements(p_terms)
    order by (value->>'term_number')::int
  loop
    n := coalesce((term_item->>'term_number')::int,0);
    if n not between 1 and 3 then
      raise exception 'Term number must be 1, 2 or 3';
    end if;

    v_term_start := nullif(term_item->>'start','')::date;
    v_term_end := nullif(term_item->>'end','')::date;

    if v_term_start is null or v_term_end is null then
      continue;
    end if;

    if v_term_end < v_term_start then
      raise exception 'Term % ends before it starts', n;
    end if;

    if v_term_start < p_year_start or v_term_end > p_year_end then
      raise exception 'Term % must fall within the academic session dates', n;
    end if;

    if exists(
      select 1
      from public.terms t
      where t.academic_year_id=ay_id
        and t.term_number<>n
        and v_term_start <= t.ends_on
        and v_term_end >= t.starts_on
    ) then
      raise exception 'Term % overlaps another term', n;
    end if;

    insert into public.terms(academic_year_id,name,term_number,starts_on,ends_on,is_current,lifecycle_status)
    values(
      ay_id,
      case n when 1 then 'First Term' when 2 then 'Second Term' else 'Third Term' end,
      n,v_term_start,v_term_end,
      (current_date between v_term_start and v_term_end),
      case when current_date between v_term_start and v_term_end
        then 'digital_active' else 'scheduled' end
    )
    on conflict(academic_year_id,term_number) do update set
      name=excluded.name,
      starts_on=excluded.starts_on,
      ends_on=excluded.ends_on,
      is_current=excluded.is_current,
      lifecycle_status=case
        when public.terms.lifecycle_status in ('historical_baseline','historical_closed','digital_closed')
          then public.terms.lifecycle_status
        else excluded.lifecycle_status
      end
    returning id into term_id;

    saved_terms := saved_terms + 1;

    insert into public.school_calendar_events(
      academic_year_id,term_id,event_type,title,starts_on,ends_on,
      starts_at,ends_at,published,created_by,evaluation_number,notes
    )
    values(
      ay_id,term_id,'term_start',
      case n when 1 then 'First Term Starts' when 2 then 'Second Term Starts' else 'Third Term Starts' end,
      v_term_start,v_term_start,
      v_term_start::timestamptz,v_term_start::timestamptz,
      true,actor,null,'Managed by the Academic Calendar.'
    );

    insert into public.school_calendar_events(
      academic_year_id,term_id,event_type,title,starts_on,ends_on,
      starts_at,ends_at,published,created_by,evaluation_number,notes
    )
    values(
      ay_id,term_id,'term_end',
      case n when 1 then 'First Term Ends' when 2 then 'Second Term Ends' else 'Third Term Ends' end,
      v_term_end,v_term_end,
      v_term_end::timestamptz,v_term_end::timestamptz,
      true,actor,null,'Managed by the Academic Calendar.'
    );

    for eval_item in
      select value from jsonb_array_elements(coalesce(term_item->'evaluations','[]'::jsonb))
    loop
      if nullif(eval_item->>'open','') is null and nullif(eval_item->>'close','') is null then
        continue;
      end if;

      if nullif(eval_item->>'open','') is null or nullif(eval_item->>'close','') is null then
        raise exception 'Evaluation % in Term % needs both open and close dates', coalesce((eval_item->>'number')::int,0), n;
      end if;

      open_ts := (eval_item->>'open')::timestamptz;
      close_ts := (eval_item->>'close')::timestamptz;

      if close_ts <= open_ts then
        raise exception 'Evaluation % in Term % must close after it opens', coalesce((eval_item->>'number')::int,0), n;
      end if;

      if (open_ts at time zone 'Africa/Lagos')::date < v_term_start
         or (close_ts at time zone 'Africa/Lagos')::date > v_term_end then
        raise exception 'Evaluation % in Term % must fall inside that term', coalesce((eval_item->>'number')::int,0), n;
      end if;

      insert into public.school_calendar_events(
        academic_year_id,term_id,event_type,title,starts_on,ends_on,
        starts_at,ends_at,published,created_by,evaluation_number,notes
      )
      values(
        ay_id,term_id,
        'evaluation_' || (eval_item->>'number')::int,
        case (eval_item->>'number')::int
          when 1 then 'Evaluation 1'
          when 2 then 'Evaluation 2'
          else 'Evaluation 3'
        end,
        (open_ts at time zone 'Africa/Lagos')::date,
        (close_ts at time zone 'Africa/Lagos')::date,
        open_ts,close_ts,true,actor,(eval_item->>'number')::int,
        'Managed by the Academic Calendar.'
      )
      on conflict (event_type,term_id,evaluation_number)
      where event_type in ('evaluation_1','evaluation_2','evaluation_3')
        and term_id is not null
      do update set
        academic_year_id=excluded.academic_year_id,
        title=excluded.title,
        starts_on=excluded.starts_on,
        ends_on=excluded.ends_on,
        starts_at=excluded.starts_at,
        ends_at=excluded.ends_at,
        published=true,
        updated_at=now(),
        notes=excluded.notes;

      saved_evals := saved_evals + 1;
    end loop;
  end loop;

  -- Session markers. These remain one per academic session.
  insert into public.school_calendar_events(
    academic_year_id,event_type,title,starts_on,ends_on,starts_at,ends_at,published,created_by
  )
  values(
    ay_id,'school_opening','Session Opening – '||trim(p_year_name),
    p_year_start,p_year_start,p_year_start::timestamptz,p_year_start::timestamptz,
    true,actor
  )
  on conflict(event_type,title)
  where event_type in ('school_opening','school_closing')
  do update set
    academic_year_id=excluded.academic_year_id,
    starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    updated_at=now();

  insert into public.school_calendar_events(
    academic_year_id,event_type,title,starts_on,ends_on,starts_at,ends_at,published,created_by
  )
  values(
    ay_id,'school_closing','Session Closing – '||trim(p_year_name),
    p_year_end,p_year_end,p_year_end::timestamptz,p_year_end::timestamptz,
    true,actor
  )
  on conflict(event_type,title)
  where event_type in ('school_opening','school_closing')
  do update set
    academic_year_id=excluded.academic_year_id,
    starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    updated_at=now();

  perform public.amqm_sync_calendar_state();
  perform public.amqm_process_calendar_automation();

  return jsonb_build_object(
    'academic_year_id',ay_id,
    'terms_saved',saved_terms,
    'evaluation_windows_saved',saved_evals
  );
end;
$$;

grant execute on function public.amqm_save_simple_calendar(text,date,date,jsonb) to authenticated;

notify pgrst,'reload schema';

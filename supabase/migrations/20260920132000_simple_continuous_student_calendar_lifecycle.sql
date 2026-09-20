-- AMQM simplified academic calendar lifecycle
-- Academic years describe the school's calendar only. They do not promote,
-- reset or relocate a student's Quran journey.
--
-- Existing student core data and historical term records remain untouched
-- when a new school year is opened.

create or replace function public.amqm_open_session(
  p_academic_year_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ay public.academic_years;
  first_term public.terms;
  previous_year public.academic_years;
  previous_active boolean := false;
  term_count integer := 0;
  prepared_terms integer := 0;
  fee_rows integer := 0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into ay
  from public.academic_years
  where id=p_academic_year_id
  for update;

  if ay.id is null then
    raise exception 'Academic year not found';
  end if;

  if ay.lifecycle_status='open' then
    return jsonb_build_object(
      'opened',true,
      'academic_year_id',ay.id,
      'message','This school year is already open.'
    );
  end if;

  if ay.lifecycle_status<>'scheduled' then
    raise exception 'Only a scheduled school year can be opened.';
  end if;

  if ay.starts_on > current_date then
    raise exception 'This school year starts on %, so it cannot be opened yet.',ay.starts_on;
  end if;

  select count(*) into term_count
  from public.terms
  where academic_year_id=ay.id;

  if term_count<3 then
    raise exception 'School year cannot open until all 3 terms exist.';
  end if;

  select * into first_term
  from public.terms
  where academic_year_id=ay.id
    and term_number=1
  limit 1;

  if first_term.id is null then
    raise exception 'First Term is missing.';
  end if;

  select p.* into previous_year
  from public.academic_years p
  where p.starts_on < ay.starts_on
  order by p.starts_on desc
  limit 1;

  if previous_year.id is not null then
    select exists(
      select 1
      from public.academic_cycle_settings s
      where s.id=true
        and s.current_academic_year_id=previous_year.id
    ) into previous_active;
  end if;

  if previous_active then
    raise exception 'The previous school year is still the active calendar year. It can finish its calendar while students continue their Quran journey, but only one school calendar year can be active at a time.';
  end if;

  -- Prepare this year's three terms without touching any student record.
  update public.terms
  set lifecycle_status='prepared',
      is_current=false
  where academic_year_id=ay.id
    and lifecycle_status='scheduled';
  get diagnostics prepared_terms=row_count;

  select public.sync_term_invoices(first_term.id) into fee_rows;

  update public.academic_years
  set is_current=false
  where is_current=true
    and id<>ay.id;

  update public.terms
  set is_current=false
  where is_current=true
    and academic_year_id<>ay.id;

  update public.academic_years
  set lifecycle_status='open',
      is_current=true,
      opened_at=coalesce(opened_at,now()),
      opened_by=coalesce(opened_by,auth.uid()),
      predecessor_year_id=previous_year.id
  where id=ay.id;

  update public.academic_cycle_settings
  set current_academic_year_id=ay.id,
      current_term_id=null,
      updated_at=now(),
      updated_by=auth.uid()
  where id=true;

  insert into public.academic_cycle_events(
    academic_year_id,
    term_id,
    action,
    from_status,
    to_status,
    metadata,
    actor_id
  )
  values(
    ay.id,
    first_term.id,
    'open_session_simple',
    'scheduled',
    'open',
    jsonb_build_object(
      'previous_session_id',previous_year.id,
      'student_records_changed',false,
      'quran_progress_changed',false,
      'student_promotion',false,
      'prepared_terms',prepared_terms,
      'fee_rows',fee_rows,
      'notes',p_notes
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'opened',true,
    'academic_year_id',ay.id,
    'first_term_id',first_term.id,
    'student_records_changed',false,
    'quran_progress_changed',false,
    'prepared_terms',prepared_terms,
    'fee_rows',fee_rows,
    'message','School year opened. Existing students and their Quran progress were not moved, promoted or reset.'
  );
end;
$$;

grant execute on function public.amqm_open_session(uuid,text) to authenticated;

-- A calendar year can close after its three calendar terms close. Student
-- completion is independent and is handled by the Hifz completion workflow.
create or replace function public.amqm_close_session(
  p_academic_year_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ay public.academic_years;
  total_terms integer := 0;
  open_terms integer := 0;
  current_term uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into ay
  from public.academic_years
  where id=p_academic_year_id
  for update;

  if ay.id is null then
    raise exception 'Academic year not found';
  end if;

  if ay.lifecycle_status<>'open' then
    raise exception 'Only an open school year can be closed.';
  end if;

  select count(*) into total_terms
  from public.terms
  where academic_year_id=ay.id;

  if total_terms<3 then
    raise exception 'School year cannot close until all 3 terms exist.';
  end if;

  select count(*) into open_terms
  from public.terms
  where academic_year_id=ay.id
    and lifecycle_status not in ('historical_closed','digital_closed');

  if open_terms>0 then
    raise exception 'School year cannot close: % term(s) are still open or scheduled.',open_terms;
  end if;

  select current_term_id into current_term
  from public.academic_cycle_settings
  where id=true;

  if current_term is not null
     and exists(select 1 from public.terms t where t.id=current_term and t.academic_year_id=ay.id) then
    raise exception 'School year cannot close while a term is active.';
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
    academic_year_id,
    action,
    from_status,
    to_status,
    metadata,
    actor_id
  )
  values(
    ay.id,
    'close_session_simple',
    'open',
    'closed',
    jsonb_build_object(
      'student_completion_not_checked',true,
      'notes',p_notes
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'closed',true,
    'academic_year_id',ay.id,
    'message','School year closed. Student Quran journeys remain active until each student completes or leaves the programme.'
  );
end;
$$;

grant execute on function public.amqm_close_session(uuid,text) to authenticated;

notify pgrst,'reload schema';

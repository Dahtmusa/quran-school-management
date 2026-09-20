-- AMQM simplified academic calendar continuation
-- Lets administrators create the next school year from the same calendar screen
-- without taking over or resetting the current year.
--
-- Important design rule:
-- A school year is a calendar container. A student's Quran journey remains
-- independent of that calendar year until completion.

create or replace function public.amqm_create_next_school_year(
  p_current_year_id uuid,
  p_year_name text,
  p_year_start date,
  p_year_end date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  current_year public.academic_years;
  next_year_id uuid;
  first_term_id uuid;
  second_term_id uuid;
  third_term_id uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into current_year
  from public.academic_years
  where id=p_current_year_id
  for share;

  if current_year.id is null then
    raise exception 'Current school year not found';
  end if;

  if trim(coalesce(p_year_name,''))='' then
    raise exception 'Next school year name is required';
  end if;

  if p_year_end <= p_year_start then
    raise exception 'Next school year closing date must be after the opening date';
  end if;

  if p_year_start <= current_year.ends_on then
    raise exception 'The next school year must start after the current school year ends';
  end if;

  select id into next_year_id
  from public.academic_years
  where name=trim(p_year_name);

  if next_year_id is not null then
    raise exception 'School year % already exists', trim(p_year_name);
  end if;

  insert into public.academic_years(
    name,starts_on,ends_on,is_current,lifecycle_status,predecessor_year_id
  )
  values(
    trim(p_year_name),p_year_start,p_year_end,false,'scheduled',current_year.id
  )
  returning id into next_year_id;

  insert into public.terms(
    academic_year_id,name,term_number,starts_on,ends_on,is_current,lifecycle_status
  )
  values
    (next_year_id,'First Term',1,null,null,false,'scheduled')
  returning id into first_term_id;

  insert into public.terms(
    academic_year_id,name,term_number,starts_on,ends_on,is_current,lifecycle_status
  )
  values
    (next_year_id,'Second Term',2,null,null,false,'scheduled')
  returning id into second_term_id;

  insert into public.terms(
    academic_year_id,name,term_number,starts_on,ends_on,is_current,lifecycle_status
  )
  values
    (next_year_id,'Third Term',3,null,null,false,'scheduled')
  returning id into third_term_id;

  insert into public.academic_cycle_events(
    academic_year_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    next_year_id,
    'create_school_year',
    null,
    'scheduled',
    jsonb_build_object(
      'predecessor_year_id',current_year.id,
      'student_progress_unchanged',true,
      'terms_created',3
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'created',true,
    'academic_year_id',next_year_id,
    'first_term_id',first_term_id,
    'second_term_id',second_term_id,
    'third_term_id',third_term_id,
    'message','Next school year created. Existing student Quran journeys were not changed.'
  );
end;
$$;

grant execute on function public.amqm_create_next_school_year(uuid,text,date,date) to authenticated;

notify pgrst,'reload schema';

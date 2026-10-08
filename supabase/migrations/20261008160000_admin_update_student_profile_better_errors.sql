-- The generic "Admission number is already used by another student"
-- banner was hiding WHICH statement in admin_update_student_profile
-- actually violated the unique constraint. Replace the blanket
-- exception handler with one that includes the SQLSTATE, the inner
-- Postgres message, and the context, so the admin UI can show the
-- real diagnostic.

create or replace function public.admin_update_student_profile(
  p_student_id        uuid,
  p_full_name         text default null,
  p_admission_no      text default null,
  p_date_of_birth     date default null,
  p_gender            text default null,
  p_section           public.section_type default null,
  p_program_year      public.program_year default null,
  p_class_id          uuid default null,
  p_photo_url         text default null,
  p_blood_group       text default null,
  p_genotype          text default null,
  p_nationality       text default null,
  p_state_of_origin   text default null,
  p_local_government  text default null,
  p_home_address      text default null,
  p_parent_name       text default null,
  p_parent_phone      text default null,
  p_parent_email      text default null,
  p_guardian_name     text default null,
  p_guardian_phone    text default null,
  p_guardian_email    text default null,
  p_guardian_relationship text default null,
  p_emergency_contact_name  text default null,
  p_emergency_contact_phone text default null,
  p_clear_photo       boolean default false,
  p_clear_class       boolean default false,
  p_auto_regenerate_admission_no boolean default false
)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_before public.students;
  v_after  public.students;
  v_adm_in text;
  v_adm_lower text;
  v_norm_admission_no text;
  v_year integer;
  v_year_match text;
  v_year_changed boolean := false;
  v_err_message text;
  v_err_detail text;
  v_err_hint text;
  v_err_context text;
begin
  v_role := public.my_role();
  if v_role is null then raise exception 'Sign-in required'; end if;
  if v_role not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required to edit student profile';
  end if;

  select * into v_before from public.students where id = p_student_id;
  if v_before.id is null then raise exception 'Student not found'; end if;

  if p_program_year is not null and p_program_year is distinct from v_before.program_year then
    v_year_changed := true;
  end if;

  if p_admission_no is not null then
    v_adm_in := btrim(p_admission_no);
    v_adm_lower := lower(v_adm_in);

    if v_adm_in = ''
       or v_adm_lower in ('auto','generate','-')
       or v_adm_lower like '%auto%'
       or v_adm_lower like '%generate%'
    then
      v_year_match := (regexp_match(v_adm_in, '(20\d{2})'))[1];
      if v_year_match is not null then
        v_year := v_year_match::integer;
      else
        v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
      end if;
      v_norm_admission_no := public.amqm_next_vacant_student_admission_no(v_year);
    else
      v_norm_admission_no := v_adm_in;
      if v_norm_admission_no <> v_before.admission_no
         and exists (
           select 1 from public.students
           where lower(admission_no) = lower(v_norm_admission_no)
             and id <> p_student_id
         ) then
        raise exception 'Admission number % is already used by another student. Pick a different one.', v_norm_admission_no;
      end if;
    end if;
  elsif p_auto_regenerate_admission_no and v_year_changed then
    v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
    v_norm_admission_no := public.amqm_next_vacant_student_admission_no(v_year);
  end if;

  begin
    update public.students set
      full_name         = coalesce(p_full_name, full_name),
      admission_no      = coalesce(v_norm_admission_no, admission_no),
      date_of_birth     = coalesce(p_date_of_birth, date_of_birth),
      gender            = coalesce(p_gender, gender),
      section           = coalesce(p_section, section),
      program_year      = coalesce(p_program_year, program_year),
      class_id          = case
                            when p_clear_class then null
                            when p_class_id is not null then p_class_id
                            else class_id
                          end,
      photo_url         = case
                            when p_clear_photo then null
                            when p_photo_url is not null then p_photo_url
                            else photo_url
                          end,
      blood_group       = coalesce(p_blood_group, blood_group),
      genotype          = coalesce(p_genotype, genotype),
      nationality       = coalesce(p_nationality, nationality),
      state_of_origin   = coalesce(p_state_of_origin, state_of_origin),
      local_government  = coalesce(p_local_government, local_government),
      home_address      = coalesce(p_home_address, home_address),
      parent_name       = coalesce(p_parent_name, parent_name),
      parent_phone      = coalesce(p_parent_phone, parent_phone),
      parent_email      = coalesce(p_parent_email, parent_email),
      guardian_name     = coalesce(p_guardian_name, guardian_name),
      guardian_phone    = coalesce(p_guardian_phone, guardian_phone),
      guardian_email    = coalesce(p_guardian_email, guardian_email),
      guardian_relationship    = coalesce(p_guardian_relationship, guardian_relationship),
      emergency_contact_name   = coalesce(p_emergency_contact_name, emergency_contact_name),
      emergency_contact_phone  = coalesce(p_emergency_contact_phone, emergency_contact_phone)
    where id = p_student_id
    returning * into v_after;
  exception
    when unique_violation then
      -- Surface the real detail so the admin can tell whether the
      -- clash was on admission_no (our generator was wrong) or on
      -- some other unique constraint on students (e.g. staff_id,
      -- username) that we did not expect.
      get stacked diagnostics
        v_err_message = message_text,
        v_err_detail  = pg_exception_detail,
        v_err_hint    = pg_exception_hint,
        v_err_context = pg_exception_context;
      raise exception 'UPDATE students failed with unique_violation. intended_admission_no=% detail=% hint=% context=%',
        coalesce(v_norm_admission_no, '(unchanged)'),
        coalesce(v_err_detail, '(none)'),
        coalesce(v_err_hint, '(none)'),
        coalesce(v_err_context, '(none)');
  end;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
  values (auth.uid(),'admin_update_student_profile','student',p_student_id,
          to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

grant execute on function public.admin_update_student_profile(
  uuid,text,text,date,text,public.section_type,public.program_year,uuid,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,boolean
) to authenticated;

notify pgrst, 'reload schema';

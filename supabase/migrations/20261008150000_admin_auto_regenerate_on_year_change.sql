-- Auto-regenerate admission_no whenever the admin changes program_year.
--
-- UX intent: the admin should never need to type an admission number.
-- They just correct the Year 1 / Year 2 dropdown, press Save, and the
-- system silently assigns the next vacant number for the student's
-- intake year, preserving every record linked to the student's UUID.
--
-- admin_update_student_profile gains one parameter:
--   p_auto_regenerate_admission_no boolean  (default false)
--
-- When true AND program_year is actually changing, the function
-- regenerates admission_no using amqm_next_vacant_student_admission
-- _no(). The year component is taken from the student's existing
-- admission_date (preserving historical accuracy) -- so a Year-2
-- student who was admitted in 2024 keeps the 2024 prefix but gets a
-- fresh sequence number that is guaranteed vacant.
--
-- The explicit p_admission_no path still works for the rare case
-- where an admin needs to type a specific number (e.g. correcting a
-- typo without changing year).

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
begin
  v_role := public.my_role();
  if v_role is null then raise exception 'Sign-in required'; end if;
  if v_role not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required to edit student profile';
  end if;

  select * into v_before from public.students where id = p_student_id;
  if v_before.id is null then raise exception 'Student not found'; end if;

  -- Decide if program_year is actually changing (not just "same value
  -- passed back"). Only then is auto-regenerate meaningful.
  if p_program_year is not null and p_program_year is distinct from v_before.program_year then
    v_year_changed := true;
  end if;

  -- Priority 1: explicit admission_no from the admin (manual override
  -- or the "auto" sentinel). Priority 2: automatic regeneration when
  -- year changed. Priority 3: leave admission_no as-is.
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
        raise exception 'Admission number % is already used by another student.', v_norm_admission_no;
      end if;
    end if;
  elsif p_auto_regenerate_admission_no and v_year_changed then
    -- Admin changed Year 1 <-> Year 2 and asked us to renumber. Use
    -- the student's existing intake year so historical records stay
    -- consistent and the renumber is just a sequence refresh.
    v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
    v_norm_admission_no := public.amqm_next_vacant_student_admission_no(v_year);
  end if;

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

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
  values (auth.uid(),'admin_update_student_profile','student',p_student_id,
          to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
exception
  when unique_violation then
    raise exception 'Admission number is already used by another student.';
end;
$$;

grant execute on function public.admin_update_student_profile(
  uuid,text,text,date,text,public.section_type,public.program_year,uuid,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,boolean
) to authenticated;

notify pgrst, 'reload schema';

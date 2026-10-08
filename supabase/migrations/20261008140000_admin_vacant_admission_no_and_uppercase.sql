-- Two fixes rolled into one migration:
--
-- 1. The old generate_student_admission_no() returned the next value
--    from a counter that could lag behind reality (bulk imports from
--    migrations 043-049 bypassed it). The result was that "auto" could
--    hand the admin a number that was ALREADY in use by another
--    student, so saving still raised a duplicate error.
--
-- 2. The old generator produced lowercase prefixes ("AMQM/Stu/…")
--    while every existing student record and every ID card uses
--    uppercase "AMQM/STU/…". The mixed-case was visible on new
--    numbers only -- confusing for admins reading the directory.
--
-- Fix: public.amqm_next_vacant_student_admission_no(p_year) walks
-- forward from the counter until it finds a number not already in
-- students.admission_no (case-insensitive). It also uses UPPERCASE
-- "STU" to match the rest of the system.
--
-- admin_update_student_profile is updated to call this helper
-- instead of generate_student_admission_no when the admin asks for
-- "auto". Everything else about that RPC stays the same.

create or replace function public.amqm_next_vacant_student_admission_no(
  p_year integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  candidate text;
  tries integer := 0;
begin
  loop
    n := public.next_school_number('student', p_year);
    candidate := 'AMQM/STU/' || p_year::text || '/' || lpad(n::text, 3, '0');

    -- Case-insensitive uniqueness check (the real UNIQUE index is on
    -- the raw text column so case matters there, but we want to avoid
    -- producing "AMQM/STU/2025/002" when "AMQM/Stu/2025/002" is in
    -- the table too -- a reader cannot tell them apart).
    exit when not exists (
      select 1 from public.students
      where lower(admission_no) = lower(candidate)
    );

    -- Safety fuse. In the worst case the counter is thousands behind
    -- -- loop at most 10000 times before giving up with a useful
    -- error so the admin knows the counter is corrupt.
    tries := tries + 1;
    if tries > 10000 then
      raise exception 'Could not find a vacant admission number for % after 10000 attempts. Admission counter likely corrupt.', p_year;
    end if;
  end loop;

  return candidate;
end;
$$;

grant execute on function public.amqm_next_vacant_student_admission_no(integer) to authenticated;

-- Re-create admin_update_student_profile so it uses the new helper
-- for "auto". Same signature so nothing in the client has to change.

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
  p_clear_class       boolean default false
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
begin
  v_role := public.my_role();
  if v_role is null then raise exception 'Sign-in required'; end if;
  if v_role not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required to edit student profile';
  end if;

  select * into v_before from public.students where id = p_student_id;
  if v_before.id is null then raise exception 'Student not found'; end if;

  if p_admission_no is not null then
    v_adm_in := btrim(p_admission_no);
    v_adm_lower := lower(v_adm_in);

    if v_adm_in = ''
       or v_adm_lower in ('auto','generate','-')
       or v_adm_lower like '%auto%'
       or v_adm_lower like '%generate%'
    then
      -- Year priority: explicit 4-digit year in sentinel, then student's
      -- own admission_date year, then current year. program_year is
      -- deliberately NOT used here because "Year 1"/"Year 2" refers to
      -- the student's position in the memorisation programme, not to
      -- the calendar year of admission -- a Year 2 student was admitted
      -- in a prior calendar year, so admission_date is the right source.
      v_year_match := (regexp_match(v_adm_in, '(20\d{2})'))[1];
      if v_year_match is not null then
        v_year := v_year_match::integer;
      else
        v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
      end if;

      v_norm_admission_no := public.amqm_next_vacant_student_admission_no(v_year);
    else
      v_norm_admission_no := v_adm_in;

      -- Only check manual admission_no for collision (auto path cannot
      -- collide, the helper loops until it finds a vacant number).
      if v_norm_admission_no <> v_before.admission_no
         and exists (
           select 1 from public.students
           where lower(admission_no) = lower(v_norm_admission_no)
             and id <> p_student_id
         ) then
        raise exception 'Admission number % is already used by another student. Pick a different one or type "auto" to let the system assign one.', v_norm_admission_no;
      end if;
    end if;
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
    raise exception 'Admission number is already used by another student. Pick a different one or type "auto".';
end;
$$;

grant execute on function public.admin_update_student_profile(
  uuid,text,text,date,text,public.section_type,public.program_year,uuid,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean
) to authenticated;

notify pgrst, 'reload schema';

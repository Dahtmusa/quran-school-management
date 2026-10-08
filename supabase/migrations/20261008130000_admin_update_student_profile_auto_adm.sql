-- Extend admin_update_student_profile so admission_no can be
-- auto-regenerated. Admin UI now exposes a "Generate" button; backend
-- treats 'auto', 'generate', '-' or an empty-trimmed string as "please
-- assign the next free number for the chosen admission year".
--
-- Year source priority:
--   1. the year embedded in the passed-in admission_no, if any
--      (e.g. "auto 2025" or "AMQM/STU/2025/auto"); otherwise
--   2. the year on the student's admission_date; otherwise
--   3. the current year.
--
-- Everything else about this function stays the same as the previous
-- migration (20261008120000). This is CREATE OR REPLACE so existing
-- consumers keep working.

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
  if v_role is null then
    raise exception 'Sign-in required';
  end if;
  if v_role not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required to edit student profile';
  end if;

  select * into v_before from public.students where id = p_student_id;
  if v_before.id is null then
    raise exception 'Student not found';
  end if;

  -- Decide what to do with the admission_no the caller passed.
  if p_admission_no is not null then
    v_adm_in := btrim(p_admission_no);
    v_adm_lower := lower(v_adm_in);

    -- Auto-regeneration sentinels: empty, 'auto', 'generate', '-',
    -- or a string that still contains the word 'auto' anywhere.
    if v_adm_in = ''
       or v_adm_lower in ('auto','generate','-')
       or v_adm_lower like '%auto%'
       or v_adm_lower like '%generate%'
    then
      -- Prefer a 4-digit year embedded in the sentinel string; else
      -- fall back to the student's admission_date year; else today.
      v_year_match := (regexp_match(v_adm_in, '(20\d{2})'))[1];
      if v_year_match is not null then
        v_year := v_year_match::integer;
      else
        v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
      end if;

      v_norm_admission_no := public.generate_student_admission_no(v_year);
    else
      v_norm_admission_no := v_adm_in;
    end if;

    -- Validate uniqueness only when the resolved number is actually
    -- different from the current one.
    if v_norm_admission_no <> v_before.admission_no
       and exists (
         select 1 from public.students
         where admission_no = v_norm_admission_no
           and id <> p_student_id
       ) then
      raise exception 'Admission number % is already used by another student. Pick a different one or type "auto" to let the system assign one.', v_norm_admission_no;
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

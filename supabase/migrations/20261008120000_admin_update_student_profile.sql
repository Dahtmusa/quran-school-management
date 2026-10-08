-- Single admin-facing RPC that updates ANY editable column on a
-- student record in one transaction. Replaces four scattered
-- PostgREST updates (updateStudentBasic / Section / Class /
-- Extended) that were occasionally silently filtered by RLS and
-- surfaced raw duplicate-key errors to the admin UI.
--
-- Why one RPC:
--  1. SECURITY DEFINER sidesteps any transient my_role() hiccup
--     that was silently dropping updates to 0 rows.
--  2. Explicit COALESCE semantics -- admin passes only the fields
--     they want to change; nulls mean "leave as-is".
--  3. Admission_no is validated before UPDATE so a collision
--     produces a friendly error instead of the raw Postgres
--     "duplicate key value violates students_admission_no_key".
--  4. Admin can now change admission_no (flex for mistakes made
--     during enrollment), program_year, section, class_id, DOB,
--     photo, parents, guardian -- everything in one atomic step.
--
-- Allowed roles: super_admin, admin, principal, admissions.
-- All other callers get a plain 'not authorized' error.

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
  -- "true" sentinels force a null wipe (admin cleared the field).
  -- Any field passed as its default (null) is treated as "unchanged"
  -- so partial updates work without stomping unrelated columns.
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
  v_norm_admission_no text;
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

  -- Validate admission_no change before UPDATE so we return a
  -- readable message instead of a raw constraint violation.
  if p_admission_no is not null then
    v_norm_admission_no := btrim(p_admission_no);
    if v_norm_admission_no = '' then
      raise exception 'Admission number cannot be blank';
    end if;
    if v_norm_admission_no <> v_before.admission_no
       and exists (
         select 1 from public.students
         where admission_no = v_norm_admission_no
           and id <> p_student_id
       ) then
      raise exception 'Admission number % is already used by another student. Pick a different one.', v_norm_admission_no;
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
    -- Belt-and-suspenders: in case the check above was raced by a
    -- concurrent write, turn the raw duplicate error into a friendly one.
    raise exception 'Admission number is already used by another student. Pick a different one.';
end;
$$;

grant execute on function public.admin_update_student_profile(
  uuid,text,text,date,text,public.section_type,public.program_year,uuid,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean
) to authenticated;

notify pgrst, 'reload schema';

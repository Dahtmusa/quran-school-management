-- When admin corrects a student's section (day <-> boarding) the
-- student_fees rows still point to the OLD section's fee_structures,
-- so the student is charged the wrong amount for every term.
--
-- Fee re-alignment helper: for one student + one target section,
-- re-point every student_fees row to the matching section's
-- fee_structure for the same (academic_year, term) and refresh
-- amount_due. amount_paid is deliberately preserved so a student who
-- already paid day-term1 does not lose that payment -- the recorded
-- outstanding balance for the term just rebalances to the new fee.
--
-- The function returns the count of rebalanced rows and a summary so
-- the admin RPC can mention it in the success toast.
--
-- Then wire the helper into admin_update_student_profile so a section
-- change triggers rebalancing automatically.

create or replace function public.amqm_realign_student_fees_to_section(
  p_student_id uuid,
  p_section    public.section_type
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rebalanced int := 0;
  v_missing    int := 0;
  v_total      int := 0;
  r            record;
  v_target_fs  public.fee_structures;
begin
  select count(*) into v_total
  from public.student_fees where student_id = p_student_id;

  for r in
    select sf.id as student_fee_id,
           sf.fee_structure_id,
           sf.amount_due,
           sf.amount_paid,
           fs.academic_year_id,
           fs.term_id,
           fs.section
    from public.student_fees sf
    join public.fee_structures fs on fs.id = sf.fee_structure_id
    where sf.student_id = p_student_id
      and fs.section is distinct from p_section
  loop
    -- Find the equivalent fee_structure for the SAME period but in
    -- the new section. We match on (academic_year, term, section).
    select *
      into v_target_fs
    from public.fee_structures
    where academic_year_id = r.academic_year_id
      and term_id is not distinct from r.term_id
      and section = p_section
    order by amount desc
    limit 1;

    if v_target_fs.id is null then
      -- No matching fee_structure in the new section for this term.
      -- Leave the row as-is; admin can create the fee structure and
      -- re-run the realignment manually. Counts for diagnostic.
      v_missing := v_missing + 1;
      continue;
    end if;

    update public.student_fees
       set fee_structure_id = v_target_fs.id,
           amount_due       = v_target_fs.amount
     where id = r.student_fee_id;

    v_rebalanced := v_rebalanced + 1;
  end loop;

  return jsonb_build_object(
    'rebalanced', v_rebalanced,
    'missing_target_structure', v_missing,
    'total_fee_rows', v_total,
    'target_section', p_section::text
  );
end;
$$;

grant execute on function public.amqm_realign_student_fees_to_section(uuid, public.section_type) to authenticated;

-- Wire realignment into the admin profile RPC. Only fires when
-- section actually changed. Non-fatal: if realignment fails for any
-- reason, the profile update still goes through -- we just log the
-- outcome to audit_logs so admins can inspect it.

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
  v_section_changed boolean := false;
  v_is_auto boolean := false;
  v_tries integer := 0;
  v_err_detail text;
  v_realign jsonb;
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
  if p_section is not null and p_section is distinct from v_before.section then
    v_section_changed := true;
  end if;

  if p_admission_no is not null then
    v_adm_in := btrim(p_admission_no);
    v_adm_lower := lower(v_adm_in);
    if v_adm_in = ''
       or v_adm_lower in ('auto','generate','-')
       or v_adm_lower like '%auto%'
       or v_adm_lower like '%generate%'
    then
      v_is_auto := true;
      v_year_match := (regexp_match(v_adm_in, '(20\d{2})'))[1];
      if v_year_match is not null then v_year := v_year_match::integer;
      else v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
      end if;
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
    v_is_auto := true;
    v_year := extract(year from coalesce(v_before.admission_date, current_date))::integer;
  end if;

  loop
    if v_is_auto then
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
        class_id          = case when p_clear_class then null
                                 when p_class_id is not null then p_class_id
                                 else class_id end,
        photo_url         = case when p_clear_photo then null
                                 when p_photo_url is not null then p_photo_url
                                 else photo_url end,
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
      exit;
    exception
      when unique_violation then
        v_tries := v_tries + 1;
        if not v_is_auto or v_tries >= 5 then
          get stacked diagnostics v_err_detail = pg_exception_detail;
          raise exception 'Could not save a free admission number for this student after % attempt(s). Last tried: %. Postgres said: %',
            v_tries, coalesce(v_norm_admission_no, '(unchanged)'), coalesce(v_err_detail, '(no detail)');
        end if;
    end;
  end loop;

  -- Section changed? Rebalance every student_fees row to the matching
  -- fee_structure in the new section. Non-fatal: on any failure the
  -- outcome is logged and the profile update stands.
  if v_section_changed then
    begin
      v_realign := public.amqm_realign_student_fees_to_section(p_student_id, v_after.section);
    exception when others then
      v_realign := jsonb_build_object('error', SQLERRM);
    end;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
  values (auth.uid(),'admin_update_student_profile','student',p_student_id,
          to_jsonb(v_before),
          to_jsonb(v_after) ||
            case when v_realign is not null
                 then jsonb_build_object('fee_realignment', v_realign)
                 else '{}'::jsonb end);

  return v_after;
end;
$$;

grant execute on function public.admin_update_student_profile(
  uuid,text,text,date,text,public.section_type,public.program_year,uuid,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,boolean
) to authenticated;

notify pgrst, 'reload schema';

-- Switch the certificate number prefix from CERT to GRAD per school preference.
-- Also backfills any existing certificate with the previous AMQM/CERT/... format
-- so numbering stays consistent across old and new graduates.

create or replace function public.amqm_promote_to_alumni(
  p_student_id uuid,
  p_graduation_year int,
  p_cohort_name text,
  p_graduation_term text,
  p_issue_certificate boolean default true
) returns public.alumni_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students;
  v_class_name text;
  v_teacher_name text;
  v_final_position text;
  v_alumni public.alumni_profiles;
  v_cert_number text;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_cohort_name), '') is null or nullif(trim(p_graduation_term), '') is null then
    raise exception 'Cohort and graduation term are required.';
  end if;
  if p_graduation_year < 2020 or p_graduation_year > 2100 then
    raise exception 'Graduation year must be between 2020 and 2100.';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then raise exception 'Student not found'; end if;

  if exists (select 1 from public.alumni_profiles where student_id = p_student_id) then
    raise exception '% is already promoted to alumni.', v_student.full_name;
  end if;

  select c.name into v_class_name
    from public.classes c where c.id = v_student.class_id;

  select tp.full_name into v_teacher_name
    from public.class_teachers ct
    join public.profiles tp on tp.id = ct.teacher_id
   where ct.class_id = v_student.class_id
   order by ct.is_primary desc nulls last, ct.assigned_at asc
   limit 1;

  v_final_position := 'Surah ' || v_student.current_surah || ', Ayah ' || v_student.current_ayah;

  insert into public.alumni_profiles(
    student_id, full_name, graduation_year, cohort_name, graduation_term,
    final_quran_position, completion_percentage,
    profile_photo_url, published, published_on_homepage
  ) values (
    v_student.id, v_student.full_name, p_graduation_year, trim(p_cohort_name), trim(p_graduation_term),
    v_final_position, 100,
    v_student.photo_url, false, false
  )
  returning * into v_alumni;

  update public.students
     set status = 'alumni'
   where id = p_student_id and status <> 'alumni';

  if coalesce(p_issue_certificate, true) then
    v_cert_number := 'AMQM/GRAD/' || p_graduation_year || '/' ||
                     lpad((select count(*) + 1 from public.graduation_certificates
                            where extract(year from issued_at)::int = p_graduation_year)::text, 4, '0');
    insert into public.graduation_certificates(
      alumni_id, certificate_number, issued_at, template_key,
      recipient_name, programme_name, cohort_name, final_term, status
    ) values (
      v_alumni.id, v_cert_number, current_date, 'quran-completion-classic',
      v_student.full_name, 'Two-Year Quran Memorization Programme',
      trim(p_cohort_name), trim(p_graduation_term), 'issued'
    );
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'alumni:promote', 'students', p_student_id,
          jsonb_build_object('alumni_id', v_alumni.id, 'cert_issued', coalesce(p_issue_certificate, true),
                             'certificate_number', v_cert_number,
                             'class_at_graduation', v_class_name,
                             'teacher_at_graduation', v_teacher_name));

  return v_alumni;
end;
$$;

grant execute on function public.amqm_promote_to_alumni(uuid, int, text, text, boolean) to authenticated;

-- Backfill: rename any existing AMQM/CERT/... numbers to AMQM/GRAD/...
update public.graduation_certificates
   set certificate_number = replace(certificate_number, 'AMQM/CERT/', 'AMQM/GRAD/')
 where certificate_number like 'AMQM/CERT/%';

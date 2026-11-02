-- 1. One certificate-number format everywhere: AMQM/GRAD/YYYY/NNNN.
--    The automatic completion trigger (finalize_quran_completion) still
--    generated the old 'ALH-YYYY-<admission no>' numbers, which is why some
--    certificates showed e.g. ALH-2026-AMQM/STU.
-- 2. Public certificate verification for the QR code on each certificate.

create or replace function public.amqm_next_graduation_certificate_number(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  -- Serialise number allocation per year so two approvals can't collide.
  perform pg_advisory_xact_lock(hashtext('amqm_grad_cert_' || p_year));
  select coalesce(max((regexp_match(certificate_number, '^AMQM/GRAD/\d{4}/(\d+)$'))[1]::int), 0) + 1
    into v_next
    from public.graduation_certificates
   where certificate_number like 'AMQM/GRAD/' || p_year || '/%';
  return 'AMQM/GRAD/' || p_year || '/' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.amqm_next_graduation_certificate_number(int) from public, anon, authenticated;

-- Renumber every certificate not already in the new format, oldest first.
do $$
declare r record;
begin
  for r in
    select id, extract(year from issued_at)::int as y
      from public.graduation_certificates
     where certificate_number !~ '^AMQM/GRAD/\d{4}/\d{4}$'
     order by issued_at, created_at
  loop
    update public.graduation_certificates
       set certificate_number = public.amqm_next_graduation_certificate_number(r.y)
     where id = r.id;
  end loop;
end $$;

-- Automatic completion trigger: same behaviour as before, new numbering.
-- The old number was derived from the admission number, which is what stopped
-- a re-approval from issuing a second certificate (on conflict do nothing).
-- Sequential numbers can't do that, so guard explicitly on the alumni record.
create or replace function public.finalize_quran_completion()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.students;
  final_term public.terms;
  direction public.memorization_direction;
  final_global integer;
  required_global integer;
  v_alumni_id uuid;
  certificate_no text;
  cohort text;
  grad_year integer;
begin
  if new.status <> 'approved' or old.status is not distinct from 'approved' then
    return new;
  end if;

  select * into s from public.students where id=new.student_id for update;
  if s.id is null or s.status not in ('active','graduated') then return new; end if;

  select t.* into final_term from public.terms t where t.id=new.term_id;
  select memorization_direction into direction from public.students where id=s.id;

  select q.global_ayah into final_global
  from public.quran_verses q
  where q.surah=new.to_surah and q.ayah=new.to_ayah
  limit 1;

  select max(global_ayah) into required_global from public.quran_verses;

  if final_global is null or required_global is null then return new; end if;
  if direction='nas_to_baqarah' then
    if final_global <> 1 then return new; end if;
  elsif final_global <> required_global then
    return new;
  end if;

  select extract(year from coalesce((select starts_on from public.academic_years where id=final_term.academic_year_id),current_date))::int
    into grad_year;
  cohort := coalesce((select name from public.academic_years where id=final_term.academic_year_id),'Completion '||grad_year);

  update public.students
  set status='alumni'
  where id=s.id;

  insert into public.student_program_completions(
    student_id,academic_year_id,final_term_id,final_evaluation_id,
    final_surah,final_ayah,final_global_ayah,completion_percentage,completed_at,completed_by,snapshot
  )
  values(
    s.id,final_term.academic_year_id,new.term_id,new.id,
    new.to_surah,new.to_ayah,final_global,100,now(),auth.uid(),
    jsonb_build_object(
      'admission_no',s.admission_no,
      'full_name',s.full_name,
      'start_surah',s.start_surah,
      'start_ayah',s.start_ayah,
      'final_surah',new.to_surah,
      'final_ayah',new.to_ayah,
      'final_global_ayah',final_global,
      'completed_evaluation_id',new.id,
      'completed_term_id',new.term_id,
      'completed_academic_year_id',final_term.academic_year_id
    )
  )
  on conflict do nothing;

  insert into public.alumni_profiles(
    student_id,full_name,graduation_year,cohort_name,graduation_term,
    final_quran_position,completion_percentage,profile_photo_url,
    brief_bio,published,published_on_homepage
  )
  values(
    s.id,s.full_name,grad_year,cohort,coalesce(final_term.name,'Quran Completion'),
    new.to_surah::text||':'||new.to_ayah::text,100,s.photo_url,
    'Graduate of AMQM Quran Memorization.',false,false
  )
  on conflict(student_id) do update set
    full_name=excluded.full_name,
    graduation_year=excluded.graduation_year,
    cohort_name=excluded.cohort_name,
    graduation_term=excluded.graduation_term,
    final_quran_position=excluded.final_quran_position,
    completion_percentage=100,
    updated_at=now()
  returning id into v_alumni_id;

  if not exists (
    select 1 from public.graduation_certificates gc
     where gc.alumni_id = v_alumni_id and gc.status = 'issued'
  ) then
    certificate_no := public.amqm_next_graduation_certificate_number(grad_year);
    insert into public.graduation_certificates(
      alumni_id,certificate_number,issued_at,recipient_name,
      programme_name,cohort_name,final_term,status
    )
    values(
      v_alumni_id,certificate_no,current_date,s.full_name,
      'AMQM Quran Memorization Journey',cohort,coalesce(final_term.name,'Quran Completion'),'issued'
    );
  end if;

  return new;
end;
$$;

-- Manual promotion: use the shared, collision-safe generator.
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

  select c.name into v_class_name from public.classes c where c.id = v_student.class_id;

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

  update public.students set status = 'alumni' where id = p_student_id and status <> 'alumni';

  if coalesce(p_issue_certificate, true) then
    v_cert_number := public.amqm_next_graduation_certificate_number(p_graduation_year);
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

-- Public verification. Accepts either the certificate's id (what the QR code
-- carries) or its printed number (typed in by hand). Certificate numbers are
-- sequential and therefore guessable, so the graduate's photo is only
-- returned for the unguessable id from the QR code.
create or replace function public.amqm_verify_certificate(p_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ref text := trim(coalesce(p_ref, ''));
  v_by_id boolean := false;
  v_cert public.graduation_certificates;
  v_alumni public.alumni_profiles;
  v_student public.students;
  v_class text;
  v_teacher text;
begin
  if v_ref = '' then return jsonb_build_object('found', false); end if;

  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_by_id := true;
    select * into v_cert from public.graduation_certificates where id = v_ref::uuid;
  else
    select * into v_cert from public.graduation_certificates where upper(certificate_number) = upper(v_ref);
  end if;
  if v_cert.id is null then return jsonb_build_object('found', false); end if;

  select * into v_alumni from public.alumni_profiles where id = v_cert.alumni_id;
  select * into v_student from public.students where id = v_alumni.student_id;
  select c.name into v_class from public.classes c where c.id = v_student.class_id;
  select tp.full_name into v_teacher
    from public.class_teachers ct
    join public.profiles tp on tp.id = ct.teacher_id
   where ct.class_id = v_student.class_id
   order by ct.is_primary desc nulls last, ct.assigned_at asc
   limit 1;

  return jsonb_build_object(
    'found', true,
    'status', v_cert.status,
    'certificate_number', v_cert.certificate_number,
    'recipient_name', v_cert.recipient_name,
    'programme_name', v_cert.programme_name,
    'cohort_name', v_cert.cohort_name,
    'final_term', v_cert.final_term,
    'issued_at', v_cert.issued_at,
    'graduation_year', v_alumni.graduation_year,
    'class_name', v_class,
    'teacher_name', v_teacher,
    'photo_url', case when v_by_id then coalesce(v_student.photo_url, v_alumni.profile_photo_url) end
  );
end;
$$;

revoke all on function public.amqm_verify_certificate(text) from public;
grant execute on function public.amqm_verify_certificate(text) to anon, authenticated;

notify pgrst, 'reload schema';

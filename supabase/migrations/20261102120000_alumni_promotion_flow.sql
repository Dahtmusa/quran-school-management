-- Alumni promotion flow:
--  1. A student completing memorization is already marked status='alumni'
--     by the two-year progression + evaluation close triggers. But no
--     alumni_profiles row is created automatically -- admin must review
--     and promote so cohort/year/certificate details are captured.
--  2. amqm_potential_alumni() returns every student who is either flagged
--     alumni, or whose current Qur'an position reached the end for their
--     memorization direction, AND does NOT yet have an alumni_profiles row.
--     This is the "potential alumni batch" the admin sees.
--  3. amqm_promote_to_alumni(student_id, year, cohort, term, issue_cert)
--     creates the alumni_profiles row from student + class + teacher data,
--     ensures student.status='alumni', optionally issues a certificate.
--  4. amqm_alumni_full(alumni_id) returns everything the admin wants to
--     see on one page: the alumni profile, the linked student record,
--     outstanding fees, every evaluation ever recorded, teacher + class
--     at graduation.

-- 1. Potential alumni queue
create or replace function public.amqm_potential_alumni()
returns table (
  student_id       uuid,
  full_name        text,
  admission_no     text,
  photo_url        text,
  class_name       text,
  teacher_name     text,
  memorization_direction text,
  current_surah    smallint,
  current_ayah     smallint,
  progress_percent numeric,
  status           text,
  outstanding_fees numeric,
  evaluations_count integer,
  already_promoted boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.full_name,
    s.admission_no,
    s.photo_url,
    c.name,
    tp.full_name,
    s.memorization_direction::text,
    s.current_surah,
    s.current_ayah,
    coalesce(cp.progress_percent, 0),
    s.status::text,
    coalesce(fees.due, 0),
    coalesce(evs.cnt, 0)::int,
    exists(select 1 from public.alumni_profiles ap where ap.student_id = s.id)
  from public.students s
  left join public.classes c on c.id = s.class_id
  left join lateral (
    select ct.teacher_id from public.class_teachers ct
     where ct.class_id = s.class_id
     order by ct.is_primary desc nulls last, ct.assigned_at asc
     limit 1
  ) ct on true
  left join public.profiles tp on tp.id = ct.teacher_id
  left join lateral (
    select cp0.progress_percent
      from public.get_student_canonical_quran_progress(s.id) cp0
     limit 1
  ) cp on true
  left join lateral (
    select coalesce(sum(amount_due - amount_paid), 0) as due
      from public.student_fees
     where student_id = s.id and amount_paid < amount_due
  ) fees on true
  left join lateral (
    select count(*) as cnt from public.evaluations e where e.student_id = s.id
  ) evs on true
  where public.my_role() in ('super_admin','admin','principal')
    and s.status <> 'deleted'
    and (
         s.status = 'alumni'
         or coalesce(cp.progress_percent, 0) >= 100
         or (s.memorization_direction = 'baqarah_to_nas'::public.memorization_direction
             and s.current_surah = 114 and s.current_ayah >= 6)
         or (s.memorization_direction = 'nas_to_baqarah'::public.memorization_direction
             and s.current_surah = 1 and s.current_ayah = 1)
    )
    and not exists (select 1 from public.alumni_profiles ap where ap.student_id = s.id);
$$;

revoke all on function public.amqm_potential_alumni() from public;
grant execute on function public.amqm_potential_alumni() to authenticated;

-- 2. Promote to alumni (and optionally issue a certificate in the same call)
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
    v_cert_number := 'AMQM/CERT/' || p_graduation_year || '/' ||
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

revoke all on function public.amqm_promote_to_alumni(uuid, int, text, text, boolean) from public;
grant execute on function public.amqm_promote_to_alumni(uuid, int, text, text, boolean) to authenticated;

-- 3. Full alumni dossier for the admin
create or replace function public.amqm_alumni_full(p_alumni_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumni public.alumni_profiles;
  v_result jsonb;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into v_alumni from public.alumni_profiles where id = p_alumni_id;
  if not found then raise exception 'Alumni record not found'; end if;

  select jsonb_build_object(
    'alumni', to_jsonb(v_alumni),
    'student', (select to_jsonb(s) from public.students s where s.id = v_alumni.student_id),
    'class', (
      select jsonb_build_object('id', c.id, 'name', c.name)
        from public.students s
        join public.classes c on c.id = s.class_id
       where s.id = v_alumni.student_id
    ),
    'teacher', (
      select jsonb_build_object('id', tp.id, 'full_name', tp.full_name,
                                'phone', tp.phone, 'email', tp.email, 'photo', tp.avatar_url)
        from public.students s
        join public.class_teachers ct on ct.class_id = s.class_id
        join public.profiles tp on tp.id = ct.teacher_id
       where s.id = v_alumni.student_id
       order by ct.is_primary desc nulls last, ct.assigned_at asc
       limit 1
    ),
    'certificates', (
      select coalesce(jsonb_agg(to_jsonb(gc) order by gc.issued_at desc), '[]'::jsonb)
        from public.graduation_certificates gc
       where gc.alumni_id = v_alumni.id
    ),
    'evaluations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'term', t.name, 'evaluation_number', e.evaluation_number,
        'status', e.status, 'from_surah', e.from_surah, 'from_ayah', e.from_ayah,
        'to_surah', e.to_surah, 'to_ayah', e.to_ayah,
        'memorization_score', e.memorization_score, 'accuracy_score', e.accuracy_score,
        'fluency_score', e.fluency_score, 'tajweed_score', e.tajweed_score,
        'retention_score', e.retention_score,
        'teacher_comment', e.teacher_comment,
        'approved_at', e.approved_at
      ) order by t.starts_on, e.evaluation_number), '[]'::jsonb)
        from public.evaluations e
        join public.terms t on t.id = e.term_id
       where e.student_id = v_alumni.student_id
    ),
    'fees', (
      select jsonb_build_object(
        'total_due', coalesce(sum(amount_due), 0),
        'total_paid', coalesce(sum(amount_paid), 0),
        'outstanding', coalesce(sum(amount_due - amount_paid), 0)
      )
        from public.student_fees
       where student_id = v_alumni.student_id
    ),
    'fee_lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sf.id, 'amount_due', sf.amount_due, 'amount_paid', sf.amount_paid,
        'term', t.name, 'fee_type', fs.fee_type, 'description', fs.description
      ) order by t.starts_on desc), '[]'::jsonb)
        from public.student_fees sf
        left join public.fee_structures fs on fs.id = sf.fee_structure_id
        left join public.terms t on t.id = fs.term_id
       where sf.student_id = v_alumni.student_id
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method
      ) order by p.paid_on desc), '[]'::jsonb)
        from public.payments p
       where p.student_id = v_alumni.student_id
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.amqm_alumni_full(uuid) from public;
grant execute on function public.amqm_alumni_full(uuid) to authenticated;

-- 4. Admin alumni list (confirmed)
create or replace function public.amqm_alumni_list()
returns table (
  alumni_id uuid,
  student_id uuid,
  full_name text,
  graduation_year int,
  cohort_name text,
  graduation_term text,
  final_quran_position text,
  profile_photo_url text,
  published boolean,
  published_on_homepage boolean,
  outstanding_fees numeric,
  certificate_number text,
  class_at_graduation text,
  teacher_at_graduation text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.student_id,
    a.full_name,
    a.graduation_year,
    a.cohort_name,
    a.graduation_term,
    a.final_quran_position,
    a.profile_photo_url,
    a.published,
    a.published_on_homepage,
    coalesce((select sum(sf.amount_due - sf.amount_paid)
                from public.student_fees sf
               where sf.student_id = a.student_id and sf.amount_paid < sf.amount_due), 0),
    (select gc.certificate_number from public.graduation_certificates gc
      where gc.alumni_id = a.id and gc.status = 'issued' order by gc.issued_at desc limit 1),
    (select c.name from public.students s left join public.classes c on c.id = s.class_id
      where s.id = a.student_id),
    (select tp.full_name
       from public.students s
       join public.class_teachers ct on ct.class_id = s.class_id
       join public.profiles tp on tp.id = ct.teacher_id
      where s.id = a.student_id
      order by ct.is_primary desc nulls last, ct.assigned_at asc
      limit 1)
  from public.alumni_profiles a
  where public.my_role() in ('super_admin','admin','principal')
  order by a.graduation_year desc, a.full_name;
$$;

revoke all on function public.amqm_alumni_list() from public;
grant execute on function public.amqm_alumni_list() to authenticated;

-- 5. Toggle publication state (admin)
create or replace function public.amqm_alumni_toggle_publication(
  p_alumni_id uuid,
  p_published boolean,
  p_homepage boolean
) returns public.alumni_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.alumni_profiles;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  update public.alumni_profiles
     set published = coalesce(p_published, published),
         published_on_homepage = coalesce(p_homepage, published_on_homepage),
         updated_at = now()
   where id = p_alumni_id
   returning * into v_row;
  if not found then raise exception 'Alumni not found'; end if;
  return v_row;
end;
$$;

revoke all on function public.amqm_alumni_toggle_publication(uuid, boolean, boolean) from public;
grant execute on function public.amqm_alumni_toggle_publication(uuid, boolean, boolean) to authenticated;

-- 6. Public alumni cards (for the homepage).
create or replace view public.public_alumni_cards
with (security_invoker = false) as
select
  a.id,
  a.full_name,
  a.graduation_year,
  a.cohort_name,
  a.graduation_term,
  a.profile_photo_url,
  (select c.name
     from public.students s left join public.classes c on c.id = s.class_id
    where s.id = a.student_id) as class_at_graduation,
  (select tp.full_name
     from public.students s
     join public.class_teachers ct on ct.class_id = s.class_id
     join public.profiles tp on tp.id = ct.teacher_id
    where s.id = a.student_id
    order by ct.is_primary desc nulls last, ct.assigned_at asc
    limit 1) as teacher_at_graduation
from public.alumni_profiles a
where a.published = true;

grant select on public.public_alumni_cards to anon, authenticated;

notify pgrst, 'reload schema';

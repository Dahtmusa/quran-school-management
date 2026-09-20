-- AMQM continuous school years, admissions screening and Quran-completion lifecycle.
-- School years are calendar containers. Student Quran journeys are independent.
-- Remote applicants (outside Adamawa) receive a unique AMQM screening link.
-- Physical applicants (Adamawa) are screened on campus.

alter table public.admissions
  add column if not exists screening_mode text,
  add column if not exists screening_outcome text,
  add column if not exists screening_scheduled_at timestamptz,
  add column if not exists screening_token text;

alter table public.admissions
  drop constraint if exists admissions_screening_mode_check;
alter table public.admissions
  add constraint admissions_screening_mode_check
  check (screening_mode is null or screening_mode in ('physical','virtual'));

alter table public.admissions
  drop constraint if exists admissions_screening_outcome_check;
alter table public.admissions
  add constraint admissions_screening_outcome_check
  check (screening_outcome is null or screening_outcome in ('successful','unsuccessful','further_assessment'));

create unique index if not exists admissions_screening_token_uidx
  on public.admissions(screening_token)
  where screening_token is not null;

create index if not exists admissions_screening_schedule_idx
  on public.admissions(screening_scheduled_at)
  where screening_scheduled_at is not null;

-- Backfill the screening mode from the applicant's declared state.
update public.admissions
set screening_mode = case
  when lower(trim(coalesce(state,''))) = 'adamawa' then 'physical'
  else 'virtual'
end
where screening_mode is null;

-- Schedule/create a screening session. Virtual sessions get an unguessable token.
create or replace function public.amqm_schedule_admission_screening(
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.admissions;
  mode text;
  token text;
begin
  if public.my_role() not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required';
  end if;

  select * into a from public.admissions where id=p_application_id for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.payment_status <> 'verified' then raise exception 'Verify the application payment before scheduling screening'; end if;

  mode := case when lower(trim(coalesce(a.state,'')))='adamawa' then 'physical' else 'virtual' end;
  token := a.screening_token;

  if mode='virtual' and token is null then
    token := encode(gen_random_bytes(24),'hex');
  end if;

  update public.admissions
  set screening_mode=mode,
      screening_scheduled_at=p_scheduled_at,
      screening_token=token,
      screening_outcome=null,
      screening_notes=coalesce(p_notes,screening_notes),
      status='screening_scheduled',
      reviewed_by=auth.uid(),
      reviewed_at=now()
  where id=a.id;

  return jsonb_build_object(
    'application_id',a.id,
    'application_no',a.application_no,
    'screening_mode',mode,
    'scheduled_at',p_scheduled_at,
    'screening_token',token,
    'portal_path',case when mode='virtual' then '/admissions/screening/'||token else null end
  );
end;
$$;

grant execute on function public.amqm_schedule_admission_screening(uuid,timestamptz,text) to authenticated;

-- Public token lookup exposes only the information needed for the interview room.
create or replace function public.amqm_get_admission_screening(p_token text)
returns table(
  application_id uuid,
  application_no text,
  applicant_name text,
  date_of_birth date,
  gender text,
  state text,
  lga text,
  quran_level text,
  starting_surah smallint,
  starting_ayah smallint,
  screening_mode text,
  screening_scheduled_at timestamptz,
  screening_outcome text,
  screening_status text
)
language sql
security definer
set search_path=public
as $$
  select
    a.id,a.application_no,a.applicant_name,a.date_of_birth,a.gender,a.state,a.lga,
    a.quran_level,a.starting_surah,a.starting_ayah,a.screening_mode,a.screening_scheduled_at,
    a.screening_outcome,a.status
  from public.admissions a
  where a.screening_token=p_token
    and a.screening_mode='virtual'
    and a.status in ('screening_scheduled','screened','accepted','further_assessment');
$$;

grant execute on function public.amqm_get_admission_screening(text) to anon,authenticated;

-- Save a screening outcome and make successful applicants available for class/start-position assignment.
create or replace function public.amqm_save_admission_screening(
  p_application_id uuid,
  p_outcome text,
  p_score numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare a public.admissions;
begin
  if public.my_role() not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required';
  end if;

  if p_outcome not in ('successful','unsuccessful','further_assessment') then
    raise exception 'Invalid screening outcome';
  end if;

  select * into a from public.admissions where id=p_application_id for update;
  if a.id is null then raise exception 'Application not found'; end if;

  update public.admissions
  set screening_outcome=p_outcome,
      screening_score=p_score,
      screening_notes=p_notes,
      status=case
        when p_outcome='successful' then 'accepted'
        when p_outcome='unsuccessful' then 'unsuccessful'
        else 'further_assessment'
      end,
      reviewed_by=auth.uid(),
      reviewed_at=now()
  where id=a.id;

  return jsonb_build_object(
    'application_id',a.id,
    'application_no',a.application_no,
    'outcome',p_outcome,
    'status',case
      when p_outcome='successful' then 'accepted'
      when p_outcome='unsuccessful' then 'unsuccessful'
      else 'further_assessment'
    end
  );
end;
$$;

grant execute on function public.amqm_save_admission_screening(uuid,text,numeric,text) to authenticated;

-- Enrollment is only available after a successful screening decision.
create or replace function public.enroll_admission_application(
  p_application_id uuid,
  p_class_id uuid,
  p_starting_surah smallint,
  p_starting_ayah smallint,
  p_screening_score numeric,
  p_screening_notes text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.admissions;
  sid uuid;
  ano text;
  current_year uuid;
begin
  if public.my_role() not in ('super_admin','admin','principal','admissions') then
    raise exception 'Administrator access required';
  end if;

  select * into a from public.admissions where id=p_application_id for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.payment_status <> 'verified' then raise exception 'Application fee must be verified before admission'; end if;
  if a.screening_outcome <> 'successful' or a.status <> 'accepted' then
    raise exception 'Applicant must have a successful screening outcome before enrollment';
  end if;

  select current_academic_year_id into current_year
  from public.academic_cycle_settings where id=true;

  insert into public.students(
    admission_no,full_name,date_of_birth,gender,section,program_year,admission_date,status,
    photo_url,start_surah,start_ayah,current_surah,current_ayah,class_id
  )
  values(
    'auto',a.applicant_name,a.date_of_birth,a.gender,a.requested_section,
    a.requested_program_year,current_date,'active',null,
    coalesce(p_starting_surah,a.starting_surah),
    coalesce(p_starting_ayah,a.starting_ayah),
    coalesce(p_starting_surah,a.starting_surah),
    coalesce(p_starting_ayah,a.starting_ayah),
    p_class_id
  )
  returning id,admission_no into sid,ano;

  update public.admissions
  set status='enrolled',
      screening_score=coalesce(p_screening_score,screening_score),
      screening_notes=coalesce(p_screening_notes,screening_notes),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      enrolled_student_id=sid
  where id=a.id;

  -- Create the student's first term enrollment only when a current school year/term exists.
  insert into public.student_enrollments(student_id,term_id,class_id,section,program_year,status,source)
  select sid,t.id,p_class_id,a.requested_section,a.requested_program_year,'active','admission'
  from public.terms t
  where t.academic_year_id=current_year and t.term_number=1
    and t.lifecycle_status in ('prepared','digital_active')
  order by t.starts_on
  limit 1
  on conflict(student_id,term_id) do nothing;

  return jsonb_build_object(
    'student_id',sid,
    'admission_no',ano,
    'quran_start',jsonb_build_object(
      'surah',coalesce(p_starting_surah,a.starting_surah),
      'ayah',coalesce(p_starting_ayah,a.starting_ayah)
    ),
    'academic_year_id',current_year
  );
end;
$$;

grant execute on function public.enroll_admission_application(uuid,uuid,smallint,smallint,numeric,text) to authenticated;

-- Quran completion is independent of school-year chronology.
-- Completion is triggered by an approved evaluation reaching the end of the student's
-- configured direction, regardless of whether the student is in a particular "program year".
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
  alumni_id uuid;
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

  -- Preserve every existing record and create a permanent completion snapshot.
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
  returning id into alumni_id;

  certificate_no := 'ALH-'||grad_year||'-'||upper(substr(replace(s.admission_no,'-',''),1,8));

  insert into public.graduation_certificates(
    alumni_id,certificate_number,issued_at,recipient_name,
    programme_name,cohort_name,final_term,status
  )
  values(
    alumni_id,certificate_no,current_date,s.full_name,
    'AMQM Quran Memorization Journey',cohort,coalesce(final_term.name,'Quran Completion'),'issued'
  )
  on conflict(certificate_number) do nothing;

  return new;
end;
$$;

drop trigger if exists finalize_year2_graduation on public.evaluations;
drop trigger if exists finalize_quran_completion on public.evaluations;
create trigger finalize_quran_completion
after update on public.evaluations
for each row execute function public.finalize_quran_completion();

grant execute on function public.finalize_quran_completion() to authenticated;

notify pgrst,'reload schema';

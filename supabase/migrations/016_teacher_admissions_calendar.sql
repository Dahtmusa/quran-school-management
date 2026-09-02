-- AMQM teacher least-privilege portal, admissions workflow, school calendar, and controlled evaluation visibility.

alter table public.evaluations add column if not exists teacher_visible boolean not null default false;
alter table public.evaluations add column if not exists teacher_visible_at timestamptz;

alter table public.admissions add column if not exists date_of_birth date;
alter table public.admissions add column if not exists gender text;
alter table public.admissions add column if not exists address text;
alter table public.admissions add column if not exists state text;
alter table public.admissions add column if not exists lga text;
alter table public.admissions add column if not exists guardian_name text;
alter table public.admissions add column if not exists guardian_phone text;
alter table public.admissions add column if not exists guardian_email text;
alter table public.admissions add column if not exists guardian_relationship text;
alter table public.admissions add column if not exists previous_school text;
alter table public.admissions add column if not exists quran_level text;
alter table public.admissions add column if not exists starting_surah smallint;
alter table public.admissions add column if not exists starting_ayah smallint;
alter table public.admissions add column if not exists application_fee numeric not null default 5000;
alter table public.admissions add column if not exists payment_status text not null default 'pending' check(payment_status in ('pending','submitted','verified','rejected'));
alter table public.admissions add column if not exists payment_reference text;
alter table public.admissions add column if not exists screening_date date;
alter table public.admissions add column if not exists screening_score numeric;
alter table public.admissions add column if not exists screening_notes text;
alter table public.admissions add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.admissions add column if not exists reviewed_at timestamptz;
alter table public.admissions add column if not exists enrolled_student_id uuid references public.students(id);

create table if not exists public.school_calendar_events(
 id uuid primary key default gen_random_uuid(),
 academic_year_id uuid references public.academic_years(id) on delete set null,
 term_id uuid references public.terms(id) on delete set null,
 event_type text not null check(event_type in ('school_opening','school_closing','term_start','term_end','evaluation_1','evaluation_2','evaluation_3','holiday','screening','other')),
 title text not null,
 starts_on date not null,
 ends_on date,
 notes text,
 published boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists school_calendar_events_dates_idx on public.school_calendar_events(starts_on,ends_on);

alter table public.school_calendar_events enable row level security;
drop policy if exists "public can read published calendar" on public.school_calendar_events;
create policy "public can read published calendar" on public.school_calendar_events for select to anon,authenticated using(published=true or public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "admins manage school calendar" on public.school_calendar_events;
create policy "admins manage school calendar" on public.school_calendar_events for all to authenticated using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));

-- Teachers can update only their own contact/profile image. They never receive student write access.
drop policy if exists "teachers update own profile" on public.profiles;
create policy "teachers update own profile" on public.profiles for update to authenticated using(id=auth.uid() and public.my_role()='teacher') with check(id=auth.uid() and public.my_role()='teacher');

-- Teachers may record attendance only for students assigned to them.
drop policy if exists "teachers create assigned attendance" on public.attendance_records;
create policy "teachers create assigned attendance" on public.attendance_records for insert to authenticated with check(public.my_role()='teacher' and recorded_by=auth.uid() and exists(select 1 from public.teacher_students ts where ts.teacher_id=auth.uid() and ts.student_id=attendance_records.student_id));
drop policy if exists "teachers update own attendance" on public.attendance_records;
create policy "teachers update own attendance" on public.attendance_records for update to authenticated using(public.my_role()='teacher' and recorded_by=auth.uid() and exists(select 1 from public.teacher_students ts where ts.teacher_id=auth.uid() and ts.student_id=attendance_records.student_id)) with check(public.my_role()='teacher' and recorded_by=auth.uid());

-- Parents' contact information is exposed to teachers only through the secure directory function below.
create or replace function public.get_teacher_student_directory()
returns table(
 student_id uuid, admission_no text, full_name text, date_of_birth date, gender text, section public.section_type,
 program_year public.program_year, status text, photo_url text, start_surah smallint, start_ayah smallint,
 current_surah smallint, current_ayah smallint, current_page smallint, current_hizb smallint,
 class_id uuid, class_name text, parent_name text, parent_phone text, parent_email text, parent_relationship text
)
language plpgsql security definer set search_path=public as $$
begin
 if public.my_role() <> 'teacher' then raise exception 'Teacher access required'; end if;
 return query
 select s.id,s.admission_no,s.full_name,s.date_of_birth,s.gender,s.section,s.program_year,s.status,s.photo_url,
        s.start_surah,s.start_ayah,s.current_surah,s.current_ayah,s.current_page,s.current_hizb,s.class_id,c.name,
        pp.full_name,pp.phone,au.email,ps.relationship
 from public.teacher_students ts
 join public.students s on s.id=ts.student_id
 left join public.classes c on c.id=s.class_id
 left join lateral (select ps.parent_id,ps.relationship from public.parent_students ps where ps.student_id=s.id order by ps.relationship nulls last limit 1) ps on true
 left join public.profiles pp on pp.id=ps.parent_id
 left join auth.users au on au.id=pp.id
 where ts.teacher_id=auth.uid() and s.status <> 'deleted'
 order by s.full_name;
end $$;
grant execute on function public.get_teacher_student_directory() to authenticated;

-- Teacher evaluation visibility is explicit: administrators can push a record to a teacher.
drop policy if exists "teachers see assigned evaluations" on public.evaluations;
create policy "teachers see pushed assigned evaluations" on public.evaluations for select to authenticated using(
 (teacher_id=auth.uid() and (teacher_visible=true or status in ('draft','returned')))
 or public.my_role() in ('super_admin','admin','principal')
 or ((status='approved') and exists(select 1 from public.parent_students ps where ps.student_id=evaluations.student_id and ps.parent_id=auth.uid()))
);

drop policy if exists "teachers update visible evaluations" on public.evaluations;
create policy "teachers update visible evaluations" on public.evaluations for update to authenticated using(
 public.my_role() in ('super_admin','admin','principal') or (teacher_id=auth.uid() and status in ('draft','returned') and public.my_role()='teacher')
) with check(public.my_role() in ('super_admin','admin','principal') or (teacher_id=auth.uid() and public.my_role()='teacher'));

-- Public application submission is allowed only while the portal is explicitly open.
create or replace function public.submit_admission_application(
 p_applicant_name text,p_date_of_birth date,p_gender text,p_parent_name text,p_parent_phone text,
 p_guardian_name text,p_guardian_phone text,p_guardian_email text,p_guardian_relationship text,
 p_address text,p_state text,p_lga text,p_requested_section public.section_type,p_requested_program_year public.program_year,
 p_previous_school text,p_quran_level text,p_starting_surah smallint,p_starting_ayah smallint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare portal jsonb; payment jsonb; app_no text; rec public.admissions;
begin
 portal:=coalesce((select value from public.site_settings where key='admission_portal'), '{}'::jsonb);
 if coalesce((portal->>'enabled')::boolean,false)=false then raise exception 'Admissions are currently closed'; end if;
 if (portal->>'opening_date') is not null and current_date < (portal->>'opening_date')::date then raise exception 'Admissions have not opened yet'; end if;
 if (portal->>'closing_date') is not null and current_date > (portal->>'closing_date')::date then raise exception 'Admissions are closed'; end if;
 app_no:='AMQM/APP/'||extract(year from current_date)::int||'/'||lpad(public.next_school_number('application',extract(year from current_date)::int)::text,4,'0');
 insert into public.admissions(application_no,applicant_name,date_of_birth,gender,parent_name,parent_phone,guardian_name,guardian_phone,guardian_email,guardian_relationship,address,state,lga,requested_section,requested_program_year,previous_school,quran_level,starting_surah,starting_ayah,application_fee,payment_status,status)
 values(app_no,trim(p_applicant_name),p_date_of_birth,p_gender,trim(p_parent_name),p_parent_phone,trim(coalesce(p_guardian_name,p_parent_name)),coalesce(p_guardian_phone,p_parent_phone),p_guardian_email,p_guardian_relationship,p_address,p_state,p_lga,p_requested_section,p_requested_program_year,p_previous_school,p_quran_level,p_starting_surah,p_starting_ayah,5000,'pending','submitted') returning * into rec;
 payment:=coalesce((select value from public.site_settings where key='school_payment'), '{}'::jsonb);
 return jsonb_build_object('application_no',rec.application_no,'application_fee',5000,'payment',payment,'status',rec.status);
end $$;
grant execute on function public.submit_admission_application(text,date,text,text,text,text,text,text,text,text,text,text,public.section_type,public.program_year,text,text,smallint,smallint) to anon,authenticated;

-- Admin can verify payment, set screening outcome and enroll an accepted applicant as a real student.
create or replace function public.enroll_admission_application(p_application_id uuid,p_class_id uuid,p_starting_surah smallint,p_starting_ayah smallint,p_screening_score numeric,p_screening_notes text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.admissions; sid uuid; ano text;
begin
 if public.my_role() not in ('super_admin','admin','principal','admissions') then raise exception 'Administrator access required'; end if;
 select * into a from public.admissions where id=p_application_id for update;
 if a.id is null then raise exception 'Application not found'; end if;
 if a.payment_status <> 'verified' then raise exception 'Application fee must be verified before admission'; end if;
 if a.status not in ('screened','accepted') then raise exception 'Application is not ready for enrollment'; end if;
 insert into public.students(admission_no,full_name,date_of_birth,gender,section,program_year,admission_date,status,photo_url,start_surah,start_ayah,current_surah,current_ayah,class_id)
 values('auto',a.applicant_name,a.date_of_birth,a.gender,a.requested_section,a.requested_program_year,current_date,'active',null,coalesce(p_starting_surah,a.starting_surah),coalesce(p_starting_ayah,a.starting_ayah),coalesce(p_starting_surah,a.starting_surah),coalesce(p_starting_ayah,a.starting_ayah),p_class_id)
 returning id,admission_no into sid,ano;
 update public.admissions set status='enrolled',screening_score=p_screening_score,screening_notes=p_screening_notes,reviewed_by=auth.uid(),reviewed_at=now(),enrolled_student_id=sid where id=a.id;
 return jsonb_build_object('student_id',sid,'admission_no',ano);
end $$;
grant execute on function public.enroll_admission_application(uuid,uuid,smallint,smallint,numeric,text) to authenticated;

-- Safe admin action to push an evaluation to its teacher.
create or replace function public.push_evaluation_to_teacher(p_evaluation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
 update public.evaluations set teacher_visible=true,teacher_visible_at=now() where id=p_evaluation_id;
end $$;
grant execute on function public.push_evaluation_to_teacher(uuid) to authenticated;

-- Separate public profile-media bucket. Unique paths avoid CDN overwrite staleness.
insert into storage.buckets(id,name,public) values('school-profile-media','school-profile-media',true) on conflict (id) do update set public=true;
drop policy if exists "profile media upload" on storage.objects;
create policy "profile media upload" on storage.objects for insert to authenticated with check(bucket_id='school-profile-media' and public.my_role() in ('teacher','super_admin','admin','principal','admissions'));
drop policy if exists "profile media delete" on storage.objects;
create policy "profile media delete" on storage.objects for delete to authenticated using(bucket_id='school-profile-media' and public.my_role() in ('teacher','super_admin','admin','principal','admissions'));

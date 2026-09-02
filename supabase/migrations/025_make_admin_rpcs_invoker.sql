create or replace function public.push_evaluation_to_teacher(p_evaluation_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('super_admin','admin','principal')) then raise exception 'Administrator access required'; end if;
 update public.evaluations set teacher_visible=true,teacher_visible_at=now() where id=p_evaluation_id;
end $$;

drop function if exists public.enroll_admission_application(uuid,uuid,smallint,smallint,numeric,text);
create or replace function public.enroll_admission_application(p_application_id uuid,p_class_id uuid,p_starting_surah smallint,p_starting_ayah smallint,p_screening_score numeric,p_screening_notes text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a public.admissions; sid uuid; ano text;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('super_admin','admin','principal','admissions')) then raise exception 'Administrator access required'; end if;
 select * into a from public.admissions where id=p_application_id for update;
 if a.id is null then raise exception 'Application not found'; end if;
 if a.payment_status<>'verified' then raise exception 'Application fee must be verified before admission'; end if;
 if a.status not in ('screened','accepted') then raise exception 'Application is not ready for enrollment'; end if;
 insert into public.students(admission_no,full_name,date_of_birth,gender,section,program_year,admission_date,status,photo_url,start_surah,start_ayah,current_surah,current_ayah,class_id)
 values('auto',a.applicant_name,a.date_of_birth,a.gender,a.requested_section,a.requested_program_year,current_date,'active',null,coalesce(p_starting_surah,a.starting_surah),coalesce(p_starting_ayah,a.starting_ayah),coalesce(p_starting_surah,a.starting_surah),coalesce(p_starting_ayah,a.starting_ayah),p_class_id)
 returning id,admission_no into sid,ano;
 update public.admissions set status='enrolled',screening_score=p_screening_score,screening_notes=p_screening_notes,reviewed_by=auth.uid(),reviewed_at=now(),enrolled_student_id=sid,class_id=p_class_id where id=a.id;
 return jsonb_build_object('student_id',sid,'admission_no',ano);
end $$;
grant execute on function public.enroll_admission_application(uuid,uuid,smallint,smallint,numeric,text) to authenticated;

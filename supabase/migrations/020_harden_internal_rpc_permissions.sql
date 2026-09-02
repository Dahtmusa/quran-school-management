-- Internal helpers must not be callable through the public REST RPC surface.
revoke execute on function public.assign_staff_id() from anon,authenticated;
revoke execute on function public.assign_student_admission_no() from anon,authenticated;
revoke execute on function public.generate_staff_id(public.user_role,integer) from anon,authenticated;
revoke execute on function public.generate_student_admission_no(integer) from anon,authenticated;
revoke execute on function public.next_school_number(text,integer) from anon,authenticated;
revoke execute on function public.my_role() from anon,authenticated;
revoke execute on function public.is_teacher_profile(uuid) from anon,authenticated;
revoke execute on function public.sync_class_teacher_students() from anon,authenticated;
revoke execute on function public.update_student_section(uuid,public.section_type) from anon,authenticated;

-- Teachers can read only parent links attached to one of their own students.
drop policy if exists "teachers read assigned parent links" on public.parent_students;
create policy "teachers read assigned parent links" on public.parent_students for select to authenticated using(public.my_role()='teacher' and exists(select 1 from public.teacher_students ts where ts.teacher_id=auth.uid() and ts.student_id=parent_students.student_id));
drop policy if exists "teachers read connected parent profiles" on public.profiles;
create policy "teachers read connected parent profiles" on public.profiles for select to authenticated using(public.my_role()='teacher' and role='parent' and exists(select 1 from public.parent_students ps join public.teacher_students ts on ts.student_id=ps.student_id where ps.parent_id=profiles.id and ts.teacher_id=auth.uid()));

-- The teacher directory can now respect ordinary RLS and no longer needs SECURITY DEFINER.
create or replace function public.get_teacher_student_directory()
returns table(student_id uuid,admission_no text,full_name text,date_of_birth date,gender text,section public.section_type,program_year public.program_year,status text,photo_url text,start_surah smallint,start_ayah smallint,current_surah smallint,current_ayah smallint,current_page smallint,current_hizb smallint,class_id uuid,class_name text,parent_name text,parent_phone text,parent_email text,parent_relationship text)
language sql security invoker set search_path=public as $$
 select s.id,s.admission_no,s.full_name,s.date_of_birth,s.gender,s.section,s.program_year,s.status,s.photo_url,s.start_surah,s.start_ayah,s.current_surah,s.current_ayah,s.current_page,s.current_hizb,s.class_id,c.name,pp.full_name,pp.phone,au.email,ps.relationship
 from public.teacher_students ts
 join public.students s on s.id=ts.student_id
 left join public.classes c on c.id=s.class_id
 left join lateral (select ps.parent_id,ps.relationship from public.parent_students ps where ps.student_id=s.id order by ps.relationship nulls last limit 1) ps on true
 left join public.profiles pp on pp.id=ps.parent_id
 left join auth.users au on au.id=pp.id
 where ts.teacher_id=auth.uid() and exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='teacher') and s.status <> 'deleted'
 order by s.full_name;
$$;
revoke execute on function public.get_teacher_student_directory() from anon;
grant execute on function public.get_teacher_student_directory() to authenticated;

-- These two operations are protected by their own role checks and are not public.
revoke execute on function public.push_evaluation_to_teacher(uuid) from anon;
revoke execute on function public.enroll_admission_application(uuid,uuid,smallint,smallint,numeric,text) from anon;
revoke execute on function public.submit_admission_application(text,date,text,text,text,text,text,text,text,text,text,text,public.section_type,public.program_year,text,text,smallint,smallint) from authenticated;

drop function if exists public.get_teacher_student_directory();
create or replace function public.get_teacher_student_directory()
returns table(student_id uuid,admission_no text,full_name text,date_of_birth date,gender text,section public.section_type,program_year public.program_year,status text,photo_url text,start_surah smallint,start_ayah smallint,current_surah smallint,current_ayah smallint,current_page smallint,current_hizb smallint,class_id uuid,class_name text,parent_name text,parent_phone text,parent_relationship text)
language sql security invoker set search_path=public as $$
 select s.id,s.admission_no,s.full_name,s.date_of_birth,s.gender,s.section,s.program_year,s.status,s.photo_url,s.start_surah,s.start_ayah,s.current_surah,s.current_ayah,s.current_page,s.current_hizb,s.class_id,c.name,pp.full_name,pp.phone,ps.relationship
 from public.teacher_students ts
 join public.students s on s.id=ts.student_id
 left join public.classes c on c.id=s.class_id
 left join lateral (select ps.parent_id,ps.relationship from public.parent_students ps where ps.student_id=s.id order by ps.relationship nulls last limit 1) ps on true
 left join public.profiles pp on pp.id=ps.parent_id
 where ts.teacher_id=auth.uid() and exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='teacher') and s.status <> 'deleted'
 order by s.full_name;
$$;
grant execute on function public.get_teacher_student_directory() to authenticated;

revoke execute on function public.get_teacher_student_directory() from anon;
revoke execute on function public.enroll_admission_application(uuid,uuid,smallint,smallint,numeric,text) from anon;
revoke execute on function public.push_evaluation_to_teacher(uuid) from anon;
revoke execute on function public.submit_admission_application(text,date,text,text,text,text,text,text,text,text,text,text,public.section_type,public.program_year,text,text,smallint,smallint) from authenticated;

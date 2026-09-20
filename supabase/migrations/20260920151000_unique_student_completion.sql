-- One permanent completion record per student.
create unique index if not exists student_program_completions_student_uidx
  on public.student_program_completions(student_id);

notify pgrst,'reload schema';

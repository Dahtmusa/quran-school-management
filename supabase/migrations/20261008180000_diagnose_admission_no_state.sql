-- Diagnostic function. Not called by any app code. Admin runs it in
-- Supabase SQL Editor to see the raw state behind the "duplicate
-- admission number" errors. Delete the function once we have the fix.

create or replace function public.amqm_diagnose_admission_no(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := 'AMQM/STU/' || p_year::text || '/';
  v_pattern text := '^AMQM/STU/' || p_year::text || '/(\d+)$';
  v_students_list jsonb;
  v_admissions_list jsonb;
  v_counter integer;
  v_helper_output text;
begin
  select coalesce(jsonb_agg(admission_no order by admission_no), '[]'::jsonb)
    into v_students_list
  from public.students
  where admission_no ~* v_pattern;

  select coalesce(jsonb_agg(application_no order by application_no), '[]'::jsonb)
    into v_admissions_list
  from public.admissions
  where application_no ~* v_pattern;

  select next_number into v_counter
  from public.school_number_sequences
  where sequence_key = 'student' and sequence_year = p_year;

  v_helper_output := public.amqm_next_vacant_student_admission_no(p_year);

  return jsonb_build_object(
    'year', p_year,
    'prefix', v_prefix,
    'students_admission_nos', v_students_list,
    'admissions_application_nos', v_admissions_list,
    'counter_next_number', v_counter,
    'helper_would_return', v_helper_output,
    'is_helper_result_actually_taken',
      exists(select 1 from public.students where lower(admission_no) = lower(v_helper_output))
  );
end;
$$;

grant execute on function public.amqm_diagnose_admission_no(integer) to authenticated;

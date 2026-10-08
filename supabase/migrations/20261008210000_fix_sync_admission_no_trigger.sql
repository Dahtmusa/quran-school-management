-- Root cause of "duplicate key value violates students_admission_no_key"
-- on every Year 1 <-> Year 2 edit. There is a BEFORE UPDATE trigger
-- on public.students, students_sync_admission_no, defined OUTSIDE the
-- migration tree (likely added via the Supabase dashboard). Its body
-- was:
--
--   IF NEW.program_year IS DISTINCT FROM OLD.program_year THEN
--     ...
--     NEW.admission_no := public.generate_student_admission_no(v_adm_year);
--   END IF;
--
-- The problem: generate_student_admission_no() asks the counter in
-- school_number_sequences for the next value, and that counter has
-- lagged behind reality (sitting at 2 while the live roster already
-- holds 2025/001, /002, /004, /005...). So the trigger kept writing
-- "AMQM/Stu/2025/004" even though admin_update_student_profile had
-- carefully chosen "003" via the scan-based helper.
--
-- Fix: rewrite the trigger function so it
--   (a) respects whatever admission_no the caller already assigned
--       (so our RPC's scan-based pick wins and the retry loop can
--       choose another number on collision), and
--   (b) when the trigger does need to invent a number itself (e.g.
--       a direct UPDATE from the SQL editor that only changed
--       program_year), uses amqm_next_vacant_student_admission_no()
--       -- the scan-based generator -- instead of the lagging counter.
--
-- Trigger stays attached as BEFORE UPDATE, so the policy "program
-- year change auto-renumbers" still holds. We just stop clobbering a
-- deliberately-chosen admission_no.

create or replace function public.sync_admission_no_on_year_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_num int;
  v_adm_year int;
  v_new_adm_trimmed text;
  v_old_adm_trimmed text;
begin
  if NEW.program_year is distinct from OLD.program_year then
    v_new_adm_trimmed := btrim(coalesce(NEW.admission_no, ''));
    v_old_adm_trimmed := btrim(coalesce(OLD.admission_no, ''));

    -- Case 1: the UPDATE caller already assigned a concrete,
    -- non-sentinel admission_no that is different from the old one
    -- (that is what admin_update_student_profile does). Keep it.
    if v_new_adm_trimmed <> ''
       and lower(v_new_adm_trimmed) not in ('auto','generate','-')
       and v_new_adm_trimmed <> v_old_adm_trimmed
    then
      return NEW;
    end if;

    -- Case 2: the UPDATE did not change admission_no itself, so the
    -- trigger has to pick one. Use the scan-based helper that reads
    -- the live roster -- never trust the stale counter again.
    v_year_num := case NEW.program_year::text
      when 'year_1' then 1
      when 'year_2' then 2
      else 1
    end;
    v_adm_year := extract(year from current_date)::int + 1 - v_year_num;
    NEW.admission_no := public.amqm_next_vacant_student_admission_no(v_adm_year);
  end if;

  return NEW;
end;
$$;

-- Trigger definition itself is unchanged -- same name, same table,
-- same event, same function. We only replaced the function body.

notify pgrst, 'reload schema';

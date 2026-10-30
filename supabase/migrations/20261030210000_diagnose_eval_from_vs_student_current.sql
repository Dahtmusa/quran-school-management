-- Side-by-side comparison between what the teacher evaluation entry
-- grid will show (eval.from_surah / from_ayah stored on the draft row
-- at open time) and what the student profile shows live
-- (students.current_surah / current_ayah).
--
-- They must match. If they do not, the draft rows were created from a
-- stale students snapshot and should be re-synced.

create or replace function public.amqm_diagnose_eval_from_vs_student()
returns table (
  evaluation_id uuid,
  student_full_name text,
  admission_no text,
  memorization_direction text,
  profile_current_surah smallint,
  profile_current_ayah smallint,
  eval_from_surah smallint,
  eval_from_ayah smallint,
  matches boolean
) language sql
security definer
set search_path = public
as $$
  with cur as (
    select id as current_term_id from public.terms where is_current = true limit 1
  )
  select e.id,
         s.full_name,
         s.admission_no,
         s.memorization_direction::text,
         s.current_surah,
         s.current_ayah,
         e.from_surah,
         e.from_ayah,
         (s.current_surah = e.from_surah and s.current_ayah = e.from_ayah)
    from public.evaluations e
    join public.students s on s.id = e.student_id
    join cur on cur.current_term_id = e.term_id
   where e.status = 'draft'
     and e.evaluation_number = 1
   order by (s.current_surah = e.from_surah and s.current_ayah = e.from_ayah),
            s.full_name;
$$;

grant execute on function public.amqm_diagnose_eval_from_vs_student() to authenticated;

-- Re-sync helper: for every draft Eval row in the current term,
-- rewrite from_surah / from_ayah to the students current position.
-- Run only after confirming the diagnosis shows mismatches.
create or replace function public.amqm_resync_eval_from_to_student_current()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
  v_already int := 0;
begin
  with cur as (
    select id from public.terms where is_current = true limit 1
  ),
  to_update as (
    select e.id, s.current_surah, s.current_ayah
      from public.evaluations e
      join public.students s on s.id = e.student_id
      join cur on cur.id = e.term_id
     where e.status = 'draft'
       and (s.current_surah is distinct from e.from_surah
         or s.current_ayah  is distinct from e.from_ayah)
  ),
  upd as (
    update public.evaluations e
       set from_surah = tu.current_surah,
           from_ayah  = tu.current_ayah,
           to_surah   = null,
           to_ayah    = null
      from to_update tu
     where e.id = tu.id
     returning e.id
  )
  select count(*) into v_updated from upd;

  return jsonb_build_object('resynced', v_updated);
end;
$$;

grant execute on function public.amqm_resync_eval_from_to_student_current() to authenticated;

notify pgrst, 'reload schema';

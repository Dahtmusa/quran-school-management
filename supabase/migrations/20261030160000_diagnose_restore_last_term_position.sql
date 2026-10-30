-- After wiping current-term evaluations, verify every student's live
-- Quran position matches the ending position of their LAST APPROVED
-- evaluation (highest evaluation_number in any prior term). If not,
-- their current_surah/current_ayah reflect current-term work that no
-- longer has an evaluation row backing it -- they need to be rewound.
--
-- Two functions:
--   amqm_diagnose_quran_position_vs_last_term() -- read-only, lists
--     every mismatch so admin can preview the scope.
--   amqm_restore_quran_position_to_last_term()  -- rewinds each
--     student's live position to their last-approved-evaluation
--     ending position, logs each change to audit_logs.

create or replace function public.amqm_diagnose_quran_position_vs_last_term()
returns table (
  student_id uuid,
  full_name text,
  admission_no text,
  live_surah smallint,
  live_ayah smallint,
  last_eval_term text,
  last_eval_number smallint,
  last_eval_surah smallint,
  last_eval_ayah smallint,
  match boolean
) language sql
security definer
set search_path = public
as $$
  with cur as (
    select id as current_term_id from public.terms where is_current = true limit 1
  ),
  last_eval as (
    select distinct on (e.student_id)
      e.student_id,
      t.name as term_name,
      e.evaluation_number,
      e.to_surah,
      e.to_ayah
    from public.evaluations e
    join public.terms t on t.id = e.term_id
    where e.status = 'approved'
      and e.term_id <> (select current_term_id from cur)
      and e.to_surah is not null
      and e.to_ayah is not null
    order by e.student_id, t.starts_on desc, e.evaluation_number desc
  )
  select s.id,
         s.full_name,
         s.admission_no,
         s.current_surah,
         s.current_ayah,
         le.term_name,
         le.evaluation_number,
         le.to_surah,
         le.to_ayah,
         (s.current_surah = le.to_surah and s.current_ayah = le.to_ayah)
    from public.students s
    join last_eval le on le.student_id = s.id
   where s.status = 'active'
   order by (s.current_surah = le.to_surah and s.current_ayah = le.to_ayah),
            s.full_name;
$$;

create or replace function public.amqm_restore_quran_position_to_last_term()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_restored int := 0;
  v_already_matched int := 0;
  v_no_prior_eval int := 0;
  v_old jsonb;
  v_new_page smallint;
  v_new_hizb smallint;
begin
  -- Only touch active students who have a last-term approved evaluation.
  for r in
    with cur as (
      select id as current_term_id from public.terms where is_current = true limit 1
    ),
    last_eval as (
      select distinct on (e.student_id)
        e.student_id,
        e.to_surah,
        e.to_ayah
      from public.evaluations e
      join public.terms t on t.id = e.term_id
      where e.status = 'approved'
        and e.term_id <> (select current_term_id from cur)
        and e.to_surah is not null
        and e.to_ayah is not null
      order by e.student_id, t.starts_on desc, e.evaluation_number desc
    )
    select s.id, s.current_surah, s.current_ayah,
           le.to_surah, le.to_ayah
      from public.students s
      join last_eval le on le.student_id = s.id
     where s.status = 'active'
  loop
    if r.current_surah = r.to_surah and r.current_ayah = r.to_ayah then
      v_already_matched := v_already_matched + 1;
      continue;
    end if;

    -- Look up page/hizb for the target position from quran_verses.
    select page, hizb into v_new_page, v_new_hizb
      from public.quran_verses
     where surah = r.to_surah and ayah = r.to_ayah;

    select to_jsonb(s.*) into v_old
      from public.students s where s.id = r.id;

    update public.students
       set current_surah = r.to_surah,
           current_ayah  = r.to_ayah,
           current_page  = coalesce(v_new_page, current_page),
           current_hizb  = coalesce(v_new_hizb, current_hizb)
     where id = r.id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
    values (
      auth.uid(),
      'admin_restore_position_to_last_term',
      'student',
      r.id,
      v_old,
      jsonb_build_object(
        'current_surah', r.to_surah,
        'current_ayah',  r.to_ayah,
        'current_page',  v_new_page,
        'current_hizb',  v_new_hizb
      )
    );

    v_restored := v_restored + 1;
  end loop;

  -- Count students without any prior-term approved evaluation.
  select count(*) into v_no_prior_eval
    from public.students s
    where s.status = 'active'
      and not exists (
        select 1
          from public.evaluations e
          join public.terms t on t.id = e.term_id
         where e.student_id = s.id
           and e.status = 'approved'
           and t.id <> (select id from public.terms where is_current = true limit 1)
           and e.to_surah is not null
      );

  return jsonb_build_object(
    'restored',          v_restored,
    'already_matched',   v_already_matched,
    'no_prior_evaluation', v_no_prior_eval
  );
end;
$$;

grant execute on function public.amqm_diagnose_quran_position_vs_last_term() to authenticated;
grant execute on function public.amqm_restore_quran_position_to_last_term() to authenticated;

notify pgrst, 'reload schema';

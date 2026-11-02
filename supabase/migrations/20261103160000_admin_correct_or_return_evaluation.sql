-- Let admins resolve "Needs review" students themselves, two ways:
--   1. admin_send_evaluation_back: reopen the latest approved evaluation as
--      'returned' so the class teacher corrects and resubmits it.
--   2. admin_correct_quran_record: correct direction / start / current
--      position and, optionally, the latest approved evaluation directly.
-- Plus: open drafts follow the student's position whenever it changes through
-- an approval or a correction, so the next evaluation starts in the right place.

-- ---------------------------------------------------------------------------
-- Helper: Qur'an completion % at a position for a direction (matches
-- absoluteProgress in src/lib/quran.ts).
create or replace function public.amqm_quran_percent_at(p_surah int, p_ayah int, p_direction public.memorization_direction)
returns numeric
language sql
stable
set search_path = public
as $$
  select round(
           (case when p_direction = 'baqarah_to_nas'::public.memorization_direction
                 then q.global_ayah
                 else (select max(global_ayah) from public.quran_verses) - q.global_ayah + 1 end)::numeric
           / (select max(global_ayah) from public.quran_verses) * 100, 1)
    from public.quran_verses q
   where q.surah = p_surah and q.ayah = p_ayah;
$$;

-- Helper: move a student's not-yet-submitted drafts to start from their
-- current position. The position guard requires a draft's start to equal the
-- student's live position, which is exactly what this sets.
create or replace function public.amqm_sync_student_drafts(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_s smallint; v_a smallint; v_n int;
begin
  select current_surah, current_ayah into v_s, v_a from public.students where id = p_student_id;
  if v_s is null then return 0; end if;
  update public.evaluations
     set from_surah = v_s, from_ayah = v_a
   where student_id = p_student_id
     and status = 'draft'
     and (from_surah is distinct from v_s or from_ayah is distinct from v_a);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.amqm_sync_student_drafts(uuid) from public, anon, authenticated;

-- After an evaluation is approved (the BEFORE trigger has already moved the
-- student), bring the student's open drafts along.
create or replace function public.amqm_sync_drafts_after_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.amqm_sync_student_drafts(new.student_id);
  end if;
  return new;
end;
$$;
drop trigger if exists amqm_sync_drafts_after_approval on public.evaluations;
create trigger amqm_sync_drafts_after_approval
after update on public.evaluations
for each row execute function public.amqm_sync_drafts_after_approval();

-- Helper: set a student's live position (page/hizb derived).
create or replace function public.amqm_set_student_position(p_student_id uuid, p_surah int, p_ayah int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.quran_verses;
begin
  select * into v from public.quran_verses where surah = p_surah and ayah = p_ayah;
  if v.global_ayah is null then
    raise exception 'Surah %, Ayah % is not a valid Qur''an position.', p_surah, p_ayah;
  end if;
  update public.students
     set current_surah = p_surah, current_ayah = p_ayah,
         current_page = v.page, current_hizb = v.hizb
   where id = p_student_id;
end;
$$;
revoke all on function public.amqm_set_student_position(uuid, int, int) from public, anon, authenticated;

-- Helper: the student's most recent approved evaluation.
create or replace function public.amqm_latest_approved_evaluation(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
    from public.evaluations e
    join public.terms t on t.id = e.term_id
   where e.student_id = p_student_id and e.status = 'approved'
   order by t.starts_on desc, e.evaluation_number desc
   limit 1;
$$;
revoke all on function public.amqm_latest_approved_evaluation(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Send the latest approved evaluation back to the class teacher.
create or replace function public.admin_send_evaluation_back(p_evaluation_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.evaluations;
  s public.students;
  v_teacher uuid;
  v_teacher_name text;
  v_note text;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Please write a short note telling the teacher what to correct.';
  end if;

  select * into e from public.evaluations where id = p_evaluation_id for update;
  if not found then raise exception 'Evaluation not found'; end if;
  if e.status <> 'approved' then
    raise exception 'Only approved evaluations can be sent back from here (this one is %).', e.status;
  end if;
  if public.amqm_latest_approved_evaluation(e.student_id) is distinct from e.id then
    raise exception 'Only the student''s most recent approved evaluation can be sent back, because later evaluations build on it. Use Fix directly instead.';
  end if;

  select * into s from public.students where id = e.student_id for update;
  if s.status = 'alumni' then
    raise exception '% is already an alumni. Use Fix directly instead.', s.full_name;
  end if;

  select ct.teacher_id, p.full_name into v_teacher, v_teacher_name
    from public.class_teachers ct
    join public.profiles p on p.id = ct.teacher_id and p.employment_status = 'active'
   where ct.class_id = s.class_id
   order by ct.is_primary desc nulls last, ct.assigned_at asc
   limit 1;
  if v_teacher is null then
    raise exception '% has no active class teacher to send this to. Assign a class, or use Fix directly.', s.full_name;
  end if;

  -- Put the student back where they were before this evaluation.
  perform public.amqm_set_student_position(s.id, e.from_surah, e.from_ayah);

  v_note := trim(p_note);
  if e.to_surah is not null then
    v_note := v_note || ' (Previously submitted stop: ' || e.to_surah || ':' || e.to_ayah || '.)';
  end if;

  -- The stop is cleared so the teacher re-enters it; an inconsistent stop
  -- would otherwise be rejected by the position guard on this update.
  update public.evaluations
     set status = 'returned',
         admin_comment = v_note,
         teacher_id = v_teacher,
         to_surah = null, to_ayah = null,
         approved_at = null, approved_by = null,
         teacher_visible = true,
         teacher_visible_at = now()
   where id = e.id;

  perform public.amqm_sync_student_drafts(s.id);

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), 'evaluation:sent_back', 'evaluations', e.id,
          jsonb_build_object('status', e.status, 'from', e.from_surah || ':' || e.from_ayah,
                             'to', e.to_surah || ':' || e.to_ayah, 'teacher_id', e.teacher_id,
                             'student_position', s.current_surah || ':' || s.current_ayah),
          jsonb_build_object('status', 'returned', 'note', v_note, 'teacher_id', v_teacher,
                             'student_position', e.from_surah || ':' || e.from_ayah));

  return jsonb_build_object('teacher_name', v_teacher_name, 'student_position', e.from_surah || ':' || e.from_ayah);
end;
$$;
revoke all on function public.admin_send_evaluation_back(uuid, text) from public, anon;
grant execute on function public.admin_send_evaluation_back(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Correct the record directly.
create or replace function public.admin_correct_quran_record(
  p_student_id uuid,
  p_direction public.memorization_direction,
  p_start_surah int, p_start_ayah int,
  p_current_surah int, p_current_ayah int,
  p_reason text,
  p_evaluation_id uuid default null,
  p_eval_from_surah int default null, p_eval_from_ayah int default null,
  p_eval_to_surah int default null, p_eval_to_ayah int default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s_old public.students;
  s_new public.students;
  e_old public.evaluations;
  e_new public.evaluations;
  v_score numeric;
  v_drafts int;
  v_pos public.quran_verses;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Please give a short reason for the correction.';
  end if;

  select * into s_old from public.students where id = p_student_id for update;
  if not found then raise exception 'Student not found'; end if;

  if p_evaluation_id is not null then
    select * into e_old from public.evaluations where id = p_evaluation_id and student_id = p_student_id for update;
    if not found then raise exception 'Evaluation not found for this student'; end if;
    if e_old.status <> 'approved' then raise exception 'Only an approved evaluation can be corrected here.'; end if;
    if public.amqm_latest_approved_evaluation(p_student_id) is distinct from e_old.id then
      raise exception 'Only the student''s most recent approved evaluation can be corrected here.';
    end if;
    if p_eval_from_surah is null or p_eval_from_ayah is null or p_eval_to_surah is null or p_eval_to_ayah is null then
      raise exception 'Give both the evaluation start and stop positions.';
    end if;
  end if;

  -- Direction, starting point and position in ONE update, because the student
  -- guard checks them together. When an evaluation is being corrected, the
  -- live position is temporarily that evaluation's start (the evaluation
  -- guard requires an evaluation to start from the live position).
  select * into v_pos from public.quran_verses
   where surah = coalesce(p_eval_from_surah, p_current_surah)
     and ayah  = coalesce(p_eval_from_ayah,  p_current_ayah);
  if v_pos.global_ayah is null then
    raise exception 'That position is not a valid Qur''an position.';
  end if;
  update public.students
     set memorization_direction = p_direction,
         start_surah = p_start_surah, start_ayah = p_start_ayah,
         current_surah = v_pos.surah, current_ayah = v_pos.ayah,
         current_page = v_pos.page, current_hizb = v_pos.hizb
   where id = p_student_id;
  if p_evaluation_id is not null then
    v_score := public.amqm_quran_percent_at(p_eval_to_surah, p_eval_to_ayah, p_direction);
    update public.evaluations
       set from_surah = p_eval_from_surah, from_ayah = p_eval_from_ayah,
           to_surah = p_eval_to_surah, to_ayah = p_eval_to_ayah,
           score = v_score,
           grade = public.evaluation_grade(v_score)
     where id = p_evaluation_id
     returning * into e_new;

    -- Keep the per-term record used by report cards in step.
    update public.student_term_progress p set
      eval1_start_surah = case when e_new.evaluation_number = 1 then e_new.from_surah else p.eval1_start_surah end,
      eval1_start_ayah  = case when e_new.evaluation_number = 1 then e_new.from_ayah  else p.eval1_start_ayah  end,
      eval1_end_surah   = case when e_new.evaluation_number = 1 then e_new.to_surah   else p.eval1_end_surah   end,
      eval1_end_ayah    = case when e_new.evaluation_number = 1 then e_new.to_ayah    else p.eval1_end_ayah    end,
      eval2_start_surah = case when e_new.evaluation_number = 2 then e_new.from_surah else p.eval2_start_surah end,
      eval2_start_ayah  = case when e_new.evaluation_number = 2 then e_new.from_ayah  else p.eval2_start_ayah  end,
      eval2_end_surah   = case when e_new.evaluation_number = 2 then e_new.to_surah   else p.eval2_end_surah   end,
      eval2_end_ayah    = case when e_new.evaluation_number = 2 then e_new.to_ayah    else p.eval2_end_ayah    end,
      eval3_start_surah = case when e_new.evaluation_number = 3 then e_new.from_surah else p.eval3_start_surah end,
      eval3_start_ayah  = case when e_new.evaluation_number = 3 then e_new.from_ayah  else p.eval3_start_ayah  end,
      eval3_end_surah   = case when e_new.evaluation_number = 3 then e_new.to_surah   else p.eval3_end_surah   end,
      eval3_end_ayah    = case when e_new.evaluation_number = 3 then e_new.to_ayah    else p.eval3_end_ayah    end,
      closing_surah     = case when e_new.evaluation_number = 3 then e_new.to_surah   else p.closing_surah     end,
      closing_ayah      = case when e_new.evaluation_number = 3 then e_new.to_ayah    else p.closing_ayah      end
    where p.student_id = p_student_id and p.term_id = e_new.term_id;
  end if;

  perform public.amqm_set_student_position(p_student_id, p_current_surah, p_current_ayah);
  v_drafts := public.amqm_sync_student_drafts(p_student_id);

  select * into s_new from public.students where id = p_student_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), 'quran_record:admin_correction', 'students', p_student_id,
          jsonb_build_object(
            'direction', s_old.memorization_direction,
            'start', s_old.start_surah || ':' || s_old.start_ayah,
            'current', s_old.current_surah || ':' || s_old.current_ayah,
            'evaluation', case when e_old.id is null then null else jsonb_build_object(
              'id', e_old.id, 'from', e_old.from_surah || ':' || e_old.from_ayah,
              'to', e_old.to_surah || ':' || e_old.to_ayah, 'score', e_old.score) end),
          jsonb_build_object(
            'reason', trim(p_reason),
            'direction', s_new.memorization_direction,
            'start', s_new.start_surah || ':' || s_new.start_ayah,
            'current', s_new.current_surah || ':' || s_new.current_ayah,
            'evaluation', case when e_new.id is null then null else jsonb_build_object(
              'id', e_new.id, 'from', e_new.from_surah || ':' || e_new.from_ayah,
              'to', e_new.to_surah || ':' || e_new.to_ayah, 'score', e_new.score) end,
            'drafts_moved', v_drafts));

  return jsonb_build_object('current', s_new.current_surah || ':' || s_new.current_ayah, 'drafts_moved', v_drafts);
end;
$$;
revoke all on function public.admin_correct_quran_record(uuid, public.memorization_direction, int, int, int, int, text, uuid, int, int, int, int) from public, anon;
grant execute on function public.admin_correct_quran_record(uuid, public.memorization_direction, int, int, int, int, text, uuid, int, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Teacher list: returned evaluations show from any term (not only the
--    current one), with the admin's note and the term name.
drop function if exists public.amqm_teacher_evaluation_entries();
create function public.amqm_teacher_evaluation_entries()
returns table (
  evaluation_id      uuid,
  campaign_id        uuid,
  evaluation_number  smallint,
  status             text,
  from_surah         smallint,
  from_ayah          smallint,
  to_surah           smallint,
  to_ayah            smallint,
  memorization_score numeric,
  accuracy_score     numeric,
  fluency_score      numeric,
  tajweed_score      numeric,
  retention_score    numeric,
  teacher_comment    text,
  student_id         uuid,
  full_name          text,
  admission_no       text,
  photo_url          text,
  class_name         text,
  memorization_direction text,
  current_surah      smallint,
  current_ayah       smallint,
  campaign_closes_at timestamptz,
  admin_comment      text,
  term_name          text
) language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() <> 'teacher' then return; end if;

  return query
    select distinct on (e.id)
           e.id, e.campaign_id, e.evaluation_number, e.status::text,
           e.from_surah, e.from_ayah, e.to_surah, e.to_ayah,
           e.memorization_score, e.accuracy_score, e.fluency_score, e.tajweed_score, e.retention_score,
           e.teacher_comment,
           s.id, s.full_name, s.admission_no, s.photo_url, cls.name,
           s.memorization_direction::text, s.current_surah, s.current_ayah,
           c.closes_at, e.admin_comment, t.name
      from public.evaluations e
      join public.students s on s.id = e.student_id
      join public.terms t    on t.id = e.term_id
 left join public.classes cls on cls.id = s.class_id
 left join public.evaluation_campaigns c on c.id = e.campaign_id
     where (e.status = 'returned' or (t.is_current = true and e.status = 'draft'))
       and (
         e.teacher_id = auth.uid()
         or exists (select 1 from public.class_teachers ct where ct.class_id = s.class_id and ct.teacher_id = auth.uid())
       )
     order by e.id;
end;
$$;
grant execute on function public.amqm_teacher_evaluation_entries() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Potential alumni: also return what the admin needs to act on a row.
drop function if exists public.amqm_potential_alumni();
create function public.amqm_potential_alumni()
returns table (
  student_id        uuid,
  full_name         text,
  admission_no      text,
  photo_url         text,
  class_name        text,
  teacher_name      text,
  memorization_direction text,
  start_surah       smallint,
  start_ayah        smallint,
  current_surah     smallint,
  current_ayah      smallint,
  progress_percent  numeric,
  status            text,
  outstanding_fees  numeric,
  evaluations_count integer,
  already_promoted  boolean,
  last_evaluation   text,
  last_evaluation_id uuid,
  last_from_surah   smallint,
  last_from_ayah    smallint,
  last_to_surah     smallint,
  last_to_ayah      smallint,
  issues            text[],
  ready             boolean
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select s.*,
           (select max(global_ayah) from public.quran_verses) as max_global,
           (select q.global_ayah from public.quran_verses q
             where q.surah = s.current_surah and q.ayah = s.current_ayah limit 1) as current_global
      from public.students s
     where public.my_role() in ('super_admin','admin','principal')
       and s.status in ('active','graduated','alumni')
       and not exists (select 1 from public.alumni_profiles ap where ap.student_id = s.id)
  ),
  withlast as (
    select b.*,
           case when b.memorization_direction = 'nas_to_baqarah'::public.memorization_direction then 1 else b.max_global end as end_global,
           le.id as le_id,
           le.from_surah as le_from_surah, le.from_ayah as le_from_ayah,
           le.to_surah as le_to_surah, le.to_ayah as le_to_ayah,
           (select q.global_ayah from public.quran_verses q where q.surah = le.from_surah and q.ayah = le.from_ayah limit 1) as le_from_global,
           (select q.global_ayah from public.quran_verses q where q.surah = le.to_surah and q.ayah = le.to_ayah limit 1) as le_to_global
      from base b
      left join lateral (
        select e.id, e.from_surah, e.from_ayah, e.to_surah, e.to_ayah
          from public.evaluations e
          join public.terms t on t.id = e.term_id
         where e.student_id = b.id and e.status = 'approved' and e.to_surah is not null
         order by t.starts_on desc, e.evaluation_number desc
         limit 1
      ) le on true
  ),
  checked as (
    select w.*,
           (w.le_to_global is not null and w.le_to_global = w.end_global) as eval_finished,
           array_remove(array[
             case when w.le_to_global is null
                  then 'No approved evaluation on record' end,
             case when w.le_to_global is not null and w.le_to_global <> w.end_global
                  then 'Last approved evaluation stops at ' || w.le_to_surah || ':' || w.le_to_ayah
                       || ', not the final verse (' || case when w.end_global = 1 then '1:1' else '114:6' end || ')' end,
             case when w.le_to_global is not null and w.current_global is not null and w.current_global <> w.le_to_global
                  then 'Current position ' || w.current_surah || ':' || w.current_ayah
                       || ' does not match the last approved evaluation (' || w.le_to_surah || ':' || w.le_to_ayah || ')' end,
             case when w.le_from_global is not null and w.le_to_global is not null and abs(w.le_to_global - w.le_from_global) > 1000
                  then 'Last approved evaluation jumps ' || abs(w.le_to_global - w.le_from_global)
                       || ' ayahs in one evaluation (' || w.le_from_surah || ':' || w.le_from_ayah || ' to '
                       || w.le_to_surah || ':' || w.le_to_ayah || '), likely a typing error' end,
             case when w.le_to_surah is not null and (
                       (w.memorization_direction = 'nas_to_baqarah'::public.memorization_direction and w.le_to_surah > w.le_from_surah)
                    or (w.memorization_direction = 'baqarah_to_nas'::public.memorization_direction and w.le_to_surah < w.le_from_surah))
                  then 'Last approved evaluation goes the wrong way for a '
                       || replace(w.memorization_direction::text, '_', ' ') || ' student' end
           ], null) as found_issues
      from withlast w
  )
  select
    c.id, c.full_name, c.admission_no, c.photo_url, cl.name, tp.full_name,
    c.memorization_direction::text,
    c.start_surah, c.start_ayah, c.current_surah, c.current_ayah,
    coalesce((select cp0.progress_percent from public.get_student_canonical_quran_progress(c.id) cp0 limit 1), 0),
    c.status::text,
    coalesce((select sum(sf.amount_due - sf.amount_paid) from public.student_fees sf
               where sf.student_id = c.id and sf.amount_paid < sf.amount_due), 0),
    (select count(*) from public.evaluations e where e.student_id = c.id)::int,
    false,
    case when c.le_to_surah is not null
         then c.le_from_surah || ':' || c.le_from_ayah || ' → ' || c.le_to_surah || ':' || c.le_to_ayah end,
    c.le_id, c.le_from_surah, c.le_from_ayah, c.le_to_surah, c.le_to_ayah,
    c.found_issues,
    c.eval_finished and coalesce(array_length(c.found_issues, 1), 0) = 0
  from checked c
  left join public.classes cl on cl.id = c.class_id
  left join lateral (
    select ct.teacher_id from public.class_teachers ct
     where ct.class_id = c.class_id
     order by ct.is_primary desc nulls last, ct.assigned_at asc
     limit 1
  ) ct on true
  left join public.profiles tp on tp.id = ct.teacher_id
  where c.status = 'alumni'
     or c.eval_finished
     or (c.current_global is not null and c.current_global = c.end_global)
     or coalesce((select cp0.progress_percent from public.get_student_canonical_quran_progress(c.id) cp0 limit 1), 0) >= 99.5
  order by (c.eval_finished and coalesce(array_length(c.found_issues, 1), 0) = 0) desc, c.full_name;
$$;
revoke all on function public.amqm_potential_alumni() from public;
grant execute on function public.amqm_potential_alumni() to authenticated;

notify pgrst, 'reload schema';

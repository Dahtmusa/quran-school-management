-- Removed students kept appearing on the teacher's Evaluations page.
--
-- Removing a student (withdrawn / suspended / expelled) took them out of their
-- class, but their open evaluation draft stayed assigned to the teacher, and
-- the teacher's list and "students to evaluate" count never checked the
-- student's status (e.g. Muhammad Inuwa Gana, AMQM/STU/2025/116).
--
-- Now:
--   * the teacher's list and count only include active students;
--   * removing a student deletes their unstarted drafts (nothing entered yet);
--     if they are reinstated, drafts for open evaluations are recreated;
--   * a one-time cleanup removes unstarted drafts of non-active students.
-- Submitted or returned evaluations are kept as part of the record.

-- Same column as 20261109120000 (safe whichever runs first).
alter table public.students
  add column if not exists removed_from_class_id uuid references public.classes(id) on delete set null;

create or replace function public.admin_remove_student(
  p_student_id uuid,
  p_status     text,
  p_reason     text,
  p_notes      text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_drafts int;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('suspended','expelled','withdrawn') then
    raise exception 'Invalid status. Must be suspended, expelled, or withdrawn.';
  end if;
  update public.students set
    status                = p_status,
    removal_reason        = p_reason,
    removal_notes         = p_notes,
    removed_at            = now(),
    removed_by            = auth.uid(),
    removed_from_class_id = coalesce(class_id, removed_from_class_id),
    class_id              = null
  where id = p_student_id;

  delete from public.evaluations where student_id = p_student_id and status = 'draft';
  get diagnostics v_drafts = row_count;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'student_removed', 'student', p_student_id,
    jsonb_build_object('status', p_status, 'reason', p_reason, 'notes', p_notes, 'open_drafts_removed', v_drafts));
end $$;

-- Teacher list: active students only.
create or replace function public.amqm_teacher_evaluation_entries()
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
     where s.status = 'active'
       and (e.status = 'returned' or (t.is_current = true and e.status = 'draft'))
       and (
         e.teacher_id = auth.uid()
         or exists (select 1 from public.class_teachers ct where ct.class_id = s.class_id and ct.teacher_id = auth.uid())
       )
     order by e.id;
end;
$$;
grant execute on function public.amqm_teacher_evaluation_entries() to authenticated;

-- Teacher window tiles: count active students only.
create or replace function public.amqm_teacher_current_evaluation_window()
returns table (
  campaign_id       uuid,
  title             text,
  evaluation_number smallint,
  opens_at          timestamptz,
  closes_at         timestamptz,
  my_eval_count     integer
) language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.amqm_sync_evaluations_from_calendar();
  return query
    with my_classes as (
      select class_id from public.class_teachers where teacher_id = auth.uid()
    )
    select c.id,
           c.title,
           c.evaluation_number,
           c.opens_at,
           c.closes_at,
           (
             select count(*)::int
               from public.evaluations e
               join public.students s on s.id = e.student_id
              where e.campaign_id = c.id
                and s.status = 'active'
                and (
                  e.teacher_id = auth.uid()
                  or s.class_id in (select class_id from my_classes)
                )
           )
      from public.evaluation_campaigns c
     where c.status = 'open'
       and now() between c.opens_at and c.closes_at
     order by c.closes_at asc
     limit 3;
end;
$$;
grant execute on function public.amqm_teacher_current_evaluation_window() to authenticated;

-- One-time cleanup: unstarted drafts of students who are no longer active.
delete from public.evaluations e
 using public.students s
 where e.student_id = s.id
   and e.status = 'draft'
   and s.status <> 'active';

notify pgrst, 'reload schema';

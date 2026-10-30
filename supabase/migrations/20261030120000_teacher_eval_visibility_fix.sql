-- Teachers were not seeing the current open Evaluation 1 on their
-- dashboard even though admin had opened the window. Two root causes:
--
-- 1. amqm_teacher_operational_evaluations() filtered strictly on
--    e.teacher_id = auth.uid(). If a teacher assignment was changed
--    AFTER create_evaluation_campaign() ran, the stored teacher_id
--    on the evaluation row points at the OLD teacher -- the new
--    teacher sees nothing.
--
-- 2. The function also did not force a refresh_evaluation_windows()
--    call, so teacher_visible flips to true only when the pg_cron
--    worker fires (every 5 minutes). Admins could open a window and
--    teachers would still get the empty state for up to 5 minutes.
--
-- Fix: run refresh_evaluation_windows() at the top of the RPC and
-- union-match the teacher through BOTH (a) the stored teacher_id and
-- (b) the live class_teachers link for the student's current class.
-- The side effect: when admin reassigns a class to a new teacher,
-- the new teacher immediately picks up any open-window evaluations.

create or replace function public.amqm_teacher_operational_evaluations()
returns setof public.evaluations
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() <> 'teacher' then
    return;
  end if;

  perform public.refresh_evaluation_windows();

  return query
    select distinct e.*
    from public.evaluations e
    join public.terms t on t.id = e.term_id
    left join public.students s on s.id = e.student_id
    where t.is_current = true
      and (
        e.teacher_id = auth.uid()
        or exists (
          select 1 from public.class_teachers ct
          where ct.class_id = s.class_id
            and ct.teacher_id = auth.uid()
        )
      )
    order by e.teacher_visible_at desc nulls last,
             e.submitted_at desc nulls last
    limit 1000;
end;
$$;

grant execute on function public.amqm_teacher_operational_evaluations() to authenticated;

-- Also return (via a sibling RPC) the list of campaigns that are
-- currently open for the signed-in teacher's classes, EVEN WHEN the
-- evaluations table hasn't been populated for them yet. The teacher
-- dashboard uses this to render an explicit "Evaluation 1 is open
-- but no evaluation rows reached your account" explainer instead of
-- the vague "No open evaluation windows" message.

create or replace function public.amqm_teacher_open_campaigns_for_me()
returns table (
  campaign_id    uuid,
  title          text,
  evaluation_number smallint,
  opens_at       timestamptz,
  closes_at      timestamptz,
  class_names    text[],
  my_eval_count  integer
) language sql
security definer
set search_path = public
as $$
  with my_classes as (
    select class_id from public.class_teachers where teacher_id = auth.uid()
  )
  select c.id,
         c.title,
         c.evaluation_number,
         c.opens_at,
         c.closes_at,
         (
           select array_agg(cl.name order by cl.name)
           from public.evaluation_campaign_classes ecc
           join public.classes cl on cl.id = ecc.class_id
           where ecc.campaign_id = c.id
             and ecc.class_id in (select class_id from my_classes)
         ) as class_names,
         (
           select count(*)::int
           from public.evaluations e
           join public.students s on s.id = e.student_id
           where e.campaign_id = c.id
             and (
               e.teacher_id = auth.uid()
               or s.class_id in (select class_id from my_classes)
             )
         ) as my_eval_count
  from public.evaluation_campaigns c
  where c.status = 'open'
    and now() between c.opens_at and c.closes_at
    and exists (
      select 1 from public.evaluation_campaign_classes ecc
      where ecc.campaign_id = c.id
        and ecc.class_id in (select class_id from my_classes)
    )
  order by c.opens_at desc;
$$;

grant execute on function public.amqm_teacher_open_campaigns_for_me() to authenticated;

notify pgrst, 'reload schema';

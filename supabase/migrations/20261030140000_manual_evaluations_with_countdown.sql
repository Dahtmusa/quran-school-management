-- Simplify the evaluations flow at admin's request:
--
--   * Remove the automatic auto-submit on close. Admin controls open
--     and close explicitly. Drafts stay drafts; teachers can edit
--     them freely while the window is open.
--   * Admin opens an evaluation with a single click per round (1/2/3)
--     and a closing date-time. The RPC creates a campaign across
--     EVERY active class for the term, picks the current primary
--     teacher per class from class_teachers at open time, and
--     inserts the evaluation rows.
--   * Teacher evaluation RPC matches via live class_teachers link
--     too, so a mid-window reassignment immediately surfaces rows
--     for the new teacher.
--   * Dashboard gets a countdown by returning closes_at per open
--     campaign (new RPC).

-- 1. Soften refresh_evaluation_windows: still updates status flags
--    and teacher_visible flip at opens_at, but NO auto-submit.
create or replace function public.refresh_evaluation_windows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Campaign status reflects wall-clock position relative to window.
  update public.evaluation_campaigns
     set status = case
                    when now() < opens_at then 'scheduled'
                    when now() < closes_at then 'open'
                    else 'closed'
                  end,
         updated_at = now()
   where status <> 'completed';

  -- When a window opens, flip teacher_visible on its draft rows.
  update public.evaluations e
     set teacher_visible    = true,
         teacher_visible_at = coalesce(teacher_visible_at, now())
    from public.evaluation_campaigns c
   where e.campaign_id = c.id
     and e.status = 'draft'
     and now() between c.opens_at and c.closes_at;

  -- Deliberately NO auto-submit here. Admin presses the close button
  -- on each eval round manually. Rows stay as 'draft' with whatever
  -- teachers typed, and the window is simply flagged closed above --
  -- edits are then blocked at the application layer.

  perform public.advance_current_academic_term();
end
$$;

grant execute on function public.refresh_evaluation_windows() to authenticated;

-- 2. One-shot admin toggle: open a round across ALL active classes.
--    If a campaign for (term, number) already exists, we re-open it
--    and extend/replace closes_at. New evaluations are created only
--    for students that don't already have one.
create or replace function public.admin_toggle_evaluation(
  p_term_id          uuid,
  p_evaluation_number smallint,
  p_action           text,            -- 'open' or 'close'
  p_closes_at        timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_campaign public.evaluation_campaigns;
  v_class record;
  v_teacher uuid;
  v_students_affected int := 0;
  v_classes_affected int := 0;
begin
  v_role := public.my_role();
  if v_role not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if p_evaluation_number not between 1 and 3 then
    raise exception 'Evaluation number must be 1, 2 or 3';
  end if;
  if p_action not in ('open','close') then
    raise exception 'Action must be ''open'' or ''close''';
  end if;

  -- Find or create the campaign for (term, number).
  select * into v_campaign
    from public.evaluation_campaigns
   where term_id = p_term_id and evaluation_number = p_evaluation_number
   order by created_at desc
   limit 1;

  if p_action = 'close' then
    if v_campaign.id is null then
      raise exception 'No evaluation % found for this term', p_evaluation_number;
    end if;
    update public.evaluation_campaigns
       set status = 'closed', closes_at = least(closes_at, now()), updated_at = now()
     where id = v_campaign.id;
    return jsonb_build_object(
      'action', 'closed',
      'campaign_id', v_campaign.id,
      'closed_at', now()
    );
  end if;

  -- OPEN action.
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'Closing date must be in the future';
  end if;

  if v_campaign.id is null then
    insert into public.evaluation_campaigns(
      term_id, evaluation_number, title, opens_at, closes_at, status, created_by
    ) values (
      p_term_id, p_evaluation_number,
      'Evaluation ' || p_evaluation_number,
      now(), p_closes_at, 'open', auth.uid()
    ) returning * into v_campaign;
  else
    update public.evaluation_campaigns
       set opens_at   = least(opens_at, now()),
           closes_at  = p_closes_at,
           status     = 'open',
           updated_at = now()
     where id = v_campaign.id
     returning * into v_campaign;
  end if;

  -- Link every active class. Idempotent.
  for v_class in
    select id from public.classes where active = true
  loop
    insert into public.evaluation_campaign_classes(campaign_id, class_id)
    values (v_campaign.id, v_class.id)
    on conflict do nothing;
    v_classes_affected := v_classes_affected + 1;
  end loop;

  -- Create one draft evaluation per active student in those classes.
  -- teacher_id is picked LIVE from class_teachers so a mid-window
  -- reassignment is handled correctly by the next admin toggle call.
  for v_class in
    select st.id as student_id, st.class_id, st.current_surah, st.current_ayah
      from public.students st
     where st.status = 'active'
       and st.class_id in (
         select class_id from public.evaluation_campaign_classes
         where campaign_id = v_campaign.id
       )
  loop
    select ct.teacher_id into v_teacher
      from public.class_teachers ct
     where ct.class_id = v_class.class_id
     order by ct.is_primary desc, ct.assigned_at asc
     limit 1;

    if v_teacher is not null then
      insert into public.evaluations(
        student_id, teacher_id, term_id, evaluation_number,
        status, teacher_visible, teacher_visible_at, campaign_id,
        from_surah, from_ayah, to_surah, to_ayah
      ) values (
        v_class.student_id, v_teacher, p_term_id, p_evaluation_number,
        'draft', true, now(), v_campaign.id,
        v_class.current_surah, v_class.current_ayah,
        v_class.current_surah, v_class.current_ayah
      )
      on conflict(student_id, term_id, evaluation_number) do update
        set campaign_id        = excluded.campaign_id,
            teacher_id         = excluded.teacher_id,
            teacher_visible    = true,
            teacher_visible_at = coalesce(public.evaluations.teacher_visible_at, now()),
            status             = case
                                   when public.evaluations.status in ('approved','pending_approval')
                                     then public.evaluations.status
                                   else 'draft'
                                 end;
      v_students_affected := v_students_affected + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'action', 'opened',
    'campaign_id', v_campaign.id,
    'closes_at', v_campaign.closes_at,
    'classes_affected', v_classes_affected,
    'students_affected', v_students_affected
  );
end;
$$;

grant execute on function public.admin_toggle_evaluation(uuid, smallint, text, timestamptz) to authenticated;

-- 3. Teacher visibility: live class_teachers match so a reassigned
--    teacher sees the rows for their current class immediately.
create or replace function public.amqm_teacher_operational_evaluations()
returns setof public.evaluations
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() <> 'teacher' then return; end if;
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
end
$$;

grant execute on function public.amqm_teacher_operational_evaluations() to authenticated;

-- 4. Countdown + current window info for the teacher dashboard.
create or replace function public.amqm_teacher_current_evaluation_window()
returns table (
  campaign_id       uuid,
  title             text,
  evaluation_number smallint,
  opens_at          timestamptz,
  closes_at         timestamptz,
  my_eval_count     integer
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
           select count(*)::int
             from public.evaluations e
             join public.students s on s.id = e.student_id
            where e.campaign_id = c.id
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
$$;

grant execute on function public.amqm_teacher_current_evaluation_window() to authenticated;

-- 5. Status helper for admin UI: which rounds are open now?
create or replace function public.amqm_admin_evaluation_round_state(p_term_id uuid)
returns table (
  evaluation_number smallint,
  campaign_id       uuid,
  status            text,
  opens_at          timestamptz,
  closes_at         timestamptz,
  students_affected integer
) language sql
security definer
set search_path = public
as $$
  select n.n::smallint,
         c.id,
         coalesce(c.status, 'not_open'),
         c.opens_at,
         c.closes_at,
         (select count(*)::int from public.evaluations e where e.campaign_id = c.id)
    from (values (1),(2),(3)) as n(n)
    left join lateral (
      select *
        from public.evaluation_campaigns ec
       where ec.term_id = p_term_id
         and ec.evaluation_number = n.n
       order by ec.created_at desc
       limit 1
    ) c on true
   order by n.n;
$$;

grant execute on function public.amqm_admin_evaluation_round_state(uuid) to authenticated;

notify pgrst, 'reload schema';

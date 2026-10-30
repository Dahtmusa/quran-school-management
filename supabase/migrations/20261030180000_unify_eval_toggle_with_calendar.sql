-- Unify the two conflicting evaluation lifecycle systems:
--   * amqm_process_calendar_automation() auto-created a campaign from
--     school_calendar_events on cron. If the calendar's eval window
--     was already in the past (e.g. "Second Term Eval 1: 27-30 Oct"
--     while now is 30 Oct afternoon), the auto-created campaign was
--     born CLOSED, overwriting whatever the admin had just opened.
--   * admin_toggle_evaluation() lets admin control open/close by
--     hand with a chosen closes_at.
--
-- Fix: admin_toggle is the sole writer going forward.
--   * amqm_process_calendar_automation() keeps running for status
--     syncing (teacher visibility, draft closure) but it NO LONGER
--     creates campaigns from past-dated calendar events. It only
--     auto-opens a scheduled campaign at opens_at and auto-closes at
--     closes_at. Admin stays in charge of the opens_at/closes_at
--     values themselves.
--   * admin_toggle_evaluation on 'open' now DELETES any existing
--     campaign for (term, evaluation_number) and re-inserts a fresh
--     one with the admin-chosen closes_at. Guarantees no stale state.
--   * amqm_admin_evaluation_round_state also returns the calendar's
--     suggested dates so the admin UI can show them as hints.

-- 1. Neutralise the automation cron: only act on FUTURE calendar
-- events, and only on existing campaigns, never create past-dated
-- ones.
create or replace function public.amqm_process_calendar_automation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  camp record;
  opened int := 0;
  closed int := 0;
begin
  -- Only toggle status for existing campaigns based on their stored
  -- opens_at / closes_at. Never create new ones from the calendar
  -- (admin owns that via admin_toggle_evaluation).
  for camp in
    select * from public.evaluation_campaigns where status in ('scheduled','open')
  loop
    if camp.status = 'scheduled' and now() >= camp.opens_at and now() < camp.closes_at then
      update public.evaluation_campaigns
         set status = 'open', updated_at = now()
       where id = camp.id;
      -- Flip teacher_visible on draft rows so they can see the window.
      update public.evaluations e
         set teacher_visible = true,
             teacher_visible_at = coalesce(e.teacher_visible_at, now())
       where e.campaign_id = camp.id and e.status = 'draft';
      opened := opened + 1;
    elsif camp.status = 'open' and now() >= camp.closes_at then
      update public.evaluation_campaigns
         set status = 'closed', updated_at = now()
       where id = camp.id;
      closed := closed + 1;
    end if;
  end loop;

  return jsonb_build_object('opened_campaigns', opened, 'closed_campaigns', closed, 'created_campaigns', 0);
end;
$$;

grant execute on function public.amqm_process_calendar_automation() to authenticated;

-- 2. admin_toggle_evaluation becomes authoritative. On 'open' we
-- DELETE and re-INSERT the campaign so stale closes_at or status
-- from a prior cycle cannot leak into the new window.
create or replace function public.admin_toggle_evaluation(
  p_term_id          uuid,
  p_evaluation_number smallint,
  p_action           text,
  p_closes_at        timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_campaign_id uuid;
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

  if p_action = 'close' then
    update public.evaluation_campaigns
       set status = 'closed', closes_at = now(), updated_at = now()
     where term_id = p_term_id and evaluation_number = p_evaluation_number;
    return jsonb_build_object('action','closed','closed_at', now());
  end if;

  -- OPEN action. closes_at must be in the future.
  if p_closes_at is null or p_closes_at <= now() + interval '5 minutes' then
    raise exception 'Closing date must be at least 5 minutes in the future';
  end if;

  -- Scrub any pre-existing campaign for this (term, round) so stale
  -- state from the calendar cron cannot interfere.
  delete from public.evaluation_campaign_classes
   where campaign_id in (
     select id from public.evaluation_campaigns
     where term_id = p_term_id and evaluation_number = p_evaluation_number
   );
  delete from public.evaluation_campaigns
   where term_id = p_term_id and evaluation_number = p_evaluation_number;

  -- Fresh campaign.
  insert into public.evaluation_campaigns(
    term_id, evaluation_number, title, opens_at, closes_at, status, created_by
  ) values (
    p_term_id, p_evaluation_number,
    'Evaluation ' || p_evaluation_number,
    now(), p_closes_at, 'open', auth.uid()
  ) returning id into v_campaign_id;

  -- Link every active class.
  for v_class in select id from public.classes where active = true
  loop
    insert into public.evaluation_campaign_classes(campaign_id, class_id)
    values (v_campaign_id, v_class.id);
    v_classes_affected := v_classes_affected + 1;
  end loop;

  -- Create one draft evaluation per active student in those classes,
  -- using the live class_teachers link to pick the teacher.
  for v_class in
    select st.id as student_id, st.class_id, st.current_surah, st.current_ayah
      from public.students st
     where st.status = 'active'
       and st.class_id in (
         select class_id from public.evaluation_campaign_classes
         where campaign_id = v_campaign_id
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
        'draft', true, now(), v_campaign_id,
        v_class.current_surah, v_class.current_ayah,
        v_class.current_surah, v_class.current_ayah
      )
      on conflict(student_id, term_id, evaluation_number) do update set
        campaign_id        = excluded.campaign_id,
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
    'action','opened',
    'campaign_id', v_campaign_id,
    'closes_at', p_closes_at,
    'classes_affected', v_classes_affected,
    'students_affected', v_students_affected
  );
end;
$$;

grant execute on function public.admin_toggle_evaluation(uuid, smallint, text, timestamptz) to authenticated;

-- 3. Return calendar hints alongside the round state so the admin UI
-- can show "Calendar suggests closes at X" below each card.
create or replace function public.amqm_admin_evaluation_round_state(p_term_id uuid)
returns table (
  evaluation_number smallint,
  campaign_id       uuid,
  status            text,
  opens_at          timestamptz,
  closes_at         timestamptz,
  students_affected integer,
  calendar_opens_at timestamptz,
  calendar_closes_at timestamptz
) language sql
security definer
set search_path = public
as $$
  select n.n::smallint,
         c.id,
         coalesce(c.status, 'not_open'),
         c.opens_at,
         c.closes_at,
         (select count(*)::int from public.evaluations e where e.campaign_id = c.id),
         ce.starts_at,
         ce.ends_at
    from (values (1),(2),(3)) as n(n)
    left join lateral (
      select *
        from public.evaluation_campaigns ec
       where ec.term_id = p_term_id
         and ec.evaluation_number = n.n
       order by ec.created_at desc
       limit 1
    ) c on true
    left join lateral (
      select starts_at, ends_at
        from public.school_calendar_events
       where term_id = p_term_id
         and event_type = ('evaluation_' || n.n::text)
       order by starts_at desc
       limit 1
    ) ce on true
   order by n.n;
$$;

grant execute on function public.amqm_admin_evaluation_round_state(uuid) to authenticated;

notify pgrst, 'reload schema';

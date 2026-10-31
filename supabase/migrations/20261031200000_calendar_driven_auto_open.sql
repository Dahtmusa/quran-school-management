-- Automatic sync between the School Calendar and evaluation
-- campaigns. The intent is simple: if the Calendar says Eval N is
-- within its live window right now, the system should ensure a
-- campaign exists and is OPEN. If the window has not yet started,
-- the campaign (if any) should be SCHEDULED. If the window has
-- passed, CLOSED.
--
-- This function is the single sync entry point. It:
--   1. For every active evaluation_1/2/3 event in the current term:
--      * If no campaign exists for (term, round) AND the Calendar
--        window is live or starting soon, create a fresh campaign
--        and populate draft rows for every active student in every
--        active class, with the live class teacher assignment.
--      * If a campaign already exists, reconcile its opens_at /
--        closes_at / status with the Calendar.
--
-- Called automatically on every /evaluations and /teacher/evaluations
-- page load so admins and teachers never see a stale state.

create or replace function public.amqm_sync_evaluations_from_calendar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term_id uuid;
  v_cal record;
  v_campaign public.evaluation_campaigns;
  v_class record;
  v_teacher uuid;
  v_created int := 0;
  v_opened int := 0;
  v_closed int := 0;
  v_rescheduled int := 0;
begin
  -- Current term only.
  select id into v_term_id from public.terms where is_current = true limit 1;
  if v_term_id is null then
    return jsonb_build_object('note', 'no current term');
  end if;

  for v_cal in
    select id, event_type, starts_at, ends_at, title,
           (regexp_match(event_type, 'evaluation_(\d)'))[1]::smallint as evaluation_number
      from public.school_calendar_events
     where term_id = v_term_id
       and event_type in ('evaluation_1','evaluation_2','evaluation_3')
       and starts_at is not null
       and ends_at is not null
  loop
    select * into v_campaign
      from public.evaluation_campaigns
     where term_id = v_term_id
       and evaluation_number = v_cal.evaluation_number
     order by created_at desc
     limit 1;

    -- No campaign yet. Create one only if the Calendar window is
    -- currently live or about to be (within a day).
    if v_campaign.id is null then
      if now() >= v_cal.starts_at - interval '1 day' then
        insert into public.evaluation_campaigns(
          term_id, evaluation_number, title, calendar_event_id,
          opens_at, closes_at,
          status, created_by
        )
        values (
          v_term_id, v_cal.evaluation_number,
          coalesce(nullif(v_cal.title,''), 'Evaluation ' || v_cal.evaluation_number),
          v_cal.id,
          v_cal.starts_at, v_cal.ends_at,
          case when now() < v_cal.starts_at then 'scheduled'
               when now() < v_cal.ends_at   then 'open'
               else 'closed' end,
          auth.uid()
        )
        returning * into v_campaign;
        v_created := v_created + 1;

        -- Attach every active class.
        for v_class in select id from public.classes where active = true
        loop
          insert into public.evaluation_campaign_classes(campaign_id, class_id)
          values (v_campaign.id, v_class.id)
          on conflict do nothing;
        end loop;

        -- Draft row per active student in those classes, with live
        -- teacher assignment. to_surah / to_ayah stay null.
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
              v_class.student_id, v_teacher, v_term_id, v_cal.evaluation_number,
              'draft', true, now(), v_campaign.id,
              v_class.current_surah, v_class.current_ayah,
              null, null
            )
            on conflict(student_id, term_id, evaluation_number) do nothing;
          end if;
        end loop;
      end if;
    else
      -- Campaign exists. Reconcile dates and status with the Calendar.
      -- If the admin had closed it manually and the Calendar says it
      -- should still be running, re-open.
      if v_campaign.opens_at  is distinct from v_cal.starts_at
         or v_campaign.closes_at is distinct from v_cal.ends_at
         or v_campaign.calendar_event_id is distinct from v_cal.id
      then
        update public.evaluation_campaigns
           set opens_at         = v_cal.starts_at,
               closes_at        = v_cal.ends_at,
               calendar_event_id = v_cal.id,
               updated_at       = now()
         where id = v_campaign.id;
        v_rescheduled := v_rescheduled + 1;
      end if;

      -- Recompute status against the current wall clock.
      if now() < v_cal.starts_at and v_campaign.status <> 'scheduled' then
        update public.evaluation_campaigns
           set status = 'scheduled', updated_at = now()
         where id = v_campaign.id;
      elsif now() >= v_cal.starts_at and now() < v_cal.ends_at and v_campaign.status <> 'open' then
        update public.evaluation_campaigns
           set status = 'open', updated_at = now()
         where id = v_campaign.id;
        -- Flip teacher visibility on drafts.
        update public.evaluations e
           set teacher_visible = true,
               teacher_visible_at = coalesce(e.teacher_visible_at, now())
         where e.campaign_id = v_campaign.id
           and e.status = 'draft';
        v_opened := v_opened + 1;
      elsif now() >= v_cal.ends_at and v_campaign.status <> 'closed' then
        update public.evaluation_campaigns
           set status = 'closed', updated_at = now()
         where id = v_campaign.id;
        v_closed := v_closed + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'created_campaigns',  v_created,
    'opened_campaigns',   v_opened,
    'closed_campaigns',   v_closed,
    'rescheduled_campaigns', v_rescheduled
  );
end;
$$;

grant execute on function public.amqm_sync_evaluations_from_calendar() to authenticated;

-- Fold the calendar sync into the existing admin round state RPC so
-- a single call from the Evaluations page both syncs AND returns the
-- state. One round trip, always fresh.
drop function if exists public.amqm_admin_evaluation_round_state(uuid);
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
) language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.amqm_sync_evaluations_from_calendar();
  return query
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
end;
$$;
grant execute on function public.amqm_admin_evaluation_round_state(uuid) to authenticated;

-- Same for the teacher-side RPCs so teachers never see a stale state.
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

notify pgrst, 'reload schema';

-- School Calendar becomes the single source of truth for all
-- evaluation dates. Admin configures Eval 1/2/3 opens/closes on the
-- Calendar page once per term. On the Evaluations page admin just
-- clicks Open or Close -- no date picker. If admin edits the
-- calendar later, every open campaign's closes_at syncs
-- automatically.
--
-- Three pieces:
--   1. admin_toggle_evaluation now reads opens_at/closes_at from the
--      linked school_calendar_events row. closes_at parameter is
--      ignored. If no calendar event exists for the chosen round,
--      the RPC refuses with a clear instruction.
--   2. A BEFORE UPDATE trigger on school_calendar_events keeps any
--      evaluation_campaigns rows that reference the event in sync
--      whenever admin edits the calendar dates.
--   3. amqm_admin_evaluation_round_state keeps returning calendar
--      hints so the UI can show "Opens <cal_opens> -> Closes
--      <cal_closes>" above each round card without any extra round
--      trips.

create or replace function public.admin_toggle_evaluation(
  p_term_id          uuid,
  p_evaluation_number smallint,
  p_action           text,
  p_closes_at        timestamptz default null  -- ignored, kept for client compatibility
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_cal record;
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

  -- OPEN action -- read dates from the Calendar.
  select id, starts_at, ends_at, title
    into v_cal
    from public.school_calendar_events
   where term_id = p_term_id
     and event_type = ('evaluation_' || p_evaluation_number::text)
   order by starts_at desc
   limit 1;

  if v_cal.id is null then
    raise exception 'No Evaluation % date configured in School Calendar for this term. Set it there first.', p_evaluation_number;
  end if;
  if v_cal.ends_at is null or v_cal.ends_at <= now() + interval '5 minutes' then
    raise exception 'Calendar Evaluation % closing date is in the past (or too close). Extend it on the Calendar page first.', p_evaluation_number;
  end if;

  -- Scrub any pre-existing campaign and start fresh.
  delete from public.evaluation_campaign_classes
   where campaign_id in (
     select id from public.evaluation_campaigns
     where term_id = p_term_id and evaluation_number = p_evaluation_number
   );
  delete from public.evaluation_campaigns
   where term_id = p_term_id and evaluation_number = p_evaluation_number;

  insert into public.evaluation_campaigns(
    term_id, evaluation_number, title, calendar_event_id,
    opens_at, closes_at, status, created_by
  ) values (
    p_term_id, p_evaluation_number,
    coalesce(nullif(v_cal.title,''), 'Evaluation ' || p_evaluation_number),
    v_cal.id,
    now(), v_cal.ends_at,          -- opens NOW, closes per Calendar
    'open', auth.uid()
  ) returning id into v_campaign_id;

  for v_class in select id from public.classes where active = true
  loop
    insert into public.evaluation_campaign_classes(campaign_id, class_id)
    values (v_campaign_id, v_class.id);
    v_classes_affected := v_classes_affected + 1;
  end loop;

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
        null, null
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
    'closes_at', v_cal.ends_at,
    'calendar_event_id', v_cal.id,
    'classes_affected', v_classes_affected,
    'students_affected', v_students_affected
  );
end;
$$;

grant execute on function public.admin_toggle_evaluation(uuid, smallint, text, timestamptz) to authenticated;

-- Trigger: when admin edits an evaluation calendar event, propagate
-- the new ends_at to every open campaign linked to it.
create or replace function public.amqm_sync_campaigns_from_calendar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE'
     and NEW.event_type in ('evaluation_1','evaluation_2','evaluation_3')
     and (NEW.ends_at is distinct from OLD.ends_at or NEW.starts_at is distinct from OLD.starts_at)
  then
    update public.evaluation_campaigns
       set closes_at = NEW.ends_at,
           opens_at  = case when status = 'scheduled' then NEW.starts_at else opens_at end,
           status    = case
                         when now() < coalesce(NEW.starts_at, opens_at) then 'scheduled'
                         when now() < NEW.ends_at then 'open'
                         else 'closed'
                       end,
           updated_at = now()
     where calendar_event_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists amqm_calendar_sync_campaigns on public.school_calendar_events;
create trigger amqm_calendar_sync_campaigns
  after update on public.school_calendar_events
  for each row
  execute function public.amqm_sync_campaigns_from_calendar();

notify pgrst, 'reload schema';

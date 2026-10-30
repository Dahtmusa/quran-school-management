-- admin_toggle_evaluation was writing to_surah=current_surah and
-- to_ayah=current_ayah on draft rows, which the position-guard
-- trigger (migration 036) treats as "stopping position equals
-- starting position" and rejects for both directions. Drafts must
-- carry NULL for to_surah / to_ayah until the teacher enters a real
-- stopping position via submit_teacher_evaluation.

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

  if p_closes_at is null or p_closes_at <= now() + interval '5 minutes' then
    raise exception 'Closing date must be at least 5 minutes in the future';
  end if;

  delete from public.evaluation_campaign_classes
   where campaign_id in (
     select id from public.evaluation_campaigns
     where term_id = p_term_id and evaluation_number = p_evaluation_number
   );
  delete from public.evaluation_campaigns
   where term_id = p_term_id and evaluation_number = p_evaluation_number;

  insert into public.evaluation_campaigns(
    term_id, evaluation_number, title, opens_at, closes_at, status, created_by
  ) values (
    p_term_id, p_evaluation_number,
    'Evaluation ' || p_evaluation_number,
    now(), p_closes_at, 'open', auth.uid()
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
      -- to_surah / to_ayah stay NULL on draft so the position-guard
      -- trigger (migration 036) does not reject the row for "must
      -- move". Teacher fills them in on submit.
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
    'closes_at', p_closes_at,
    'classes_affected', v_classes_affected,
    'students_affected', v_students_affected
  );
end;
$$;

grant execute on function public.admin_toggle_evaluation(uuid, smallint, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

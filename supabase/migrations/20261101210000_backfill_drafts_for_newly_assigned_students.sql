-- When a teacher is assigned to a class mid-cycle, or a student is added to a
-- class after a campaign already opened, the sync RPC did not create draft
-- rows for them. Result: a newly-assigned teacher saw "0 students to
-- evaluate" even though class_teachers linked them.
--
-- Fix: a backfill function that creates any missing drafts for active
-- students in classes attached to a scheduled/open campaign in the current
-- term, and re-points existing drafts whose teacher_id no longer matches
-- the current primary class teacher. Idempotent.

create or replace function public.amqm_backfill_evaluation_drafts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
  v_term_id uuid;
begin
  select id into v_term_id from public.terms where is_current = true limit 1;
  if v_term_id is null then return 0; end if;

  with target_students as (
    select distinct c.id as campaign_id,
           c.evaluation_number,
           s.id as student_id,
           s.class_id,
           s.current_surah,
           s.current_ayah
      from public.evaluation_campaigns c
      join public.evaluation_campaign_classes cc on cc.campaign_id = c.id
      join public.students s on s.class_id = cc.class_id and s.status = 'active'
     where c.term_id = v_term_id
       and c.status in ('scheduled','open')
  ),
  with_teacher as (
    select ts.*,
           (select ct.teacher_id
              from public.class_teachers ct
              join public.profiles p on p.id = ct.teacher_id
             where ct.class_id = ts.class_id and p.employment_status = 'active'
             order by ct.is_primary desc, ct.assigned_at asc
             limit 1) as teacher_id
      from target_students ts
  ),
  inserted as (
    insert into public.evaluations(
      student_id, teacher_id, term_id, evaluation_number,
      status, teacher_visible, teacher_visible_at, campaign_id,
      from_surah, from_ayah, to_surah, to_ayah
    )
    select wt.student_id, wt.teacher_id, v_term_id, wt.evaluation_number,
           'draft', true, now(), wt.campaign_id,
           coalesce(wt.current_surah, 1), coalesce(wt.current_ayah, 1), null, null
      from with_teacher wt
     where wt.teacher_id is not null
       and not exists (
         select 1 from public.evaluations e
          where e.student_id = wt.student_id
            and e.term_id = v_term_id
            and e.evaluation_number = wt.evaluation_number
       )
    returning 1
  )
  select count(*) into v_inserted from inserted;

  with current_class_teacher as (
    select distinct on (ct.class_id) ct.class_id, ct.teacher_id
      from public.class_teachers ct
      join public.profiles p on p.id = ct.teacher_id
     where p.employment_status = 'active'
     order by ct.class_id, ct.is_primary desc, ct.assigned_at asc
  )
  update public.evaluations e
     set teacher_id = cct.teacher_id
    from public.students s, current_class_teacher cct
   where e.student_id = s.id
     and s.class_id = cct.class_id
     and e.term_id = v_term_id
     and e.status in ('draft','returned')
     and e.teacher_id is distinct from cct.teacher_id;
  get diagnostics v_updated = row_count;

  return v_inserted + v_updated;
end;
$$;

grant execute on function public.amqm_backfill_evaluation_drafts() to authenticated;

-- Have the assign RPC run the backfill right after it syncs the enrolments,
-- so a mid-cycle teacher assignment immediately populates their eval queue.
create or replace function public.admin_assign_teacher_to_class(
  p_class_id uuid,
  p_teacher_id uuid,
  p_is_primary boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term_ids uuid[];
  v_enrol_count int := 0;
  v_term_count int := 0;
  v_backfilled int := 0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  perform 1 from public.profiles
   where id = p_teacher_id and role = 'teacher' and employment_status = 'active';
  if not found then
    raise exception 'Teacher must be an active teacher profile';
  end if;

  insert into public.class_teachers(class_id, teacher_id, is_primary)
    values (p_class_id, p_teacher_id, coalesce(p_is_primary, false))
    on conflict(class_id, teacher_id) do update set is_primary = excluded.is_primary;

  select array_agg(id) into v_term_ids
    from public.terms
   where ends_on >= (now() at time zone 'Africa/Lagos')::date;

  if v_term_ids is not null then
    insert into public.term_teacher_assignments(term_id, class_id, teacher_id, is_primary, source)
      select t, p_class_id, p_teacher_id, coalesce(p_is_primary, false), 'admin_ui'
        from unnest(v_term_ids) t
      on conflict(term_id, class_id, teacher_id) do update set is_primary = excluded.is_primary;
    get diagnostics v_term_count = row_count;

    update public.student_enrollments se
       set teacher_id = p_teacher_id
     where se.class_id = p_class_id
       and se.status = 'active'
       and se.term_id = any(v_term_ids);
    get diagnostics v_enrol_count = row_count;
  end if;

  -- NEW: create any missing draft evaluations for students in this class and
  -- update stale teacher ids on existing drafts.
  v_backfilled := public.amqm_backfill_evaluation_drafts();

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'teacher:assign_to_class', 'classes', p_class_id,
          jsonb_build_object('teacher_id', p_teacher_id, 'is_primary', p_is_primary,
                             'enrolments_updated', v_enrol_count,
                             'drafts_backfilled', v_backfilled));

  return jsonb_build_object(
    'class_id', p_class_id,
    'teacher_id', p_teacher_id,
    'enrolments_updated', v_enrol_count,
    'term_assignments_affected', v_term_count,
    'drafts_backfilled', v_backfilled
  );
end;
$$;

grant execute on function public.admin_assign_teacher_to_class(uuid, uuid, boolean) to authenticated;

-- One-shot backfill now to catch Sa'ad's 26 students (and any others in the
-- same state).
select public.amqm_backfill_evaluation_drafts();

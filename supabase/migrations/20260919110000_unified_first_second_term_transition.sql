-- AMQM unified historical First-Term -> Second-Term transition
-- One protected action performs the full baseline close + operational handoff.
-- It is blocked until the next term is due and launch prerequisites are ready.

create or replace function public.amqm_close_historical_first_term_start_second(p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  first_term public.terms;
  second_term public.terms;
  readiness jsonb;
  first_active_enrollments integer:=0;
  second_enrollments integer:=0;
  second_teacher_assignments integer:=0;
  second_fee_rows integer:=0;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select t.* into first_term
  from public.terms t
  where t.term_number=1 and t.is_current=true
  order by t.starts_on desc limit 1;

  if first_term.id is null then
    raise exception 'First Term is not the current term.';
  end if;

  if first_term.lifecycle_status='historical_closed' then
    select t.* into second_term
    from public.terms t
    where t.academic_year_id=first_term.academic_year_id and t.term_number=2
    limit 1;
    if second_term.id is not null and second_term.lifecycle_status='digital_active' and second_term.is_current then
      return jsonb_build_object('success',true,'opened',true,'already_active',true,'first_term_id',first_term.id,'second_term_id',second_term.id,'message','Second Term is already active.');
    end if;
    raise exception 'First Term is already closed but Second Term is not active. Use the operational recovery controls.';
  end if;

  if first_term.lifecycle_status<>'historical_baseline' then
    raise exception 'Only the protected historical First Term baseline can use this transition.';
  end if;

  select t.* into second_term
  from public.terms t
  where t.academic_year_id=first_term.academic_year_id and t.term_number=2
  limit 1;

  if second_term.id is null then
    raise exception 'Second Term is not configured for this academic session.';
  end if;

  if second_term.starts_on > current_date then
    raise exception 'Second Term starts on %. The transition button becomes executable on that date.',second_term.starts_on;
  end if;

  perform public.amqm_capture_historical_baseline();

  insert into public.student_enrollments(student_id,term_id,class_id,section,program_year,teacher_id,status,source)
  select s.id,second_term.id,s.class_id,s.section,s.program_year,ct.teacher_id,'active','unified_term_transition'
  from public.students s
  left join lateral (
    select ct2.teacher_id
    from public.class_teachers ct2
    where ct2.class_id=s.class_id
    order by ct2.is_primary desc,ct2.assigned_at asc limit 1
  ) ct on true
  where s.status='active'
  on conflict(student_id,term_id) do update set
    class_id=excluded.class_id,section=excluded.section,program_year=excluded.program_year,
    teacher_id=excluded.teacher_id,status='active',updated_at=now();

  get diagnostics second_enrollments=row_count;

  update public.student_enrollments se
  set status='withdrawn',updated_at=now()
  where se.term_id=second_term.id
    and not exists(select 1 from public.students s where s.id=se.student_id and s.status='active');

  insert into public.term_teacher_assignments(term_id,class_id,teacher_id,is_primary,source)
  select second_term.id,ct.class_id,ct.teacher_id,ct.is_primary,'unified_term_transition'
  from public.class_teachers ct
  join public.classes c on c.id=ct.class_id and c.active=true and c.academic_year_id=second_term.academic_year_id
  on conflict(term_id,class_id,teacher_id) do update set is_primary=excluded.is_primary;

  get diagnostics second_teacher_assignments=row_count;

  select public.sync_student_fee_allocations(second_term.id) into second_fee_rows;
  perform public.sync_term_invoices(second_term.id);

  readiness:=public.amqm_digital_launch_readiness();
  if not coalesce((readiness->>'ready')::boolean,false) then
    raise exception 'Digital launch is not ready: %',readiness;
  end if;

  update public.student_enrollments
  set status='completed',updated_at=now()
  where term_id=first_term.id and status='active';
  get diagnostics first_active_enrollments=row_count;

  insert into public.term_completions(term_id,completed_by,notes)
  values(first_term.id,actor,coalesce(p_notes,'Historical First Term baseline closed by unified digital launch transition.'))
  on conflict(term_id) do update set
    completed_at=now(),completed_by=actor,notes=coalesce(excluded.notes,public.term_completions.notes);

  insert into public.student_term_progress(
    student_id,term_id,opening_surah,opening_ayah,opening_page,opening_hizb,status
  )
  select b.student_id,second_term.id,
    (b.quran_closing->>'surah')::smallint,
    (b.quran_closing->>'ayah')::smallint,
    (b.quran_closing->>'page')::smallint,
    (b.quran_closing->>'hizb')::smallint,
    'open'
  from public.amqm_historical_baselines b
  join public.students s on s.id=b.student_id and s.status='active'
  on conflict(student_id,term_id) do update set
    opening_surah=excluded.opening_surah,opening_ayah=excluded.opening_ayah,
    opening_page=excluded.opening_page,opening_hizb=excluded.opening_hizb,
    status='open',updated_at=now();

  update public.students s
  set current_surah=(b.quran_closing->>'surah')::smallint,
      current_ayah=(b.quran_closing->>'ayah')::smallint,
      current_page=(b.quran_closing->>'page')::smallint,
      current_hizb=coalesce((b.quran_closing->>'hizb')::smallint,s.current_hizb)
  from public.amqm_historical_baselines b
  where b.student_id=s.id and s.status='active';

  update public.terms set is_current=false where is_current=true;

  update public.terms
  set lifecycle_status='historical_closed',is_current=false,closed_at=now(),closed_by=actor
  where id=first_term.id;

  update public.terms
  set lifecycle_status='digital_active',is_current=true,closed_at=null,closed_by=null
  where id=second_term.id;

  update public.academic_years
  set is_current=true,lifecycle_status='open',
      opened_at=coalesce(opened_at,now()),opened_by=coalesce(opened_by,actor)
  where id=second_term.academic_year_id;

  update public.academic_cycle_settings
  set current_academic_year_id=second_term.academic_year_id,
      current_term_id=second_term.id,updated_at=now(),updated_by=actor
  where id=true;

  insert into public.academic_cycle_events(
    academic_year_id,term_id,action,from_status,to_status,metadata,actor_id
  )
  values(
    first_term.academic_year_id,first_term.id,
    'historical_first_term_transition','historical_baseline','historical_closed',
    jsonb_build_object(
      'second_term_id',second_term.id,
      'first_term_enrollments_completed',first_active_enrollments,
      'second_term_enrollments_upserted',second_enrollments,
      'second_term_teacher_assignments_upserted',second_teacher_assignments,
      'second_term_fee_rows_affected',second_fee_rows,
      'second_term_invoice_sync','completed',
      'notes',p_notes
    ),actor
  );

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_data)
  values(
    actor,'historical_first_term_closed_second_term_opened','term',second_term.id,
    jsonb_build_object('first_term_id',first_term.id,'second_term_id',second_term.id,'transition','atomic','notes',p_notes)
  );

  return jsonb_build_object(
    'success',true,'opened',true,'first_term_id',first_term.id,'second_term_id',second_term.id,
    'second_term_start',second_term.starts_on,
    'first_term_enrollments_completed',first_active_enrollments,
    'second_term_enrollments',second_enrollments,
    'second_term_teacher_assignments',second_teacher_assignments,
    'second_term_fee_rows_affected',second_fee_rows,
    'message','Historical First Term archived. Second Term is now the active digital term.'
  );
end;
$$;

grant execute on function public.amqm_close_historical_first_term_start_second(text) to authenticated;
notify pgrst,'reload schema';

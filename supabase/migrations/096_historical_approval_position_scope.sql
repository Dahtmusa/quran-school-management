-- Approve a historical class atomically and only then carry each student's
-- approved First Term endpoint into the official current/next-term starting position.
create or replace function public.admin_approve_class_historical_evals(p_term_id uuid,p_class_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer; v_expected integer; v_pending integer; v_approved integer; r record;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Admin access required'; end if;
  select count(*) into v_expected from public.students where class_id=p_class_id and status='active';
  select count(*) into v_pending from public.evaluations e join public.students s on s.id=e.student_id where e.term_id=p_term_id and e.evaluation_number=3 and e.campaign_id is null and e.status='pending_approval' and s.class_id=p_class_id and s.status='active';
  select count(*) into v_approved from public.evaluations e join public.students s on s.id=e.student_id where e.term_id=p_term_id and e.evaluation_number=3 and e.campaign_id is null and e.status='approved' and s.class_id=p_class_id and s.status='active';
  if v_pending=0 then if v_approved=v_expected and v_expected>0 then return 0; end if; raise exception 'This class is not ready for approval: % of % active students have pending Eval 3.',v_pending,v_expected; end if;
  if v_pending+v_approved<>v_expected then raise exception 'Class approval blocked: % of % active students have a historical Eval 3. All students must be submitted before approval.',v_pending+v_approved,v_expected; end if;
  create temporary table if not exists tmp_amqm_historical_approval(student_id uuid primary key,to_surah smallint,to_ayah smallint) on commit drop;
  truncate tmp_amqm_historical_approval;
  insert into tmp_amqm_historical_approval select e.student_id,e.to_surah,e.to_ayah from public.evaluations e join public.students s on s.id=e.student_id where e.term_id=p_term_id and e.evaluation_number=3 and e.campaign_id is null and e.status='pending_approval' and s.class_id=p_class_id and s.status='active';
  update public.evaluations e set status='approved',approved_at=now(),approved_by=auth.uid(),teacher_visible=false from public.students s where e.student_id=s.id and e.term_id=p_term_id and e.evaluation_number=3 and e.campaign_id is null and e.status='pending_approval' and s.class_id=p_class_id and s.status='active';
  get diagnostics v_count=row_count;
  for r in select * from tmp_amqm_historical_approval loop
    update public.students set current_surah=r.to_surah,current_ayah=r.to_ayah,start_surah=r.to_surah,start_ayah=r.to_ayah,current_page=(select page from public.quran_verses where surah=r.to_surah and ayah=r.to_ayah),current_hizb=(select hizb from public.quran_verses where surah=r.to_surah and ayah=r.to_ayah) where id=r.student_id;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.admin_approve_class_historical_evals(uuid,uuid) to authenticated;

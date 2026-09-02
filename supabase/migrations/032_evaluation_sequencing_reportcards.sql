-- Sequential evaluations, incremental report-card eligibility, and approval-driven report creation.

create or replace function public.create_evaluation_campaign(
  p_term_id uuid,p_evaluation_number smallint,p_title text,p_calendar_event_id uuid,p_class_ids uuid[]
) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; campaign_id uuid; ev public.school_calendar_events; s record; teacher uuid; missing_count integer;
begin
 if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
 if p_evaluation_number not between 1 and 3 then raise exception 'Evaluation number must be 1, 2 or 3'; end if;
 select * into ev from public.school_calendar_events where id=p_calendar_event_id;
 if ev.id is null then raise exception 'Select a calendar evaluation window'; end if;
 if ev.event_type<>('evaluation_'||p_evaluation_number) then raise exception 'Calendar event type must match Evaluation %',p_evaluation_number; end if;
 if ev.starts_at is null or ev.ends_at is null then raise exception 'Evaluation calendar event needs both opening and closing times'; end if;
 if ev.term_id is distinct from p_term_id then raise exception 'Calendar event is linked to a different term'; end if;
 if coalesce(array_length(p_class_ids,1),0)=0 then raise exception 'Select at least one class'; end if;
 if p_evaluation_number>1 then
   select count(*) into missing_count from public.students st where st.status='active' and st.class_id=any(p_class_ids)
     and not exists(select 1 from public.evaluations e where e.student_id=st.id and e.term_id=p_term_id and e.evaluation_number=p_evaluation_number-1 and e.status='approved');
   if missing_count>0 then raise exception 'Evaluation % cannot open yet: % student(s) in the selected classes still need Evaluation % approved.',p_evaluation_number,missing_count,p_evaluation_number-1; end if;
 end if;
 insert into public.evaluation_campaigns(term_id,evaluation_number,title,calendar_event_id,opens_at,closes_at,created_by)
 values(p_term_id,p_evaluation_number,trim(p_title),p_calendar_event_id,ev.starts_at,ev.ends_at,auth.uid()) returning id into campaign_id;
 foreach cid in array p_class_ids loop insert into public.evaluation_campaign_classes(campaign_id,class_id) values(campaign_id,cid) on conflict do nothing; end loop;
 for s in select distinct st.* from public.students st join public.evaluation_campaign_classes ecc on ecc.class_id=st.class_id where ecc.campaign_id=campaign_id and st.status='active' loop
   select ct.teacher_id into teacher from public.class_teachers ct where ct.class_id=s.class_id order by ct.is_primary desc,ct.assigned_at asc limit 1;
   if teacher is not null then insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,teacher_visible,teacher_visible_at,campaign_id,from_surah,from_ayah,to_surah,to_ayah)
   values(s.id,teacher,p_term_id,p_evaluation_number,'draft',false,null,campaign_id,s.current_surah,s.current_ayah,s.current_surah,s.current_ayah)
   on conflict(student_id,term_id,evaluation_number) do update set campaign_id=excluded.campaign_id; end if;
 end loop;
 return campaign_id;
end $$;

-- A report card may exist while later evaluations are pending; only finalized requires all 3 approvals.
create or replace function public.validate_report_card_approvals()
returns trigger language plpgsql security invoker as $$
declare approved_count integer;
begin
 select count(*) into approved_count from public.evaluations where student_id=new.student_id and term_id=new.term_id and status='approved' and evaluation_number in (1,2,3);
 if new.finalized and approved_count<>3 then raise exception 'A finalized report card requires all three evaluations approved.'; end if;
 return new;
end $$;

create or replace function public.ensure_incremental_report_card()
returns trigger language plpgsql security invoker as $$
begin
 if new.status='approved' and old.status is distinct from 'approved' then
   insert into public.report_cards(student_id,term_id,generated_by,finalized) values(new.student_id,new.term_id,auth.uid(),false)
   on conflict(student_id,term_id) do update set generated_at=now();
 end if;
 return new;
end $$;
drop trigger if exists ensure_incremental_report_card on public.evaluations;
create trigger ensure_incremental_report_card after update on public.evaluations for each row execute function public.ensure_incremental_report_card();

-- Rebuild finalized status automatically when the third evaluation is approved.
create or replace function public.finalize_report_card_after_third_approval()
returns trigger language plpgsql security invoker as $$
declare n integer;
begin
 if new.status='approved' and new.evaluation_number=3 and old.status is distinct from 'approved' then
   select count(*) into n from public.evaluations where student_id=new.student_id and term_id=new.term_id and status='approved' and evaluation_number in (1,2,3);
   if n=3 then update public.report_cards set finalized=true,generated_at=now(),generated_by=coalesce(auth.uid(),generated_by) where student_id=new.student_id and term_id=new.term_id; end if;
 end if;
 return new;
end $$;
drop trigger if exists finalize_report_card_after_third_approval on public.evaluations;
create trigger finalize_report_card_after_third_approval after update on public.evaluations for each row execute function public.finalize_report_card_after_third_approval();

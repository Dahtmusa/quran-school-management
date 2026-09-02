-- AMQM academic control: one-time current-term configuration, automatic term progression,
-- five-rubric evaluations, calculated grades/comments, and expiring ID-card metadata.

alter table public.terms add column if not exists is_current boolean not null default false;
create unique index if not exists one_current_term on public.terms(is_current) where is_current=true;

create table if not exists public.academic_cycle_settings(
  id boolean primary key default true check(id=true),
  current_academic_year_id uuid references public.academic_years(id) on delete set null,
  current_term_id uuid references public.terms(id) on delete set null,
  automatic_progression boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
alter table public.academic_cycle_settings enable row level security;
drop policy if exists "admins manage academic cycle settings" on public.academic_cycle_settings;
create policy "admins manage academic cycle settings" on public.academic_cycle_settings for all to authenticated
using(public.my_role() in ('super_admin','admin','principal')) with check(public.my_role() in ('super_admin','admin','principal'));
drop policy if exists "authenticated read academic cycle settings" on public.academic_cycle_settings;
create policy "authenticated read academic cycle settings" on public.academic_cycle_settings for select to authenticated using(true);

create or replace function public.set_current_academic_term(p_term_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.terms; ay public.academic_years;
begin
  if public.my_role() not in ('super_admin','admin','principal') then raise exception 'Administrator access required'; end if;
  select * into t from public.terms where id=p_term_id;
  if t.id is null then raise exception 'Academic term not found'; end if;
  select * into ay from public.academic_years where id=t.academic_year_id;
  update public.terms set is_current=false where is_current;
  update public.terms set is_current=true where id=t.id;
  update public.academic_years set is_current=false where is_current;
  update public.academic_years set is_current=true where id=t.academic_year_id;
  insert into public.academic_cycle_settings(id,current_academic_year_id,current_term_id,updated_by)
  values(true,t.academic_year_id,t.id,auth.uid())
  on conflict(id) do update set current_academic_year_id=excluded.current_academic_year_id,current_term_id=excluded.current_term_id,updated_at=now(),updated_by=auth.uid();
  return jsonb_build_object('term_id',t.id,'term_name',t.name,'academic_year_id',t.academic_year_id,'academic_year_name',ay.name);
end $$;
grant execute on function public.set_current_academic_term(uuid) to authenticated;

create or replace function public.get_current_academic_term()
returns jsonb language sql stable security invoker set search_path=public as $$
select coalesce((select jsonb_build_object('term_id',s.current_term_id,'academic_year_id',s.current_academic_year_id,'automatic_progression',s.automatic_progression,'term',to_jsonb(t),'academic_year',to_jsonb(a)) from public.academic_cycle_settings s left join public.terms t on t.id=s.current_term_id left join public.academic_years a on a.id=s.current_academic_year_id where s.id=true), '{}'::jsonb)
$$;
grant execute on function public.get_current_academic_term() to authenticated;

create or replace function public.advance_current_academic_term()
returns void language plpgsql security definer set search_path=public as $$
declare s public.academic_cycle_settings; cur public.terms; nxt public.terms; ay public.academic_years;
begin
  select * into s from public.academic_cycle_settings where id=true;
  if s.id is null or not s.automatic_progression or s.current_term_id is null then return; end if;
  select * into cur from public.terms where id=s.current_term_id;
  if cur.id is null or current_date <= cur.ends_on then return; end if;
  select t.* into nxt from public.terms t join public.academic_years a on a.id=t.academic_year_id
  where (t.academic_year_id=cur.academic_year_id and t.term_number=cur.term_number+1)
     or (cur.term_number=3 and a.starts_on> (select starts_on from public.academic_years where id=cur.academic_year_id) and t.term_number=1)
  order by a.starts_on,t.term_number limit 1;
  if nxt.id is null or current_date < nxt.starts_on then return; end if;
  update public.terms set is_current=false where is_current;
  update public.terms set is_current=true where id=nxt.id;
  update public.academic_years set is_current=false where is_current;
  update public.academic_years set is_current=true where id=nxt.academic_year_id;
  update public.academic_cycle_settings set current_academic_year_id=nxt.academic_year_id,current_term_id=nxt.id,updated_at=now();
end $$;
grant execute on function public.advance_current_academic_term() to authenticated;

do $$ begin
  begin perform cron.schedule('amqm-academic-term-worker','10 0 * * *','select public.advance_current_academic_term();'); exception when others then raise notice 'academic cron unavailable: %',sqlerrm; end;
end $$;

-- Five professional evaluation rubrics.
alter table public.evaluations
  add column if not exists memorization_score numeric(5,2),
  add column if not exists retention_score numeric(5,2),
  add column if not exists grade text;

create or replace function public.evaluation_grade(p_score numeric) returns text language sql immutable as $$
select case when p_score>=90 then 'Excellent' when p_score>=80 then 'Very Good' when p_score>=70 then 'Good' when p_score>=60 then 'Satisfactory' else 'Needs Improvement' end
$$;
grant execute on function public.evaluation_grade(numeric) to anon,authenticated;

create or replace function public.generate_evaluation_comment(p_mem numeric,p_acc numeric,p_flu numeric,p_taj numeric,p_ret numeric,p_score numeric)
returns text language plpgsql immutable as $$
declare weakest text; avg numeric;
begin
 avg:=coalesce((p_mem+p_acc+p_flu+p_taj+p_ret)/5,0);
 weakest:=case least(p_mem,p_acc,p_flu,p_taj,p_ret) when p_mem then 'memorization consistency' when p_acc then 'accuracy' when p_flu then 'fluency' when p_taj then 'tajweed' else 'retention' end;
 if p_score>=90 then return 'Excellent memorization with confident fluency, accurate recitation, strong tajweed and excellent retention. Keep up the consistent revision.'; end if;
 if p_score>=80 then return 'Very good progress with strong recitation skills and good retention. Continue regular revision to strengthen consistency.'; end if;
 if p_score>=70 then return 'Good progress. Continue daily revision and focus particularly on '||weakest||' before the next evaluation.'; end if;
 if p_score>=60 then return 'Satisfactory progress, with room for improvement. Focus on '||weakest||' and maintain a consistent memorization and revision routine.'; end if;
 return 'Needs improvement before the next evaluation. Increase supervised revision, focusing on '||weakest||' and accurate recall.';
end $$;
grant execute on function public.generate_evaluation_comment(numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;

-- Replace the teacher submit RPC with the five-rubric version.
drop function if exists public.submit_teacher_evaluation(uuid,smallint,smallint,numeric,numeric,numeric,numeric,text);
create or replace function public.submit_teacher_evaluation(
 p_evaluation_id uuid,p_to_surah smallint,p_to_ayah smallint,
 p_memorization numeric,p_accuracy numeric,p_fluency numeric,p_tajweed numeric,p_retention numeric,p_score numeric,p_comment text
) returns void language plpgsql security definer set search_path=public as $$
declare e public.evaluations; c public.evaluation_campaigns; s public.students; calculated numeric;
begin
 if public.my_role()<>'teacher' then raise exception 'Teacher access required'; end if;
 select * into e from public.evaluations where id=p_evaluation_id and teacher_id=auth.uid() for update;
 if e.id is null then raise exception 'Evaluation not found or not assigned to you'; end if;
 if e.status not in ('draft','returned') then raise exception 'This evaluation is no longer editable'; end if;
 select * into c from public.evaluation_campaigns where id=e.campaign_id;
 if e.status='draft' and (c.id is null or now()<c.opens_at or now()>c.closes_at) then raise exception 'This evaluation window is not open'; end if;
 select * into s from public.students where id=e.student_id;
 if s.id is null then raise exception 'Student not found'; end if;
 calculated:=round(((p_memorization+p_accuracy+p_fluency+p_tajweed+p_retention)/25)*100,2);
 if p_score is null or abs(p_score-calculated)>0.01 then p_score:=calculated; end if;
 update public.evaluations set to_surah=p_to_surah,to_ayah=p_to_ayah,
  memorization_score=p_memorization,accuracy_score=p_accuracy,fluency_score=p_fluency,tajweed_score=p_tajweed,retention_score=p_retention,
  score=calculated,grade=public.evaluation_grade(calculated),teacher_comment=coalesce(nullif(trim(p_comment),''),public.generate_evaluation_comment(p_memorization,p_accuracy,p_fluency,p_tajweed,p_retention,calculated)),
  status='pending_approval',submitted_at=now(),teacher_visible=false,auto_submitted=false where id=e.id;
end $$;
grant execute on function public.submit_teacher_evaluation(uuid,smallint,smallint,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

-- Auto-submit should calculate score/grade/comment for unfinished drafts too.
create or replace function public.refresh_evaluation_windows()
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.evaluation_campaigns set status=case when now()<opens_at then 'scheduled' when now()<closes_at then 'open' else 'closed' end,updated_at=now() where status<>'completed';
  update public.evaluations e set teacher_visible=true,teacher_visible_at=coalesce(teacher_visible_at,now()) from public.evaluation_campaigns c where e.campaign_id=c.id and e.status='draft' and now() between c.opens_at and c.closes_at;
  update public.evaluations e set status='pending_approval',submitted_at=coalesce(submitted_at,now()),teacher_visible=false,auto_submitted=true,
    score=round(((coalesce(memorization_score,3)+coalesce(accuracy_score,3)+coalesce(fluency_score,3)+coalesce(tajweed_score,3)+coalesce(retention_score,3))/25)*100,2),
    grade=public.evaluation_grade(round(((coalesce(memorization_score,3)+coalesce(accuracy_score,3)+coalesce(fluency_score,3)+coalesce(tajweed_score,3)+coalesce(retention_score,3))/25)*100,2)),
    teacher_comment=coalesce(teacher_comment,public.generate_evaluation_comment(coalesce(memorization_score,3),coalesce(accuracy_score,3),coalesce(fluency_score,3),coalesce(tajweed_score,3),coalesce(retention_score,3),round(((coalesce(memorization_score,3)+coalesce(accuracy_score,3)+coalesce(fluency_score,3)+coalesce(tajweed_score,3)+coalesce(retention_score,3))/25)*100,2)))
  from public.evaluation_campaigns c where e.campaign_id=c.id and e.status='draft' and now()>=c.closes_at;
  update public.evaluation_campaigns c set status='closed',updated_at=now() where c.status='open' and now()>=c.closes_at;
  perform public.advance_current_academic_term();
end $$;
grant execute on function public.refresh_evaluation_windows() to authenticated;

-- Seed current term setting from an already-current term, if one exists.
do $$ declare t public.terms; begin select * into t from public.terms where is_current=true limit 1; if t.id is not null then insert into public.academic_cycle_settings(id,current_academic_year_id,current_term_id) values(true,t.academic_year_id,t.id) on conflict(id) do update set current_academic_year_id=excluded.current_academic_year_id,current_term_id=excluded.current_term_id; end if; end $$;

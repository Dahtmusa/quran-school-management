-- Historical First Term teacher draft persistence.
-- Production migration: 095_teacher_historical_eval_drafts

create table if not exists public.historical_evaluation_drafts (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (teacher_id, term_id)
);

alter table public.historical_evaluation_drafts enable row level security;

drop policy if exists historical_eval_drafts_teacher_select on public.historical_evaluation_drafts;
create policy historical_eval_drafts_teacher_select
  on public.historical_evaluation_drafts for select
  using (teacher_id = auth.uid());

drop policy if exists historical_eval_drafts_teacher_insert on public.historical_evaluation_drafts;
create policy historical_eval_drafts_teacher_insert
  on public.historical_evaluation_drafts for insert
  with check (teacher_id = auth.uid());

drop policy if exists historical_eval_drafts_teacher_update on public.historical_evaluation_drafts;
create policy historical_eval_drafts_teacher_update
  on public.historical_evaluation_drafts for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists historical_eval_drafts_teacher_delete on public.historical_evaluation_drafts;
create policy historical_eval_drafts_teacher_delete
  on public.historical_evaluation_drafts for delete
  using (teacher_id = auth.uid());

create or replace function public.teacher_load_historical_eval_draft(p_term_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'teacher' and p.employment_status::text = 'active'
  ) then
    raise exception 'Only active teachers can load historical evaluation drafts';
  end if;

  select d.draft into v_draft
  from public.historical_evaluation_drafts d
  where d.teacher_id = auth.uid() and d.term_id = p_term_id;

  return coalesce(v_draft, '{}'::jsonb);
end;
$$;

create or replace function public.teacher_save_historical_eval_draft(p_term_id uuid, p_draft jsonb)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'teacher' and p.employment_status::text = 'active'
  ) then
    raise exception 'Only active teachers can save historical evaluation drafts';
  end if;

  insert into public.historical_evaluation_drafts (teacher_id, term_id, draft, updated_at)
  values (auth.uid(), p_term_id, coalesce(p_draft, '{}'::jsonb), v_now)
  on conflict (teacher_id, term_id)
  do update set draft = excluded.draft, updated_at = v_now;

  return v_now;
end;
$$;

grant execute on function public.teacher_load_historical_eval_draft(uuid) to authenticated;
grant execute on function public.teacher_save_historical_eval_draft(uuid, jsonb) to authenticated;

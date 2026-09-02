-- V8: configurable academic structures, immutable historical structure snapshots,
-- monthly Quran targets, exact evaluation deltas, and corrected graduation logic.

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.program_structure_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  version_name text not null,
  effective_from date not null,
  effective_to date,
  is_current boolean not null default false,
  graduation_requires_quran_completion boolean not null default true,
  created_at timestamptz not null default now(),
  unique(program_id, version_name),
  check(effective_to is null or effective_to >= effective_from)
);

create table if not exists public.program_year_definitions (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.program_structure_versions(id) on delete cascade,
  year_number smallint not null check(year_number > 0),
  name text not null,
  display_order smallint not null,
  unique(structure_id, year_number),
  unique(structure_id, display_order)
);

create table if not exists public.program_term_definitions (
  id uuid primary key default gen_random_uuid(),
  year_definition_id uuid not null references public.program_year_definitions(id) on delete cascade,
  term_number smallint not null check(term_number > 0),
  name text not null,
  display_order smallint not null,
  starts_month smallint check(starts_month between 1 and 12),
  ends_month smallint check(ends_month between 1 and 12),
  evaluation_count smallint not null default 3 check(evaluation_count > 0),
  unique(year_definition_id, term_number),
  unique(year_definition_id, display_order)
);

-- A student is enrolled against a structure version so later CMS/admin changes cannot rewrite history.
alter table public.academic_years
  add column if not exists structure_id uuid references public.program_structure_versions(id);

alter table public.students
  add column if not exists program_id uuid references public.programs(id),
  add column if not exists structure_id uuid references public.program_structure_versions(id),
  add column if not exists current_year_definition_id uuid references public.program_year_definitions(id),
  add column if not exists monthly_quran_target_pages smallint not null default 30 check(monthly_quran_target_pages > 0);

create table if not exists public.student_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  structure_id uuid not null references public.program_structure_versions(id) on delete restrict,
  year_definition_id uuid not null references public.program_year_definitions(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(student_id, academic_year_id)
);

create table if not exists public.student_monthly_quran_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month_start date not null,
  target_pages smallint not null default 30 check(target_pages > 0),
  completed_pages integer not null default 0 check(completed_pages >= 0),
  completed_ayahs integer not null default 0 check(completed_ayahs >= 0),
  completed_hizbs numeric(8,2) not null default 0 check(completed_hizbs >= 0),
  updated_at timestamptz not null default now(),
  unique(student_id, month_start)
);

alter table public.programs enable row level security;
alter table public.program_structure_versions enable row level security;
alter table public.program_year_definitions enable row level security;
alter table public.program_term_definitions enable row level security;
alter table public.student_program_enrollments enable row level security;
alter table public.student_monthly_quran_progress enable row level security;

create policy "public can read active programs" on public.programs
  for select to anon, authenticated using (active=true or public.my_role() in ('super_admin','admin','principal'));
create policy "public can read current structures" on public.program_structure_versions
  for select to anon, authenticated using (is_current=true or public.my_role() in ('super_admin','admin','principal'));
create policy "public can read structure years" on public.program_year_definitions
  for select to anon, authenticated using (true);
create policy "public can read structure terms" on public.program_term_definitions
  for select to anon, authenticated using (true);
create policy "admins manage programs" on public.programs
  for all to authenticated using (public.my_role() in ('super_admin','admin')) with check (public.my_role() in ('super_admin','admin'));
create policy "admins manage structures" on public.program_structure_versions
  for all to authenticated using (public.my_role() in ('super_admin','admin')) with check (public.my_role() in ('super_admin','admin'));
create policy "admins manage structure years" on public.program_year_definitions
  for all to authenticated using (public.my_role() in ('super_admin','admin')) with check (public.my_role() in ('super_admin','admin'));
create policy "admins manage structure terms" on public.program_term_definitions
  for all to authenticated using (public.my_role() in ('super_admin','admin')) with check (public.my_role() in ('super_admin','admin'));
create policy "authorized users read enrollments" on public.student_program_enrollments
  for select to authenticated using (
    public.my_role() in ('super_admin','admin','principal','admissions')
    or exists(select 1 from public.parent_students ps where ps.student_id=student_program_enrollments.student_id and ps.parent_id=auth.uid())
    or exists(select 1 from public.teacher_students ts where ts.student_id=student_program_enrollments.student_id and ts.teacher_id=auth.uid())
  );
create policy "admins manage enrollments" on public.student_program_enrollments
  for all to authenticated using (public.my_role() in ('super_admin','admin','principal','admissions')) with check (public.my_role() in ('super_admin','admin','principal','admissions'));
create policy "authorized users read monthly quran progress" on public.student_monthly_quran_progress
  for select to authenticated using (
    public.my_role() in ('super_admin','admin','principal')
    or exists(select 1 from public.parent_students ps where ps.student_id=student_monthly_quran_progress.student_id and ps.parent_id=auth.uid())
    or exists(select 1 from public.teacher_students ts where ts.student_id=student_monthly_quran_progress.student_id and ts.teacher_id=auth.uid())
  );
create policy "admins manage monthly quran progress" on public.student_monthly_quran_progress
  for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

grant select on public.programs, public.program_structure_versions, public.program_year_definitions, public.program_term_definitions to anon, authenticated;
grant select on public.student_program_enrollments, public.student_monthly_quran_progress to authenticated;
grant insert, update, delete on public.programs, public.program_structure_versions, public.program_year_definitions, public.program_term_definitions to authenticated;

-- The current school configuration: 2 years, 3 terms per year, 6 terms total, 3 evaluations per term.
insert into public.programs(name, description) values
('Quran Memorization Programme','Two-year Quran memorization programme with configurable academic structures.')
on conflict(name) do nothing;

insert into public.program_structure_versions(program_id, version_name, effective_from, is_current, graduation_requires_quran_completion)
select p.id, '2026-2027 • 2 Years • 6 Terms', current_date, true, true
from public.programs p where p.name='Quran Memorization Programme'
on conflict(program_id, version_name) do nothing;

insert into public.program_year_definitions(structure_id, year_number, name, display_order)
select s.id, y.year_number, 'Year '||y.year_number::text, y.year_number
from public.program_structure_versions s
cross join (values (1),(2)) as y(year_number)
where s.version_name='2026-2027 • 2 Years • 6 Terms'
on conflict(structure_id, year_number) do nothing;

insert into public.program_term_definitions(year_definition_id, term_number, name, display_order, evaluation_count)
select y.id, t.term_number, 'Term '||t.term_number::text, t.term_number, 3
from public.program_year_definitions y
cross join (values (1),(2),(3)) as t(term_number)
join public.program_structure_versions s on s.id=y.structure_id
where s.version_name='2026-2027 • 2 Years • 6 Terms'
on conflict(year_definition_id, term_number) do nothing;

-- Exact evaluation delta: the student's current position is already memorized,
-- so the new memorized range excludes the starting ayah/page/hizb from the delta.
create or replace function public.validate_evaluation_position()
returns trigger language plpgsql security invoker as $$
declare
  direction public.memorization_direction;
  current_s smallint;
  current_a smallint;
  from_global integer;
  to_global integer;
  from_meta record;
  to_meta record;
begin
  select memorization_direction,current_surah,current_ayah
    into direction,current_s,current_a
    from public.students where id=new.student_id for update;

  select * into from_meta from public.quran_verses where surah=new.from_surah and ayah=new.from_ayah;
  select * into to_meta from public.quran_verses where surah=new.to_surah and ayah=new.to_ayah;
  if from_meta.global_ayah is null or to_meta.global_ayah is null then
    raise exception 'Quran metadata is missing for the evaluation positions.';
  end if;

  from_global := from_meta.global_ayah;
  to_global := to_meta.global_ayah;

  if current_s is null or current_a is null then
    raise exception 'Student must have an official current Quran position before evaluation.';
  end if;
  if new.from_surah is distinct from current_s or new.from_ayah is distinct from current_a then
    raise exception 'Evaluation must start from the student current official memorization position.';
  end if;
  if direction='baqarah_to_nas' and to_global <= from_global then
    raise exception 'Evaluation stopping position must move forward for Baqarah-to-Nas.';
  end if;
  if direction='nas_to_baqarah' and to_global >= from_global then
    raise exception 'Evaluation stopping position must move backward for Nas-to-Baqarah.';
  end if;

  new.from_page := from_meta.page;
  new.to_page := to_meta.page;
  new.memorized_ayahs := abs(to_global-from_global);
  new.memorized_pages := abs(to_meta.page-from_meta.page);
  new.memorized_hizbs := abs(to_meta.hizb-from_meta.hizb);
  return new;
end;
$$;

-- Fix graduation for both supported directions and require the final evaluation to be
-- the approved evaluation for Year 2 Term 3. The final position must be the endpoint
-- of the student's configured path.
create or replace function public.finalize_year2_graduation()
returns trigger
language plpgsql
security invoker
as $$
declare
  approved_count integer;
  final_term_number smallint;
  s record;
  final_eval record;
  alumni_id uuid;
  certificate_no text;
  direction public.memorization_direction;
  final_global integer;
  final_required integer;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select t.term_number into final_term_number from public.terms t where t.id = new.term_id;
    select * into s from public.students where id = new.student_id for update;
    if final_term_number = 3 and s.program_year = 'year_2' then
      select count(*) into approved_count
      from public.evaluations e
      where e.student_id=new.student_id and e.term_id=new.term_id and e.status='approved' and e.evaluation_number in (1,2,3);

      if approved_count=3 then
        select * into final_eval from public.evaluations e
        where e.student_id=new.student_id and e.term_id=new.term_id and e.evaluation_number=3 and e.status='approved';
        select memorization_direction into direction from public.students where id=new.student_id;
        select global_ayah into final_global from public.quran_verses where surah=final_eval.to_surah and ayah=final_eval.to_ayah;
        final_required := case when direction='baqarah_to_nas' then 6236 else 1 end;

        if final_global=final_required then
          update public.students set status='graduated' where id=new.student_id;
          insert into public.alumni_profiles(
            student_id,full_name,graduation_year,cohort_name,graduation_term,final_quran_position,
            completion_percentage,profile_photo_url,brief_bio,published,published_on_homepage
          ) values(
            s.id,s.full_name,extract(year from current_date)::int,'Cohort '||extract(year from current_date)::int,
            'Term 3',final_eval.to_surah::text||':'||final_eval.to_ayah::text,100,s.photo_url,
            'Graduate of the Two-Year Quran Memorization Programme.',false,false
          )
          on conflict (student_id) do update set
            full_name=excluded.full_name,final_quran_position=excluded.final_quran_position,
            completion_percentage=excluded.completion_percentage,updated_at=now()
          returning id into alumni_id;

          certificate_no := 'ALH-'||extract(year from current_date)::int||'-'||upper(substr(replace(s.admission_no,'-',''),1,8));
          insert into public.graduation_certificates(
            alumni_id,certificate_number,issued_at,recipient_name,programme_name,cohort_name,final_term,status
          ) values(
            alumni_id,certificate_no,current_date,s.full_name,'Two-Year Quran Memorization Programme',
            'Cohort '||extract(year from current_date)::int,'Term 3','issued'
          ) on conflict(certificate_number) do nothing;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Monthly progress is derived only from approved evaluations. This trigger increments the
-- month containing the approval date and cannot be triggered by pending/returned records.
create or replace function public.apply_approved_monthly_quran_progress()
returns trigger language plpgsql security invoker as $$
declare
  month_key date;
  target smallint;
begin
  if new.status='approved' and old.status is distinct from 'approved' then
    month_key := date_trunc('month', coalesce(new.approved_at, now()))::date;
    select monthly_quran_target_pages into target from public.students where id=new.student_id;
    insert into public.student_monthly_quran_progress(student_id,month_start,target_pages,completed_pages,completed_ayahs,completed_hizbs)
    values(new.student_id,month_key,coalesce(target,30),new.memorized_pages,new.memorized_ayahs,new.memorized_hizbs)
    on conflict(student_id,month_start) do update set
      completed_pages=public.student_monthly_quran_progress.completed_pages+excluded.completed_pages,
      completed_ayahs=public.student_monthly_quran_progress.completed_ayahs+excluded.completed_ayahs,
      completed_hizbs=public.student_monthly_quran_progress.completed_hizbs+excluded.completed_hizbs,
      target_pages=excluded.target_pages,
      updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists apply_approved_monthly_quran_progress on public.evaluations;
create trigger apply_approved_monthly_quran_progress
after update on public.evaluations for each row execute function public.apply_approved_monthly_quran_progress();

-- Admin can change the target, but historical monthly records keep the target that was active
-- when that month began.
create or replace function public.set_student_monthly_quran_target(p_student_id uuid, p_target_pages smallint)
returns void language plpgsql security invoker as $$
begin
  if public.my_role() not in ('super_admin','admin') then raise exception 'Not authorised'; end if;
  if p_target_pages <= 0 then raise exception 'Target must be greater than zero'; end if;
  update public.students set monthly_quran_target_pages=p_target_pages where id=p_student_id;
end;
$$;
grant execute on function public.set_student_monthly_quran_target(uuid,smallint) to authenticated;

-- Audit structure changes.
create or replace function public.audit_structure_change()
returns trigger language plpgsql security invoker as $$
begin
  if public.my_role() in ('super_admin','admin') then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
    values(auth.uid(),tg_op, TG_TABLE_NAME, coalesce(new.id,old.id), to_jsonb(old), to_jsonb(new));
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists audit_program_structure_versions on public.program_structure_versions;
create trigger audit_program_structure_versions after insert or update or delete on public.program_structure_versions
for each row execute function public.audit_structure_change();

drop trigger if exists audit_program_year_definitions on public.program_year_definitions;
create trigger audit_program_year_definitions after insert or update or delete on public.program_year_definitions
for each row execute function public.audit_structure_change();

drop trigger if exists audit_program_term_definitions on public.program_term_definitions;
create trigger audit_program_term_definitions after insert or update or delete on public.program_term_definitions
for each row execute function public.audit_structure_change();

-- Bind concrete academic terms to the versioned programme structure. The legacy term_number
-- remains for compatibility, but future structures may contain any positive number of terms.
alter table public.terms
  drop constraint if exists terms_term_number_check;
alter table public.terms
  add column if not exists term_definition_id uuid references public.program_term_definitions(id);
alter table public.terms
  add constraint terms_term_number_positive check(term_number > 0);
create unique index if not exists terms_academic_year_term_definition_idx
  on public.terms(academic_year_id, term_definition_id)
  where term_definition_id is not null;

alter table public.evaluations
  add column if not exists term_definition_id uuid references public.program_term_definitions(id);
alter table public.report_cards
  add column if not exists term_definition_id uuid references public.program_term_definitions(id);

-- Populate the current 2x3 structure against existing terms where possible.
update public.terms t
set term_definition_id = yterm.id
from public.academic_years ay
join public.program_structure_versions ps on ps.id=ay.structure_id
join public.program_year_definitions yd on yd.structure_id=ps.id
join public.program_term_definitions yterm on yterm.year_definition_id=yd.id and yterm.term_number=t.term_number
where t.academic_year_id=ay.id and t.term_definition_id is null;

update public.evaluations e
set term_definition_id=t.term_definition_id
from public.terms t
where t.id=e.term_id and e.term_definition_id is null;

update public.report_cards r
set term_definition_id=t.term_definition_id
from public.terms t
where t.id=r.term_id and r.term_definition_id is null;

-- Final graduation must identify Year 2 / final term from the versioned structure when available.
create or replace function public.finalize_year2_graduation()
returns trigger
language plpgsql
security invoker
as $$
declare
  approved_count integer;
  final_term boolean := false;
  s record;
  final_eval record;
  alumni_id uuid;
  certificate_no text;
  direction public.memorization_direction;
  final_global integer;
  final_required integer;
  year_no smallint;
  term_no smallint;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into s from public.students where id = new.student_id for update;
    select y.year_number, td.term_number into year_no, term_no
    from public.program_term_definitions td
    join public.program_year_definitions y on y.id=td.year_definition_id
    where td.id=coalesce(new.term_definition_id, (select t.term_definition_id from public.terms t where t.id=new.term_id));

    if year_no=2 and term_no=(select max(td2.term_number)
                              from public.program_term_definitions td2
                              join public.program_year_definitions y2 on y2.id=td2.year_definition_id
                              where y2.structure_id=coalesce(s.structure_id, y2.structure_id)
                                and y2.year_number=2) then
      final_term := true;
    elsif new.term_definition_id is null and s.program_year='year_2' and new.term_id is not null then
      select t.term_number=3 into final_term from public.terms t where t.id=new.term_id;
    end if;

    if final_term then
      select count(*) into approved_count
      from public.evaluations e
      where e.student_id=new.student_id
        and (e.term_definition_id=new.term_definition_id or (new.term_definition_id is null and e.term_id=new.term_id))
        and e.status='approved'
        and e.evaluation_number in (1,2,3);

      if approved_count=3 then
        select * into final_eval from public.evaluations e
        where e.student_id=new.student_id
          and (e.term_definition_id=new.term_definition_id or (new.term_definition_id is null and e.term_id=new.term_id))
          and e.evaluation_number=3 and e.status='approved';
        select memorization_direction into direction from public.students where id=new.student_id;
        select global_ayah into final_global from public.quran_verses where surah=final_eval.to_surah and ayah=final_eval.to_ayah;
        final_required := case when direction='baqarah_to_nas' then 6236 else 1 end;

        if final_global=final_required then
          update public.students set status='graduated' where id=new.student_id;
          insert into public.alumni_profiles(
            student_id,full_name,graduation_year,cohort_name,graduation_term,final_quran_position,
            completion_percentage,profile_photo_url,brief_bio,published,published_on_homepage
          ) values(
            s.id,s.full_name,extract(year from current_date)::int,'Cohort '||extract(year from current_date)::int,
            'Final Term',final_eval.to_surah::text||':'||final_eval.to_ayah::text,100,s.photo_url,
            'Graduate of the Quran Memorization Programme.',false,false
          )
          on conflict (student_id) do update set
            full_name=excluded.full_name,final_quran_position=excluded.final_quran_position,
            completion_percentage=excluded.completion_percentage,updated_at=now()
          returning id into alumni_id;

          certificate_no := 'ALH-'||extract(year from current_date)::int||'-'||upper(substr(replace(s.admission_no,'-',''),1,8));
          insert into public.graduation_certificates(
            alumni_id,certificate_number,issued_at,recipient_name,programme_name,cohort_name,final_term,status
          ) values(
            alumni_id,certificate_no,current_date,s.full_name,'Quran Memorization Programme',
            'Cohort '||extract(year from current_date)::int,'Final Term','issued'
          ) on conflict(certificate_number) do nothing;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

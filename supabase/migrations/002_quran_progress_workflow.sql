-- Quran progress and approval workflow hardening
create type public.memorization_direction as enum ('nas_to_baqarah','baqarah_to_nas');

alter table public.students
  add column if not exists memorization_direction public.memorization_direction not null default 'baqarah_to_nas',
  add column if not exists start_surah smallint,
  add column if not exists start_ayah smallint,
  add column if not exists start_hizb smallint,
  add column if not exists current_surah smallint,
  add column if not exists current_ayah smallint,
  add column if not exists current_hizb smallint,
  add column if not exists current_page smallint;

create table if not exists public.quran_verses (
  surah smallint not null,
  ayah smallint not null,
  global_ayah integer not null unique,
  page smallint not null check(page between 1 and 604),
  juz smallint check(juz between 1 and 30),
  hizb smallint check(hizb between 1 and 60),
  primary key(surah,ayah)
);
alter table public.quran_verses enable row level security;
create policy "quran metadata readable" on public.quran_verses for select to anon,authenticated using (true);

alter table public.evaluations
  add column if not exists from_surah smallint,
  add column if not exists from_ayah smallint,
  add column if not exists to_surah smallint,
  add column if not exists to_ayah smallint,
  add column if not exists from_page smallint,
  add column if not exists to_page smallint,
  add column if not exists memorized_ayahs integer not null default 0,
  add column if not exists memorized_pages integer not null default 0,
  add column if not exists memorized_hizbs integer not null default 0;

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  generated_by uuid references public.profiles(id),
  finalized boolean not null default false,
  generated_at timestamptz not null default now(),
  unique(student_id,term_id)
);
alter table public.report_cards enable row level security;

create or replace function public.validate_report_card_approvals()
returns trigger language plpgsql security invoker as $$
declare approved_count integer;
begin
  select count(*) into approved_count from public.evaluations
  where student_id=new.student_id and term_id=new.term_id and status='approved' and evaluation_number in (1,2,3);
  if approved_count <> 3 then
    raise exception 'Report card cannot be generated: all three evaluations must be approved first.';
  end if;
  return new;
end;
$$;

drop trigger if exists report_card_approval_guard on public.report_cards;
create trigger report_card_approval_guard before insert or update on public.report_cards
for each row execute function public.validate_report_card_approvals();

create or replace function public.apply_approved_quran_evaluation()
returns trigger language plpgsql security invoker as $$
declare target_hizb smallint;
begin
  if new.status='approved' and (old.status is distinct from 'approved') then
    select q.hizb into target_hizb
    from public.quran_verses q
    where q.surah=new.to_surah and q.ayah=new.to_ayah
    limit 1;
    if target_hizb is null then
      raise exception 'Quran metadata is not seeded for the approved stopping position. Run npm run prepare:quran and load supabase/seed.sql before approving evaluations.';
    end if;
    update public.students
      set current_surah=new.to_surah,
          current_ayah=new.to_ayah,
          current_page=new.to_page,
          current_hizb=target_hizb
    where id=new.student_id;
    new.approved_at=coalesce(new.approved_at,now());
    new.approved_by=coalesce(new.approved_by,auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists approved_evaluation_updates_progress on public.evaluations;
drop trigger if exists z_apply_approved_quran_evaluation on public.evaluations;
create trigger z_apply_approved_quran_evaluation before update on public.evaluations
for each row execute function public.apply_approved_quran_evaluation();

-- Teachers may never alter an approved evaluation. Admins can return it to the teacher.
create or replace function public.prevent_approved_evaluation_edit()
returns trigger language plpgsql security invoker as $$
begin
  if old.status='approved' and new.status='approved' and public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Approved evaluations are locked.';
  end if;
  return new;
end;
$$;
drop trigger if exists approved_evaluation_lock on public.evaluations;
create trigger approved_evaluation_lock before update on public.evaluations
for each row execute function public.prevent_approved_evaluation_edit();

create policy "approved reports visible to parents and staff" on public.report_cards for select to authenticated using (
  public.my_role() in ('super_admin','admin','principal','finance')
  or exists(select 1 from public.parent_students ps where ps.student_id=report_cards.student_id and ps.parent_id=auth.uid())
  or exists(select 1 from public.teacher_students ts where ts.student_id=report_cards.student_id and ts.teacher_id=auth.uid())
);
create policy "admins create reports" on public.report_cards for all to authenticated using (public.my_role() in ('super_admin','admin','principal')) with check (public.my_role() in ('super_admin','admin','principal'));

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
    from public.students where id=new.student_id;

  select * into from_meta from public.quran_verses where surah=new.from_surah and ayah=new.from_ayah;
  select * into to_meta from public.quran_verses where surah=new.to_surah and ayah=new.to_ayah;
  if from_meta.global_ayah is null or to_meta.global_ayah is null then
    raise exception 'Quran metadata is missing for the evaluation positions. Seed quran_verses before submitting evaluations.';
  end if;

  from_global := from_meta.global_ayah;
  to_global := to_meta.global_ayah;

  if current_s is not null and (new.from_surah is distinct from current_s or new.from_ayah is distinct from current_a) then
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
  new.memorized_ayahs := abs(to_global-from_global)+1;
  new.memorized_pages := abs(to_meta.page-from_meta.page)+1;
  new.memorized_hizbs := abs(to_meta.hizb-from_meta.hizb)+1;
  return new;
end;
$$;
drop trigger if exists evaluation_position_guard on public.evaluations;
create trigger evaluation_position_guard before insert or update on public.evaluations
for each row execute function public.validate_evaluation_position();

-- When an administrator creates a student with a starting position, initialize the official stage
-- from the same verified Quran metadata used by evaluations.
create or replace function public.initialize_student_quran_position()
returns trigger language plpgsql security invoker as $$
declare q record;
begin
  if new.start_surah is not null and new.start_ayah is not null and new.current_surah is null then
    select * into q from public.quran_verses where surah=new.start_surah and ayah=new.start_ayah;
    if q.global_ayah is null then
      raise exception 'Quran metadata is not seeded for the student starting position.';
    end if;
    new.start_hizb := q.hizb;
    new.current_surah := new.start_surah;
    new.current_ayah := new.start_ayah;
    new.current_hizb := q.hizb;
    new.current_page := q.page;
  end if;
  return new;
end;
$$;

drop trigger if exists initialize_student_quran_position on public.students;
create trigger initialize_student_quran_position
before insert or update on public.students
for each row execute function public.initialize_student_quran_position();

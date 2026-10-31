-- The validate_evaluation_position trigger was raising
--   "Evaluation must start from the student current official
--    memorization position"
-- on every UPDATE of a draft row, even when the UPDATE only touched
-- housekeeping columns like teacher_visible or teacher_visible_at.
--
-- The position validation only makes sense on INSERT (first time the
-- row exists) and on UPDATE when the from_surah/from_ayah columns are
-- actually being changed. Otherwise visibility sync and other
-- bookkeeping queries get stuck.
--
-- Rewriting the function to short-circuit the position check when
-- from_surah/from_ayah are not being modified during an UPDATE.

create or replace function public.validate_evaluation_position()
returns trigger
language plpgsql
security invoker
as $$
declare
  direction text;
  current_s smallint;
  current_a smallint;
  from_global integer;
  to_global   integer;
  from_meta   record;
  to_meta     record;
begin
  -- On UPDATE, skip the starting-position check entirely when the
  -- from_* columns are unchanged. Only the stopping position and
  -- derived numbers are being touched then.
  if TG_OP = 'UPDATE'
     and NEW.from_surah is not distinct from OLD.from_surah
     and NEW.from_ayah  is not distinct from OLD.from_ayah
  then
    -- Fall through to the stopping-position check only. No starting
    -- position check needed; it was validated at insert time.
    null;
  else
    -- Validate starting position against the student's live record.
    select memorization_direction, current_surah, current_ayah
      into direction, current_s, current_a
      from public.students where id = NEW.student_id for update;

    select * into from_meta
      from public.quran_verses
     where surah = NEW.from_surah and ayah = NEW.from_ayah;

    if from_meta.global_ayah is null then
      raise exception 'Quran metadata is missing for the starting position. Seed quran_verses before creating evaluations.';
    end if;

    if current_s is null or current_a is null then
      raise exception 'Student must have an official current Quran position before evaluation.';
    end if;

    if NEW.from_surah is distinct from current_s or NEW.from_ayah is distinct from current_a then
      raise exception 'Evaluation must start from the student current official memorization position.';
    end if;

    from_global := from_meta.global_ayah;
  end if;

  -- Stopping-position check only when the teacher has actually
  -- entered a stopping position.
  if NEW.to_surah is not null and NEW.to_ayah is not null then
    select * into to_meta
      from public.quran_verses
     where surah = NEW.to_surah and ayah = NEW.to_ayah;

    if to_meta.global_ayah is null then
      raise exception 'Quran metadata is missing for the stopping position.';
    end if;

    -- Need the starting ordinal and direction even on an update-only
    -- path, so look them up when we skipped the from check above.
    if direction is null then
      select memorization_direction into direction
        from public.students where id = NEW.student_id;
    end if;
    if from_global is null then
      select global_ayah into from_global
        from public.quran_verses where surah = NEW.from_surah and ayah = NEW.from_ayah;
    end if;

    to_global := to_meta.global_ayah;

    if direction = 'baqarah_to_nas' and to_global <= from_global then
      raise exception 'Evaluation stopping position must move forward for Baqarah-to-Nas.';
    end if;
    if direction = 'nas_to_baqarah' and to_global >= from_global then
      raise exception 'Evaluation stopping position must move backward for Nas-to-Baqarah.';
    end if;

    -- Derived numbers for the record.
    if from_meta is null then
      select * into from_meta
        from public.quran_verses where surah = NEW.from_surah and ayah = NEW.from_ayah;
    end if;
    NEW.from_page       := from_meta.page;
    NEW.to_page         := to_meta.page;
    NEW.memorized_ayahs := abs(to_global - from_global);
    NEW.memorized_pages := abs(to_meta.page - from_meta.page);
    NEW.memorized_hizbs := abs(to_meta.hizb - from_meta.hizb);
  end if;

  return NEW;
end;
$$;

notify pgrst, 'reload schema';

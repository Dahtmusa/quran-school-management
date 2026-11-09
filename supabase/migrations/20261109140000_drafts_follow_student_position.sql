-- Open evaluation drafts must always start from the student's official
-- current position.
--
-- A draft copies the student's position once, when the evaluation window
-- opens. If the position is later corrected some other way (Edit profile,
-- rollback/restore tools, etc.), the draft kept the old start. Example:
-- Muhammad Buhari Hayatu's profile was corrected to 8:75 (Nas-to-Baqarah)
-- but his Evaluation 1 draft still started at 40:23, so his teacher was
-- evaluating from the wrong place.
--
-- Now any change to a student's current position moves their open drafts with
-- it, and a one-time repair realigns every draft that is out of step.

create or replace function public.amqm_drafts_follow_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_surah is not null and new.current_ayah is not null
     and (new.current_surah is distinct from old.current_surah or new.current_ayah is distinct from old.current_ayah) then
    -- Any stop typed against the old start is meaningless now, so clear it.
    update public.evaluations
       set from_surah = new.current_surah, from_ayah = new.current_ayah,
           to_surah = null, to_ayah = null
     where student_id = new.id
       and status = 'draft'
       and (from_surah is distinct from new.current_surah or from_ayah is distinct from new.current_ayah);
  end if;
  return new;
end;
$$;

drop trigger if exists amqm_drafts_follow_position on public.students;
create trigger amqm_drafts_follow_position
after update of current_surah, current_ayah on public.students
for each row execute function public.amqm_drafts_follow_position();

-- This trigger now covers approvals too (approval moves the student's
-- position), so the narrower approval-only trigger is no longer needed.
drop trigger if exists amqm_sync_drafts_after_approval on public.evaluations;

-- One-time repair: realign every open draft with its student's position.
update public.evaluations e
   set from_surah = s.current_surah, from_ayah = s.current_ayah,
       to_surah = null, to_ayah = null
  from public.students s
 where e.student_id = s.id
   and e.status = 'draft'
   and s.current_surah is not null and s.current_ayah is not null
   and (e.from_surah is distinct from s.current_surah or e.from_ayah is distinct from s.current_ayah);

notify pgrst, 'reload schema';

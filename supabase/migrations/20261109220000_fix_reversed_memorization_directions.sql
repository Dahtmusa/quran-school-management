-- Fix students whose memorization direction is recorded the wrong way round.
--
-- The health check found 15 active students whose current position is on the
-- wrong side of their starting position for their recorded direction, e.g.
-- recorded Nas-to-Baqarah with start 33:16, now 34:48 and evaluations moving
-- 23:85 -> 39:75 (forward = Baqarah-to-Nas). For every one of them, flipping
-- the direction makes start, current position and evaluations consistent.
-- Until fixed, their teacher cannot enter a correct evaluation: real progress
-- looks like "going backwards" and is rejected.
--
-- Only the direction changes; start and current position are kept as
-- recorded. A student is changed only if they fail the check now AND pass it
-- once flipped. Each change is written to the audit log.

do $$
declare r record; n int := 0;
begin
  for r in
    select s.id, s.full_name, s.admission_no, s.memorization_direction as old_dir,
           case s.memorization_direction when 'nas_to_baqarah' then 'baqarah_to_nas'::public.memorization_direction
                                         else 'nas_to_baqarah'::public.memorization_direction end as new_dir,
           s.start_surah, s.start_ayah, s.current_surah, s.current_ayah
      from public.students s
      join public.quran_verses qs on qs.surah = s.start_surah and qs.ayah = s.start_ayah
      join public.quran_verses qc on qc.surah = s.current_surah and qc.ayah = s.current_ayah
     where s.status = 'active'
       and ((s.memorization_direction = 'baqarah_to_nas' and qc.global_ayah < qs.global_ayah)
         or (s.memorization_direction = 'nas_to_baqarah' and qc.global_ayah > qs.global_ayah))
  loop
    update public.students set memorization_direction = r.new_dir where id = r.id;
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
    values (auth.uid(), 'quran_record:direction_corrected', 'students', r.id,
            jsonb_build_object('direction', r.old_dir),
            jsonb_build_object('direction', r.new_dir,
                               'reason', 'Direction was reversed: start ' || r.start_surah || ':' || r.start_ayah
                                         || ', current ' || r.current_surah || ':' || r.current_ayah));
    n := n + 1;
  end loop;
  raise notice 'Direction corrected for % student(s)', n;
end $$;

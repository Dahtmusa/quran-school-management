-- Security-definer function for bulk importing historical evaluations.
-- Bypasses RLS so admin/principal can insert evaluation records directly.
-- The function validates the caller's role before proceeding.
create or replace function public.bulk_import_historical_evals(
  p_term_id uuid,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_entry       jsonb;
  v_now         timestamptz := now();
  v_imported    int := 0;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'super_admin', 'principal') then
    raise exception 'Permission denied: only admin or principal can import historical evaluations';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    -- Move student's current position to Eval 2 end
    update public.students
      set current_surah = (v_entry->>'eval2Surah')::int,
          current_ayah  = (v_entry->>'eval2Ayah')::int
      where id = (v_entry->>'studentId')::uuid;

    -- Upsert Eval 1
    insert into public.evaluations (
      student_id, teacher_id, term_id, evaluation_number, status,
      from_surah, from_ayah, to_surah, to_ayah,
      memorized_ayahs, memorized_pages, memorized_hizbs,
      score, accuracy_score, fluency_score, tajweed_score, retention_score,
      grade, teacher_comment, submitted_at, approved_at
    ) values (
      (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 1, 'approved',
      (v_entry->>'startSurah')::int,  (v_entry->>'startAyah')::int,
      (v_entry->>'eval1Surah')::int,  (v_entry->>'eval1Ayah')::int,
      (v_entry->'eval1'->>'ayahs')::int,
      (v_entry->'eval1'->>'pages')::numeric,
      (v_entry->'eval1'->>'hizbs')::numeric,
      (v_entry->'eval1'->>'score')::int,
      (v_entry->'eval1'->>'rubric')::int,
      (v_entry->'eval1'->>'rubric')::int,
      (v_entry->'eval1'->>'rubric')::int,
      (v_entry->'eval1'->>'rubric')::int,
      v_entry->'eval1'->>'grade',
      'Imported from historical records.', v_now, v_now
    )
    on conflict (student_id, term_id, evaluation_number) do update set
      from_surah      = excluded.from_surah,
      from_ayah       = excluded.from_ayah,
      to_surah        = excluded.to_surah,
      to_ayah         = excluded.to_ayah,
      memorized_ayahs = excluded.memorized_ayahs,
      memorized_pages = excluded.memorized_pages,
      memorized_hizbs = excluded.memorized_hizbs,
      score           = excluded.score,
      accuracy_score  = excluded.accuracy_score,
      fluency_score   = excluded.fluency_score,
      tajweed_score   = excluded.tajweed_score,
      retention_score = excluded.retention_score,
      grade           = excluded.grade,
      approved_at     = excluded.approved_at;

    -- Upsert Eval 2
    insert into public.evaluations (
      student_id, teacher_id, term_id, evaluation_number, status,
      from_surah, from_ayah, to_surah, to_ayah,
      memorized_ayahs, memorized_pages, memorized_hizbs,
      score, accuracy_score, fluency_score, tajweed_score, retention_score,
      grade, teacher_comment, submitted_at, approved_at
    ) values (
      (v_entry->>'studentId')::uuid, auth.uid(), p_term_id, 2, 'approved',
      (v_entry->>'eval1Surah')::int,  (v_entry->>'eval1Ayah')::int,
      (v_entry->>'eval2Surah')::int,  (v_entry->>'eval2Ayah')::int,
      (v_entry->'eval2'->>'ayahs')::int,
      (v_entry->'eval2'->>'pages')::numeric,
      (v_entry->'eval2'->>'hizbs')::numeric,
      (v_entry->'eval2'->>'score')::int,
      (v_entry->'eval2'->>'rubric')::int,
      (v_entry->'eval2'->>'rubric')::int,
      (v_entry->'eval2'->>'rubric')::int,
      (v_entry->'eval2'->>'rubric')::int,
      v_entry->'eval2'->>'grade',
      'Imported from historical records.', v_now, v_now
    )
    on conflict (student_id, term_id, evaluation_number) do update set
      from_surah      = excluded.from_surah,
      from_ayah       = excluded.from_ayah,
      to_surah        = excluded.to_surah,
      to_ayah         = excluded.to_ayah,
      memorized_ayahs = excluded.memorized_ayahs,
      memorized_pages = excluded.memorized_pages,
      memorized_hizbs = excluded.memorized_hizbs,
      score           = excluded.score,
      accuracy_score  = excluded.accuracy_score,
      fluency_score   = excluded.fluency_score,
      tajweed_score   = excluded.tajweed_score,
      retention_score = excluded.retention_score,
      grade           = excluded.grade,
      approved_at     = excluded.approved_at;

    v_imported := v_imported + 1;
  end loop;

  return jsonb_build_object('imported', v_imported);
end;
$$;

-- Migration 058: Fix "permission denied for table evaluations" in bulk historical eval import.
--
-- In Supabase's managed Postgres the SECURITY DEFINER function runs as the postgres role,
-- but FORCE ROW LEVEL SECURITY may still apply even to the table owner.
-- Adding SET LOCAL row_security = off (allowed for the table owner) definitively bypasses
-- all RLS for the duration of this transaction, after we've verified the caller's role.
--
-- Also adds NOTIFY pgrst so PostgREST reloads its schema cache and sees the function.

CREATE OR REPLACE FUNCTION public.bulk_import_historical_evals(
  p_term_id uuid,
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_entry       jsonb;
  v_now         timestamptz := now();
  v_imported    int := 0;
BEGIN
  -- Verify the caller has an admin-level role before bypassing RLS
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin', 'principal') THEN
    RAISE EXCEPTION 'Permission denied: only admin or principal can import historical evaluations';
  END IF;

  -- Disable row-security for this transaction so inserts bypass RLS restrictions
  -- (allowed because this function is owned by the table owner, postgres)
  SET LOCAL row_security = off;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    -- Move student's current position forward to Eval 2 end
    UPDATE public.students
      SET current_surah = (v_entry->>'eval2Surah')::int,
          current_ayah  = (v_entry->>'eval2Ayah')::int
      WHERE id = (v_entry->>'studentId')::uuid;

    -- Upsert Eval 1
    INSERT INTO public.evaluations (
      student_id, teacher_id, term_id, evaluation_number, status,
      from_surah, from_ayah, to_surah, to_ayah,
      memorized_ayahs, memorized_pages, memorized_hizbs,
      score, accuracy_score, fluency_score, tajweed_score, retention_score,
      grade, teacher_comment, submitted_at, approved_at
    ) VALUES (
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
    ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
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
    INSERT INTO public.evaluations (
      student_id, teacher_id, term_id, evaluation_number, status,
      from_surah, from_ayah, to_surah, to_ayah,
      memorized_ayahs, memorized_pages, memorized_hizbs,
      score, accuracy_score, fluency_score, tajweed_score, retention_score,
      grade, teacher_comment, submitted_at, approved_at
    ) VALUES (
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
    ON CONFLICT (student_id, term_id, evaluation_number) DO UPDATE SET
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
  END LOOP;

  RETURN jsonb_build_object('imported', v_imported);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_historical_evals(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

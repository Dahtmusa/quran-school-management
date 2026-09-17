CREATE OR REPLACE FUNCTION public.amqm_historical_baseline_readiness()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH active AS (
  SELECT id FROM public.students WHERE status='active'
),
base AS (
  SELECT b.student_id,b.quran_closing FROM public.amqm_historical_baselines b JOIN active a ON a.id=b.student_id
),
missing_quran AS (
  SELECT a.id FROM active a LEFT JOIN base b ON b.student_id=a.id
  WHERE b.student_id IS NULL OR coalesce((b.quran_closing->>'surah')::int,0)=0 OR coalesce((b.quran_closing->>'ayah')::int,0)=0
),
first_term AS (
  SELECT id FROM public.terms WHERE term_number=1 ORDER BY starts_on DESC LIMIT 1
),
missing_evaluations AS (
  SELECT a.id FROM active a
  WHERE (SELECT count(DISTINCT e.evaluation_number) FROM public.evaluations e
         WHERE e.student_id=a.id AND e.term_id=(SELECT id FROM first_term) AND e.status='approved' AND e.evaluation_number IN (1,2,3)) <> 3
)
SELECT jsonb_build_object(
  'active_students',(SELECT count(*) FROM active),
  'baseline_rows',(SELECT count(*) FROM base),
  'missing_baseline',(SELECT count(*) FROM active a LEFT JOIN base b ON b.student_id=a.id WHERE b.student_id IS NULL),
  'missing_quran_position',(SELECT count(*) FROM missing_quran),
  'missing_first_term_evaluations',(SELECT count(*) FROM missing_evaluations),
  'first_term_id',(SELECT id FROM first_term),
  'second_term_id',(SELECT id FROM public.terms WHERE term_number=2 ORDER BY starts_on DESC LIMIT 1),
  'ready',(
    (SELECT count(*) FROM active)=(SELECT count(*) FROM base)
    AND (SELECT count(*) FROM missing_quran)=0
    AND (SELECT count(*) FROM missing_evaluations)=0
    AND (SELECT id FROM first_term) IS NOT NULL
    AND (SELECT id FROM public.terms WHERE term_number=2 ORDER BY starts_on DESC LIMIT 1) IS NOT NULL
  )
);
$function$;

CREATE OR REPLACE FUNCTION public.amqm_assert_historical_evaluation_completeness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_first_term uuid; v_missing integer;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT id INTO v_first_term FROM public.terms WHERE term_number=1 ORDER BY starts_on DESC LIMIT 1;
  IF v_first_term IS NULL THEN RAISE EXCEPTION 'First Term is not configured'; END IF;
  SELECT count(*) INTO v_missing FROM public.students s
  WHERE s.status='active' AND (SELECT count(DISTINCT e.evaluation_number) FROM public.evaluations e
    WHERE e.student_id=s.id AND e.term_id=v_first_term AND e.status='approved' AND e.evaluation_number IN (1,2,3)) <> 3;
  IF v_missing > 0 THEN RAISE EXCEPTION 'Historical first-term baseline is incomplete: % active student(s) do not have all three approved evaluations', v_missing; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.amqm_capture_historical_baseline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE actor uuid:=auth.uid(); first_term uuid; student_count integer; captured_count integer;
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT id INTO first_term FROM public.terms WHERE term_number=1 ORDER BY starts_on DESC LIMIT 1;
  IF first_term IS NULL THEN RAISE EXCEPTION 'First Term is not configured'; END IF;
  PERFORM public.amqm_assert_historical_evaluation_completeness();
  INSERT INTO public.amqm_historical_baselines(student_id,baseline_term_id,quran_closing,finance_snapshot,attendance_snapshot,enrollment_snapshot,evaluation_snapshot,captured_at,captured_by)
  SELECT s.id,first_term,
    jsonb_build_object('surah',coalesce(e3.to_surah,s.current_surah),'ayah',coalesce(e3.to_ayah,s.current_ayah),'page',coalesce(e3.to_page,s.current_page),'hizb',s.current_hizb,'direction',s.memorization_direction),
    jsonb_build_object('due',coalesce((select sum(sf.amount_due) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id where sf.student_id=s.id and (fs.term_id=first_term or fs.term_id is null)),0),'paid',coalesce((select sum(p.amount) from public.payments p where p.student_id=s.id and p.voided_at is null and (p.term_id=first_term or p.term_id is null)),0),'outstanding',coalesce((select sum(greatest(sf.amount_due-sf.amount_paid,0)) from public.student_fees sf join public.fee_structures fs on fs.id=sf.fee_structure_id where sf.student_id=s.id and (fs.term_id=first_term or fs.term_id is null)),0)),
    jsonb_build_object('records',coalesce((select count(*) from public.attendance_records ar where ar.person_id=s.id and ar.person_type='student' and ar.attendance_date between (select starts_on from public.terms where id=first_term) and (select ends_on from public.terms where id=first_term)),0),'present',coalesce((select count(*) from public.attendance_records ar join public.attendance_statuses ast on ast.code=ar.status_code where ar.person_id=s.id and ar.person_type='student' and ar.attendance_date between (select starts_on from public.terms where id=first_term) and (select ends_on from public.terms where id=first_term) and ast.counts_as_present),0)),
    jsonb_build_object('class_id',s.class_id,'section',s.section,'program_year',s.program_year),
    coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'number',e.evaluation_number,'status',e.status,'score',e.score,'grade',e.grade,'from_surah',e.from_surah,'from_ayah',e.from_ayah,'to_surah',e.to_surah,'to_ayah',e.to_ayah,'to_page',e.to_page,'memorized_ayahs',e.memorized_ayahs,'memorized_pages',e.memorized_pages) order by e.evaluation_number) from public.evaluations e where e.student_id=s.id and e.campaign_id is null and e.term_id=first_term),'[]'::jsonb),now(),actor
  FROM public.students s
  LEFT JOIN LATERAL(select e.* from public.evaluations e where e.student_id=s.id and e.campaign_id is null and e.evaluation_number=3 and e.status='approved' and e.term_id=first_term order by e.approved_at desc nulls last,e.id desc limit 1)e3 on true
  WHERE s.status<>'deleted'
  ON CONFLICT(student_id) DO UPDATE SET baseline_term_id=excluded.baseline_term_id,quran_closing=excluded.quran_closing,finance_snapshot=excluded.finance_snapshot,attendance_snapshot=excluded.attendance_snapshot,enrollment_snapshot=excluded.enrollment_snapshot,evaluation_snapshot=excluded.evaluation_snapshot,captured_at=excluded.captured_at,captured_by=excluded.captured_by;
  SELECT count(*) INTO student_count FROM public.students WHERE status='active';
  SELECT count(*) INTO captured_count FROM public.amqm_historical_baselines b JOIN public.students s ON s.id=b.student_id WHERE s.status='active';
  RETURN jsonb_build_object('active_students',student_count,'baseline_rows',captured_count,'missing_baseline',greatest(student_count-captured_count,0),'first_term_id',first_term,'missing_first_term_evaluations',0);
END;
$function$;

-- Historical repair uses the authoritative live position (An-Nas 1 -> At-Tawbah 54).
-- The saved draft was stale, and the original rubric scores are not present in the database.
-- Reconstruct the three valid reverse-direction segments and derive the score using the existing
-- historical capture rule with the student's 30-page target. Mark the rows as auto-submitted and
-- record the provenance explicitly so they are distinguishable from original teacher-entered scores.
select set_config('app.historical_import','true',true);

WITH student AS (
  SELECT s.id,s.class_id FROM public.students s WHERE s.admission_no='AMQM/STU/2025/132' LIMIT 1
),
term AS (
  SELECT id FROM public.terms WHERE term_number=1 ORDER BY starts_on DESC LIMIT 1
),
teacher AS (
  SELECT ct.teacher_id FROM public.class_teachers ct JOIN student s ON s.class_id=ct.class_id
  ORDER BY ct.is_primary DESC,ct.teacher_id LIMIT 1
)
INSERT INTO public.evaluations(
  student_id,teacher_id,term_id,evaluation_number,status,score,
  tajweed_score,fluency_score,accuracy_score,memorization_score,retention_score,
  teacher_comment,admin_comment,submitted_at,approved_at,approved_by,
  from_surah,from_ayah,to_surah,to_ayah,from_page,to_page,
  memorized_ayahs,memorized_pages,memorized_hizbs,term_definition_id,teacher_visible,
  teacher_visible_at,campaign_id,auto_submitted,grade
)
SELECT s.id,t.teacher_id,tm.id,v.n,'approved',100,5,5,5,5,5,
  'Historical reconstruction from the authoritative 2026/27 First Term closing position. Original rubric score was not retained; score is derived by the historical 30-page capture rule.',
  'Repaired after a partial historical submission omitted this student while the account was suspended. Derived record; replace with original teacher rubric if it becomes available.',
  now(),now(),NULL,v.fs,v.fa,v.ts,v.ta,v.fp,v.tp,v.ayahs,v.pages,v.hizbs,NULL,false,NULL,NULL,true,'A'
FROM student s CROSS JOIN term tm CROSS JOIN teacher t
CROSS JOIN (VALUES
  (1::smallint,114::smallint,1::smallint,47::smallint,38::smallint,604::smallint,510::smallint,1648,94,9::numeric),
  (2::smallint,47::smallint,38::smallint,26::smallint,4::smallint,510::smallint,367::smallint,1647,143,14::numeric),
  (3::smallint,26::smallint,4::smallint,9::smallint,54::smallint,367::smallint,195::smallint,1647,172,17::numeric)
) v(n,fs,fa,ts,ta,fp,tp,ayahs,pages,hizbs)
WHERE NOT EXISTS (SELECT 1 FROM public.evaluations e WHERE e.student_id=s.id AND e.term_id=tm.id AND e.evaluation_number=v.n);

INSERT INTO public.report_cards(student_id,term_id,generated_by,finalized,generated_at)
SELECT s.id,tm.id,NULL,true,now()
FROM public.students s CROSS JOIN (SELECT id FROM public.terms WHERE term_number=1 ORDER BY starts_on DESC LIMIT 1) tm
WHERE s.admission_no='AMQM/STU/2025/132'
ON CONFLICT(student_id,term_id) DO UPDATE SET finalized=true,generated_at=now();

WITH student AS (SELECT id FROM public.students WHERE admission_no='AMQM/STU/2025/132' LIMIT 1),
term AS (SELECT id FROM public.terms WHERE term_number=1 ORDER BY starts_on DESC LIMIT 1),
snap AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'number',e.evaluation_number,'status',e.status,'score',e.score,'grade',e.grade,'from_surah',e.from_surah,'from_ayah',e.from_ayah,'to_surah',e.to_surah,'to_ayah',e.to_ayah,'to_page',e.to_page,'memorized_ayahs',e.memorized_ayahs,'memorized_pages',e.memorized_pages) ORDER BY e.evaluation_number),'[]'::jsonb) evaluation_snapshot
  FROM public.evaluations e CROSS JOIN student s CROSS JOIN term tm
  WHERE e.student_id=s.id AND e.term_id=tm.id AND e.campaign_id IS NULL
)
UPDATE public.amqm_historical_baselines b
SET quran_closing=jsonb_build_object('surah',9,'ayah',54,'page',195,'hizb',20,'direction','nas_to_baqarah'),evaluation_snapshot=snap.evaluation_snapshot
FROM student s,term tm,snap
WHERE b.student_id=s.id AND b.baseline_term_id=tm.id;

INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
SELECT auth.uid(),'historical_evaluations_repaired','student',s.id,
  jsonb_build_object('admission_no',s.admission_no,'first_term_evaluations',0),
  jsonb_build_object('first_term_evaluations',3,'source','canonical_current_quran_position_and_historical_capture_rule','score_provenance','derived_not_original')
FROM public.students s WHERE s.admission_no='AMQM/STU/2025/132';

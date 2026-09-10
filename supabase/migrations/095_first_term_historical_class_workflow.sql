-- First Term historical workflow: atomic whole-class teacher submission.
-- Eval 3 is the teacher's actual score; Eval 2 and Eval 1 are derived from a 0 baseline.
-- The official student current position is NOT changed until Admin approves the class.

create or replace function public.teacher_submit_historical_class(
  p_term_id uuid,
  p_class_id uuid,
  p_entries jsonb
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_tid uuid := auth.uid(); v_now timestamptz := now(); v_count integer := 0;
  v_expected integer; v_supplied integer; v_item jsonb; v_student_id uuid;
  v_end_surah smallint; v_end_ayah smallint; v_score numeric;
  r_end record; r_start record; r_e1 record; r_e2 record;
  g_start integer; g_end integer; g_total integer; g_split1 integer; g_split2 integer;
  v_direction text; v_can_surah smallint; v_can_ayah smallint;
  v1_ayahs integer; v1_pages integer; v1_hizbs numeric;
  v2_ayahs integer; v2_pages integer; v2_hizbs numeric;
  v3_ayahs integer; v3_pages integer; v3_hizbs numeric;
  s1 numeric; s2 numeric; s3 numeric; g1 text; g2 text; g3 text;
  r1 smallint; r2 smallint; r3 smallint;
begin
  if public.my_role() <> 'teacher' then raise exception 'Teacher access required'; end if;
  if not exists (select 1 from public.class_teachers where class_id=p_class_id and teacher_id=v_tid) then
    raise exception 'You are not assigned as a teacher for this class';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Class submission must contain a list of students';
  end if;
  select count(*) into v_expected from public.students where class_id=p_class_id and status='active';
  select count(distinct (x->>'student_id')) into v_supplied from jsonb_array_elements(p_entries) x where coalesce(x->>'student_id','') <> '';
  if v_supplied <> v_expected then raise exception 'Class submission is incomplete: expected % active students, received %',v_expected,v_supplied; end if;
  if exists (select 1 from public.students s where s.class_id=p_class_id and s.status='active' and not exists (select 1 from jsonb_array_elements(p_entries) x where (x->>'student_id')::uuid=s.id)) then
    raise exception 'Every active student in the class must be included before submitting';
  end if;

  -- Validate the complete class before any write, so a failed class never partially saves.
  for v_item in select value from jsonb_array_elements(p_entries) loop
    v_student_id := (v_item->>'student_id')::uuid;
    v_end_surah := (v_item->>'end_surah')::smallint; v_end_ayah := (v_item->>'end_ayah')::smallint;
    v_score := greatest(0,least(100,coalesce((v_item->>'score')::numeric,0)));
    if not exists (select 1 from public.students where id=v_student_id and class_id=p_class_id and status='active') then raise exception 'Student % is not an active member of this class',v_student_id; end if;
    if not exists (select 1 from public.teacher_students where teacher_id=v_tid and student_id=v_student_id) then raise exception 'Student % is not assigned to you',v_student_id; end if;
    select * into r_end from public.quran_verses where surah=v_end_surah and ayah=v_end_ayah;
    if r_end is null then raise exception 'Invalid end position for student % (surah % ayah %)',v_student_id,v_end_surah,v_end_ayah; end if;
    if exists (select 1 from public.evaluations where student_id=v_student_id and term_id=p_term_id and evaluation_number=3 and status='approved') then raise exception 'Eval 3 is already approved for student %. Admin must return it before a new submission can replace it.',v_student_id; end if;
  end loop;

  perform set_config('app.historical_import','true',true);
  for v_item in select value from jsonb_array_elements(p_entries) loop
    v_student_id := (v_item->>'student_id')::uuid; v_end_surah := (v_item->>'end_surah')::smallint; v_end_ayah := (v_item->>'end_ayah')::smallint;
    v_score := greatest(0,least(100,coalesce((v_item->>'score')::numeric,0)));
    select * into r_end from public.quran_verses where surah=v_end_surah and ayah=v_end_ayah;
    select * into r_start from public.quran_verses where surah=2 and ayah=1;
    if r_end.global_ayah < r_start.global_ayah then v_direction:='nas_to_baqarah'; v_can_surah:=114; v_can_ayah:=1; else v_direction:='baqarah_to_nas'; v_can_surah:=2; v_can_ayah:=1; end if;
    select * into r_start from public.quran_verses where surah=v_can_surah and ayah=v_can_ayah;
    update public.students set memorization_direction=v_direction::public.memorization_direction where id=v_student_id;
    g_start:=r_start.global_ayah; g_end:=r_end.global_ayah; g_total:=abs(g_end-g_start);
    if g_end>=g_start then g_split1:=g_start+(g_total/3); g_split2:=g_start+(g_total*2/3); else g_split1:=g_start-(g_total/3); g_split2:=g_start-(g_total*2/3); end if;
    select * into r_e1 from public.quran_verses order by abs(global_ayah-g_split1) limit 1;
    select * into r_e2 from public.quran_verses order by abs(global_ayah-g_split2) limit 1;
    v1_ayahs:=abs(r_e1.global_ayah-r_start.global_ayah); v1_pages:=abs(r_e1.page-r_start.page); v1_hizbs:=abs(r_e1.hizb-r_start.hizb);
    v2_ayahs:=abs(r_e2.global_ayah-r_e1.global_ayah); v2_pages:=abs(r_e2.page-r_e1.page); v2_hizbs:=abs(r_e2.hizb-r_e1.hizb);
    v3_ayahs:=abs(r_end.global_ayah-r_e2.global_ayah); v3_pages:=abs(r_end.page-r_e2.page); v3_hizbs:=abs(r_end.hizb-r_e2.hizb);
    s3:=v_score; s2:=round(s3/2,2); s1:=round(s3/4,2);
    g3:=case when s3>=90 then 'A' when s3>=75 then 'B' when s3>=60 then 'C' when s3>=45 then 'D' else 'F' end;
    g2:=case when s2>=90 then 'A' when s2>=75 then 'B' when s2>=60 then 'C' when s2>=45 then 'D' else 'F' end;
    g1:=case when s1>=90 then 'A' when s1>=75 then 'B' when s1>=60 then 'C' when s1>=45 then 'D' else 'F' end;
    r3:=case when s3>=90 then 5 when s3>=75 then 4 when s3>=60 then 3 when s3>=45 then 2 else 1 end;
    r2:=case when s2>=90 then 5 when s2>=75 then 4 when s2>=60 then 3 when s2>=45 then 2 else 1 end;
    r1:=case when s1>=90 then 5 when s1>=75 then 4 when s1>=60 then 3 when s1>=45 then 2 else 1 end;
    insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,from_surah,from_ayah,to_surah,to_ayah,memorized_ayahs,memorized_pages,memorized_hizbs,memorization_score,accuracy_score,fluency_score,tajweed_score,retention_score,score,grade,submitted_at,approved_at,approved_by)
    values(v_student_id,v_tid,p_term_id,1,'approved',v_can_surah,v_can_ayah,r_e1.surah,r_e1.ayah,v1_ayahs,v1_pages,v1_hizbs,r1,r1,r1,r1,r1,s1,g1,v_now,v_now,v_tid)
    on conflict(student_id,term_id,evaluation_number) do update set teacher_id=excluded.teacher_id,from_surah=excluded.from_surah,from_ayah=excluded.from_ayah,to_surah=excluded.to_surah,to_ayah=excluded.to_ayah,memorized_ayahs=excluded.memorized_ayahs,memorized_pages=excluded.memorized_pages,memorized_hizbs=excluded.memorized_hizbs,memorization_score=excluded.memorization_score,accuracy_score=excluded.accuracy_score,fluency_score=excluded.fluency_score,tajweed_score=excluded.tajweed_score,retention_score=excluded.retention_score,score=excluded.score,grade=excluded.grade,status='approved',submitted_at=excluded.submitted_at,approved_at=v_now,approved_by=v_tid;
    insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,from_surah,from_ayah,to_surah,to_ayah,memorized_ayahs,memorized_pages,memorized_hizbs,memorization_score,accuracy_score,fluency_score,tajweed_score,retention_score,score,grade,submitted_at,approved_at,approved_by)
    values(v_student_id,v_tid,p_term_id,2,'approved',r_e1.surah,r_e1.ayah,r_e2.surah,r_e2.ayah,v2_ayahs,v2_pages,v2_hizbs,r2,r2,r2,r2,r2,s2,g2,v_now,v_now,v_tid)
    on conflict(student_id,term_id,evaluation_number) do update set teacher_id=excluded.teacher_id,from_surah=excluded.from_surah,from_ayah=excluded.from_ayah,to_surah=excluded.to_surah,to_ayah=excluded.to_ayah,memorized_ayahs=excluded.memorized_ayahs,memorized_pages=excluded.memorized_pages,memorized_hizbs=excluded.memorized_hizbs,memorization_score=excluded.memorization_score,accuracy_score=excluded.accuracy_score,fluency_score=excluded.fluency_score,tajweed_score=excluded.tajweed_score,retention_score=excluded.retention_score,score=excluded.score,grade=excluded.grade,status='approved',submitted_at=excluded.submitted_at,approved_at=v_now,approved_by=v_tid;
    insert into public.evaluations(student_id,teacher_id,term_id,evaluation_number,status,from_surah,from_ayah,to_surah,to_ayah,memorized_ayahs,memorized_pages,memorized_hizbs,memorization_score,accuracy_score,fluency_score,tajweed_score,retention_score,score,grade,submitted_at)
    values(v_student_id,v_tid,p_term_id,3,'pending_approval',r_e2.surah,r_e2.ayah,v_end_surah,v_end_ayah,v3_ayahs,v3_pages,v3_hizbs,r3,r3,r3,r3,r3,s3,g3,v_now)
    on conflict(student_id,term_id,evaluation_number) do update set teacher_id=excluded.teacher_id,from_surah=excluded.from_surah,from_ayah=excluded.from_ayah,to_surah=excluded.to_surah,to_ayah=excluded.to_ayah,memorized_ayahs=excluded.memorized_ayahs,memorized_pages=excluded.memorized_pages,memorized_hizbs=excluded.memorized_hizbs,memorization_score=excluded.memorization_score,accuracy_score=excluded.accuracy_score,fluency_score=excluded.fluency_score,tajweed_score=excluded.tajweed_score,retention_score=excluded.retention_score,score=excluded.score,grade=excluded.grade,status='pending_approval',submitted_at=excluded.submitted_at,approved_at=null,approved_by=null;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.teacher_submit_historical_class(uuid,uuid,jsonb) to authenticated;

create or replace function public.teacher_submit_historical_eval3(uuid,uuid,smallint,smallint,smallint,smallint,numeric,smallint,text,integer,integer,numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.teacher_submit_historical_class($2,(select class_id from public.students where id=$1),jsonb_build_array(jsonb_build_object('student_id',$1,'end_surah',$5,'end_ayah',$6,'score',$7)));
end;
$$;
grant execute on function public.teacher_submit_historical_eval3(uuid,uuid,smallint,smallint,smallint,smallint,numeric,smallint,text,integer,integer,numeric) to authenticated;

-- Allow authorised admin/teachers to correct any valid Quran start/current position
-- and choose either memorization direction without an artificial start/direction lock.
-- The system still validates that Surah/Ayah coordinates exist in quran_verses.

CREATE OR REPLACE FUNCTION public.validate_student_quran_journey()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $function$
declare
  v_start integer;
  v_current integer;
begin
  -- Nulls are permitted for incomplete/draft records, matching the existing
  -- student workflow. When positions are supplied, they must be real Quran
  -- positions, but their ordinal relationship is intentionally unrestricted.
  if new.start_surah is not null and new.start_ayah is not null then
    select global_ayah into v_start
    from public.quran_verses
    where surah=new.start_surah and ayah=new.start_ayah;
    if v_start is null then
      raise exception 'Invalid Quran start position: Surah %, Ayah %', new.start_surah, new.start_ayah;
    end if;
  end if;

  if new.current_surah is not null and new.current_ayah is not null then
    select global_ayah into v_current
    from public.quran_verses
    where surah=new.current_surah and ayah=new.current_ayah;
    if v_current is null then
      raise exception 'Invalid Quran current position: Surah %, Ayah %', new.current_surah, new.current_ayah;
    end if;
  end if;

  -- IMPORTANT: do not enforce direction against start/current ordering.
  -- Admins and authorised teachers are allowed to correct the live record
  -- and may select either Baqarah-to-Nas or Nas-to-Baqarah independently.
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_validate_student_quran_journey ON public.students;
CREATE TRIGGER trg_validate_student_quran_journey
BEFORE INSERT OR UPDATE OF memorization_direction,start_surah,start_ayah,current_surah,current_ayah
ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.validate_student_quran_journey();

drop function if exists public.amqm_get_admission_screening(text);

create or replace function public.amqm_get_admission_screening(p_token text)
returns table(
  application_id uuid,
  application_no text,
  applicant_name text,
  date_of_birth date,
  gender text,
  state text,
  lga text,
  quran_level text,
  starting_surah smallint,
  starting_ayah smallint,
  screening_mode text,
  screening_scheduled_at timestamptz,
  screening_outcome text,
  screening_status text
)
language sql
security definer
set search_path=public
as $$
  select
    a.id,a.application_no,a.applicant_name,a.date_of_birth,a.gender,a.state,a.lga,
    a.quran_level,a.starting_surah,a.starting_ayah,a.screening_mode,a.screening_scheduled_at,
    a.screening_outcome,a.status
  from public.admissions a
  where a.screening_token=p_token
    and a.screening_mode='virtual'
    and a.status in ('screening_scheduled','screened','accepted','further_assessment');
$$;

grant execute on function public.amqm_get_admission_screening(text) to anon,authenticated;
notify pgrst,'reload schema';

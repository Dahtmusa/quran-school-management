begin;

with ranked as (
  select id, row_number() over (partition by event_type, title order by created_at asc, id asc) as rn
  from public.school_calendar_events
  where event_type in ('school_opening','school_closing')
)
delete from public.school_calendar_events e using ranked r where e.id = r.id and r.rn > 1;

with ranked as (
  select id, row_number() over (partition by event_type, term_id, evaluation_number order by created_at asc, id asc) as rn
  from public.school_calendar_events
  where event_type in ('evaluation_1','evaluation_2','evaluation_3') and term_id is not null
)
delete from public.school_calendar_events e using ranked r where e.id = r.id and r.rn > 1;

update public.school_calendar_events e
set academic_year_id = ay.id, updated_at = now()
from public.academic_years ay
where ay.name = '2026/27'
  and e.academic_year_id is null
  and (e.title in ('Session Opening – 2026/27','Session Closing – 2026/27')
       or e.term_id in (select t.id from public.terms t where t.academic_year_id = ay.id));

create unique index if not exists uq_school_calendar_session_marker
  on public.school_calendar_events (event_type, title)
  where event_type in ('school_opening','school_closing');

create unique index if not exists uq_school_calendar_evaluation_window
  on public.school_calendar_events (event_type, term_id, evaluation_number)
  where event_type in ('evaluation_1','evaluation_2','evaluation_3') and term_id is not null;

commit;

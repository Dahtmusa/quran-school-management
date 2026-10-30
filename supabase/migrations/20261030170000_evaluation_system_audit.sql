-- Full audit of the evaluation system's current state. Returns one
-- JSON with everything that is relevant to debugging the "Open does
-- not actually open" symptom: current term, calendar-authored eval
-- dates, campaigns in the DB with their status and closes_at, draft
-- evaluations count, and any obvious conflicts.

create or replace function public.amqm_audit_evaluations()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with cur as (
    select id, name, starts_on, ends_on
      from public.terms where is_current = true limit 1
  )
  select jsonb_build_object(
    'now', now(),
    'current_term', (select to_jsonb(cur.*) from cur),

    'calendar_eval_events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_type',    e.event_type,
        'starts_on',     e.starts_at,
        'ends_on',       e.ends_at,
        'evaluation_number', e.evaluation_number,
        'published',     e.published
      ) order by e.event_type), '[]'::jsonb)
      from public.school_calendar_events e
      join cur on cur.id = e.term_id
      where e.event_type in ('evaluation_1','evaluation_2','evaluation_3')
    ),

    'campaigns_current_term', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',                c.id,
        'evaluation_number', c.evaluation_number,
        'title',             c.title,
        'status',            c.status,
        'opens_at',          c.opens_at,
        'closes_at',         c.closes_at,
        'is_currently_within_window',
            case when now() between c.opens_at and c.closes_at then true else false end,
        'minutes_until_close',
            extract(epoch from (c.closes_at - now()))/60.0,
        'created_at',        c.created_at,
        'updated_at',        c.updated_at
      ) order by c.evaluation_number, c.created_at desc), '[]'::jsonb)
      from public.evaluation_campaigns c
      join cur on cur.id = c.term_id
    ),

    'eval_rows_current_term_by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select e.status::text as status, count(*)::int as cnt
          from public.evaluations e
          join cur on cur.id = e.term_id
         group by e.status::text
      ) s
    ),

    'conflicts_detected', (
      select coalesce(jsonb_agg(msg), '[]'::jsonb) from (
        select 'Campaign has status=closed because closes_at is in the past (set during open was closes_at < now)' as msg
          from public.evaluation_campaigns c
          join cur on cur.id = c.term_id
         where c.closes_at <= now() and c.status = 'closed'
        union all
        select 'Multiple campaigns exist for same (term, evaluation_number)' as msg
          where exists(
            select 1 from public.evaluation_campaigns c
            join cur on cur.id = c.term_id
            group by c.term_id, c.evaluation_number
            having count(*) > 1
          )
      ) all_msgs
    )
  );
$$;

grant execute on function public.amqm_audit_evaluations() to authenticated;

notify pgrst, 'reload schema';

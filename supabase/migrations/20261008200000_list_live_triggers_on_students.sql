-- Diagnostic. Lists every trigger live in Postgres on
-- public.students, with the FULL body of each trigger function.
-- The migration files only hint at four triggers but a 5th is
-- clearly rewriting NEW.admission_no on UPDATE -- we need to see
-- it directly.

create or replace function public.amqm_diagnose_student_triggers()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select
      tg.tgname                                  as trigger_name,
      case tg.tgtype::integer & 2
        when 2 then 'BEFORE' else 'AFTER' end    as timing,
      case
        when (tg.tgtype::integer & 4) <> 0 then 'INSERT'
        when (tg.tgtype::integer & 8) <> 0 then 'DELETE'
        when (tg.tgtype::integer & 16) <> 0 then 'UPDATE'
        when (tg.tgtype::integer & 32) <> 0 then 'TRUNCATE'
        else '(mixed)' end                       as event,
      case tg.tgtype::integer & 1
        when 1 then 'ROW' else 'STATEMENT' end   as scope,
      tg.tgenabled                               as enabled,
      p.proname                                  as function_name,
      n.nspname                                  as function_schema,
      pg_get_triggerdef(tg.oid)                  as full_trigger_def,
      pg_get_functiondef(p.oid)                  as function_body
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc  p on p.oid = tg.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where c.relname = 'students'
      and c.relnamespace = 'public'::regnamespace
      and not tg.tgisinternal
    order by tg.tgname
  ) t;
$$;

grant execute on function public.amqm_diagnose_student_triggers() to authenticated;

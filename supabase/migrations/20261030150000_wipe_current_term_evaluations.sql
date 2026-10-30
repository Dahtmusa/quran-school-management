-- Clear every evaluation and evaluation campaign tied to the CURRENT
-- academic term so admin can re-run Evaluation 1 cleanly with the new
-- manual-toggle flow. Prior-term evaluations stay intact (students
-- keep their last term's results on their record). Fees, attendance,
-- Qur'an positions, and all other student data are not touched.
--
-- Two pieces: a diagnostic to preview the delete, and the actual
-- wipe. Admin runs the preview first.

create or replace function public.amqm_preview_current_term_eval_wipe()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with cur as (
    select id, name from public.terms where is_current = true limit 1
  )
  select jsonb_build_object(
    'current_term', (select name from cur),
    'current_term_id', (select id from cur),
    'evaluations_to_delete', (
      select count(*) from public.evaluations
      where term_id = (select id from cur)
    ),
    'evaluation_campaigns_to_delete', (
      select count(*) from public.evaluation_campaigns
      where term_id = (select id from cur)
    ),
    'evaluations_by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select status::text as status, count(*)::int as cnt
          from public.evaluations
         where term_id = (select id from cur)
         group by status::text
      ) s
    ),
    'other_terms_evaluation_count', (
      select count(*) from public.evaluations
      where term_id is distinct from (select id from cur)
    ),
    'fees_untouched',       (select count(*) from public.student_fees),
    'payments_untouched',   (select count(*) from public.payments),
    'attendance_untouched', (select count(*) from public.attendance_records)
  );
$$;

create or replace function public.amqm_wipe_current_term_evaluations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term_id uuid;
  v_term_name text;
  v_evals_deleted int := 0;
  v_campaigns_deleted int := 0;
  v_campaign_classes_deleted int := 0;
begin
  select id, name into v_term_id, v_term_name
    from public.terms where is_current = true limit 1;
  if v_term_id is null then
    raise exception 'No term is flagged as current';
  end if;

  -- Delete evaluations first (they reference campaigns via campaign_id).
  with d as (
    delete from public.evaluations
     where term_id = v_term_id
    returning id
  )
  select count(*) into v_evals_deleted from d;

  -- Delete campaign_classes link rows for current-term campaigns.
  with d as (
    delete from public.evaluation_campaign_classes
     where campaign_id in (
       select id from public.evaluation_campaigns where term_id = v_term_id
     )
    returning campaign_id
  )
  select count(*) into v_campaign_classes_deleted from d;

  -- Finally the campaigns themselves.
  with d as (
    delete from public.evaluation_campaigns
     where term_id = v_term_id
    returning id
  )
  select count(*) into v_campaigns_deleted from d;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(),
    'admin_wipe_current_term_evaluations',
    'term',
    v_term_id,
    jsonb_build_object('term_name', v_term_name),
    jsonb_build_object(
      'evaluations_deleted', v_evals_deleted,
      'campaigns_deleted',   v_campaigns_deleted,
      'campaign_classes_deleted', v_campaign_classes_deleted
    )
  );

  return jsonb_build_object(
    'term_id',                   v_term_id,
    'term_name',                 v_term_name,
    'evaluations_deleted',       v_evals_deleted,
    'campaigns_deleted',         v_campaigns_deleted,
    'campaign_classes_deleted',  v_campaign_classes_deleted
  );
end;
$$;

grant execute on function public.amqm_preview_current_term_eval_wipe() to authenticated;
grant execute on function public.amqm_wipe_current_term_evaluations() to authenticated;

notify pgrst, 'reload schema';

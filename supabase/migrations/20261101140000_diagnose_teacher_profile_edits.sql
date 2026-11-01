-- Diagnostic RPC: list every profile change captured in audit_logs within the
-- last window (default 48h). This is NOT a full history — only edits that went
-- through update_my_profile (self-edit by admin) or that changed role /
-- employment_status (the two columns watched by amqm_audit_profile_changes)
-- appear here. Direct admin edits to another teacher's name/phone/bio/etc. are
-- NOT in audit_logs because the admin-update RLS path writes straight to the
-- profiles table.

create or replace function public.amqm_recent_profile_audit(p_hours int default 48)
returns table(
  logged_at timestamptz,
  action text,
  actor_name text,
  target_name text,
  target_id uuid,
  changed_fields text[],
  old_data jsonb,
  new_data jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    al.created_at,
    al.action,
    coalesce(ap.full_name, 'unknown'),
    coalesce(tp.full_name, 'unknown'),
    al.entity_id,
    case
      when al.old_data is null or al.new_data is null then array[]::text[]
      else (
        select coalesce(array_agg(k), array[]::text[])
        from (
          select key as k
          from jsonb_each(al.old_data) o
          where o.value is distinct from (al.new_data -> o.key)
        ) diff
      )
    end,
    al.old_data,
    al.new_data
  from public.audit_logs al
  left join public.profiles ap on ap.id = al.actor_id
  left join public.profiles tp on tp.id = al.entity_id
  where al.entity_type = 'profiles'
    and al.created_at >= now() - make_interval(hours => p_hours)
    and public.my_role() in ('super_admin','admin','principal')
  order by al.created_at desc;
$$;

revoke all on function public.amqm_recent_profile_audit(int) from public;
grant execute on function public.amqm_recent_profile_audit(int) to authenticated;

-- Revert helper: given a specific audit log entry id for a profile row, restore
-- the OLD values. Only admins can run it, and only when old_data is populated.
create or replace function public.amqm_revert_profile_audit(p_audit_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.audit_logs;
  v_result public.profiles;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into v_log from public.audit_logs where id = p_audit_id;
  if not found then raise exception 'Audit entry not found'; end if;
  if v_log.entity_type <> 'profiles' then raise exception 'Not a profile audit entry'; end if;
  if v_log.old_data is null then raise exception 'This entry has no old_data; cannot revert'; end if;

  update public.profiles
     set full_name         = coalesce((v_log.old_data->>'full_name'), full_name),
         phone             = (v_log.old_data->>'phone'),
         avatar_url        = (v_log.old_data->>'avatar_url'),
         employment_status = coalesce((v_log.old_data->>'employment_status'), employment_status),
         job_title         = (v_log.old_data->>'job_title'),
         department        = (v_log.old_data->>'department'),
         joined_on         = nullif(v_log.old_data->>'joined_on','')::date,
         id_expires_on     = nullif(v_log.old_data->>'id_expires_on','')::date,
         bio               = (v_log.old_data->>'bio'),
         show_on_website   = coalesce((v_log.old_data->>'show_on_website')::boolean, false),
         username          = (v_log.old_data->>'username'),
         qualifications    = (v_log.old_data->>'qualifications'),
         experience        = (v_log.old_data->>'experience'),
         subjects          = (v_log.old_data->>'subjects'),
         email             = (v_log.old_data->>'email'),
         preferred_email   = (v_log.old_data->>'preferred_email')
   where id = v_log.entity_id
   returning * into v_result;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), 'profile:admin_revert', 'profiles', v_log.entity_id,
          v_log.new_data, to_jsonb(v_result) - 'signature_data');

  return v_result;
end;
$$;

revoke all on function public.amqm_revert_profile_audit(uuid) from public;
grant execute on function public.amqm_revert_profile_audit(uuid) to authenticated;

-- Going-forward safety: capture every profile UPDATE so we never again face a
-- "we can't tell what changed" situation. Fires AFTER UPDATE, logs the full
-- before/after snapshot (minus signature blob which is huge binary data).
create or replace function public.amqm_log_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_jsonb(new) - 'signature_data' is distinct from to_jsonb(old) - 'signature_data' then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
    values (
      coalesce(auth.uid(), old.id),
      'profile:update',
      'profiles',
      new.id,
      to_jsonb(old) - 'signature_data',
      to_jsonb(new) - 'signature_data'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists amqm_log_profile_update on public.profiles;
create trigger amqm_log_profile_update
  after update on public.profiles
  for each row
  execute function public.amqm_log_profile_update();

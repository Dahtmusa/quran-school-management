-- Harden admin website-setting writes against client-side RLS failures.
-- All privileged site_settings writes go through an authenticated SECURITY DEFINER RPC.

create or replace function public.admin_upsert_site_setting(
  p_key text,
  p_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  if trim(coalesce(p_key,'')) = '' then
    raise exception 'Setting key is required';
  end if;

  insert into public.site_settings(key,value,updated_at)
  values (trim(p_key), coalesce(p_value,'{}'::jsonb), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

revoke all on function public.admin_upsert_site_setting(text,jsonb) from public;
grant execute on function public.admin_upsert_site_setting(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
-- AMQM 107: Full self-service profile editor for administrators.
-- Keeps access-control fields system-managed while allowing administrators to
-- maintain the complete personal/staff profile record from one page.

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_avatar_url text,
  p_employment_status text,
  p_job_title text,
  p_department text,
  p_joined_on date,
  p_id_expires_on date,
  p_bio text,
  p_show_on_website boolean,
  p_username text,
  p_qualifications text,
  p_experience text,
  p_subjects text,
  p_email text,
  p_preferred_email text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old public.profiles;
  v_new public.profiles;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  select * into v_old from public.profiles where id = v_actor for update;
  if not found then raise exception 'Profile not found'; end if;

  update public.profiles
     set full_name = nullif(trim(p_full_name), ''),
         phone = nullif(trim(p_phone), ''),
         avatar_url = nullif(trim(p_avatar_url), ''),
         employment_status = coalesce(nullif(trim(p_employment_status), ''), employment_status),
         job_title = nullif(trim(p_job_title), ''),
         department = nullif(trim(p_department), ''),
         joined_on = p_joined_on,
         id_expires_on = p_id_expires_on,
         bio = nullif(trim(p_bio), ''),
         show_on_website = coalesce(p_show_on_website, false),
         username = nullif(trim(p_username), ''),
         qualifications = nullif(trim(p_qualifications), ''),
         experience = nullif(trim(p_experience), ''),
         subjects = nullif(trim(p_subjects), ''),
         email = nullif(trim(p_email), ''),
         preferred_email = nullif(trim(p_preferred_email), '')
   where id = v_actor
   returning * into v_new;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    v_actor,
    'profile:self_update',
    'profiles',
    v_actor,
    to_jsonb(v_old) - 'signature_data',
    to_jsonb(v_new) - 'signature_data'
  );

  return v_new;
end;
$$;

revoke all on function public.update_my_profile(text,text,text,text,text,text,date,date,text,boolean,text,text,text,text,text,text) from public;
grant execute on function public.update_my_profile(text,text,text,text,text,text,date,date,text,boolean,text,text,text,text,text,text) to authenticated;

insert into public.site_settings(key,value) values('currency','{"code":"RWF","symbol":"RWF"}'::jsonb) on conflict(key) do nothing;

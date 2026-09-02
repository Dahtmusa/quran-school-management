alter table public.students add column if not exists id_expires_on date;
alter table public.profiles add column if not exists id_expires_on date;

create or replace function public.default_student_id_expiry()
returns trigger language plpgsql security invoker as $$
declare ay_end date;
begin
 if new.id_expires_on is null then
   select ends_on into ay_end from public.academic_years where is_current=true order by ends_on desc limit 1;
   new.id_expires_on:=coalesce(ay_end,(current_date+interval '1 year')::date);
 end if;
 return new;
end $$;
drop trigger if exists students_default_id_expiry on public.students;
create trigger students_default_id_expiry before insert on public.students for each row execute function public.default_student_id_expiry();

create or replace function public.default_staff_id_expiry()
returns trigger language plpgsql security invoker as $$
declare ay_end date;
begin
 if new.id_expires_on is null and new.role in ('teacher','principal','admin','super_admin','finance','admissions') then
   select ends_on into ay_end from public.academic_years where is_current=true order by ends_on desc limit 1;
   new.id_expires_on:=coalesce(ay_end,(current_date+interval '1 year')::date);
 end if;
 return new;
end $$;
drop trigger if exists profiles_default_id_expiry on public.profiles;
create trigger profiles_default_id_expiry before insert on public.profiles for each row execute function public.default_staff_id_expiry();

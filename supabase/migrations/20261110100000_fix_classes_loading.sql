-- URGENT: class assignments disappeared from the Staff and Classes pages.
--
-- students.removed_from_class_id (added 2026-11-09) referenced classes, so
-- students now had TWO links to classes. Pages load "each class with its
-- students" (classes -> students(count)), which became ambiguous and failed,
-- so every teacher showed "No class assigned". The assignments themselves
-- were never changed.
--
-- Keep the column (it only remembers a removed student's class) but drop its
-- foreign key, so students -> classes has a single link again.

do $$
declare c text;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
     where con.conrelid = 'public.students'::regclass
       and con.contype = 'f'
       and att.attname = 'removed_from_class_id'
  loop
    execute format('alter table public.students drop constraint %I', c);
  end loop;
end $$;

notify pgrst, 'reload schema';

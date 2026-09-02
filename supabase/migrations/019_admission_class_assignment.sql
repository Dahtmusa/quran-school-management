alter table public.admissions add column if not exists class_id uuid references public.classes(id) on delete set null;

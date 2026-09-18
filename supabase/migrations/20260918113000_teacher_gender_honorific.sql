-- Teacher honorific support
-- Store optional staff gender so the UI can use Malam/Malama without guessing from names.
alter table public.profiles add column if not exists gender text;
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or lower(gender) in ('male','female'));
notify pgrst,'reload schema';
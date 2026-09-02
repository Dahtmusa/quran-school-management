alter table public.school_number_sequences enable row level security;
revoke all on table public.school_number_sequences from anon,authenticated;

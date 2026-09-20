-- Remove identical indexes identified by the Supabase database advisor.
-- Keep the canonical constraint-backed/established indexes.
drop index if exists public.student_program_completions_student_uidx;
drop index if exists public.one_current_term;
drop index if exists public.student_fees_structure_idx;
drop index if exists public.student_fees_student_idx;
drop index if exists public.payment_allocations_payment_fee_unique;

notify pgrst,'reload schema';

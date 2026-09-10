-- Allow First Term historical evaluation submissions to be partial.
-- Teachers may submit one or more completed students and continue later.
-- The existing teacher_submit_historical_eval3 RPC delegates to this function.
-- This migration intentionally removes the old whole-class completeness check.

-- Production implementation was applied directly through Supabase migration tooling.
-- Keep this migration file synchronized with that production change.

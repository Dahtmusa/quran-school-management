# AMQM Two-Year Qur'an Progression Implementation

Implemented against the AMQM project audited on 11 September 2026.

## Core lifecycle
- 2 programme years: Year 1 and Year 2.
- 3 terms per year: First, Second, Third.
- 3 evaluations per term: Evaluation 1, 2, 3.
- Approved Evaluation 1 ending position becomes Evaluation 2 starting position.
- Approved Evaluation 2 ending position becomes Evaluation 3 starting position.
- Approved Evaluation 3 ending position becomes the term closing position.
- The next term opens from the previous term's exact closing position.
- Historical import records remain separate from the live chain; Historical Eval 3 seeds the first live term's opening position through the student's official current position.
- Students remain in their stable class/teacher group throughout the two-year programme; progress is measured through Hifz evaluations and Qur'an progress.
- Year 2 Term 3 is the final programme stage. Existing graduation/certificate lifecycle is preserved and a permanent completion snapshot is added.

## Calendar automation
The calendar now stores evaluation events using the database's real `evaluation_1`, `evaluation_2`, `evaluation_3` event types and links them to the correct term. PostgreSQL `pg_cron` runs the automation hourly to create/open due evaluation campaigns and teacher work queues, while respecting evaluation sequencing.

Term closure remains an explicit administrator action: **Close Term & Start Next Term**. It requires all active students to have three approved evaluations, locks the term position, prepares the next-term opening position, and activates the next term.

## Finance safety
- Definitive next-term carry-forward invoice function is included.
- Payment rebuild now includes legacy payments that have no term ID.
- Payment voiding is now an immutable void marker rather than deleting the payment row.

## Parent portal performance
Parent evaluation loading is limited to the current operational term and linked children. The `student_fees` realtime subscription was removed to avoid reload storms during bulk allocation; payment refreshes are debounced.

## Historical import visibility
Calendar includes a one-time **Mark Historical Data Verified** control. It sets `site_settings.amqm_historical_import_verified=true`. The normal Evaluations dashboard hides the historical import shortcut after verification. Historical records are never deleted.

## Files
- `src/app/fees/page.tsx`
- `src/app/calendar/page.tsx`
- `src/app/evaluations/page.tsx`
- `src/app/parent/page.tsx`
- `src/lib/live-store.ts`
- `supabase/migrations/099_definitive_next_term_carry_forward_invoice.sql`
- `supabase/migrations/100_amqm_two_year_progression_and_term_control.sql`
- `supabase/migrations/101_finance_immutable_payments_and_legacy_rebuild.sql`

## Important production note
The database migrations have already been applied to the connected AMQM Supabase project. The application source patch is packaged here for the project repository/deployment pipeline.

The current Supabase project has one critical advisory: `student_fee_credits` has Row Level Security disabled. Do not expose this table through the browser until an authorised policy is designed and enabled.

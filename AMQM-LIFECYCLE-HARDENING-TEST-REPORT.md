# AMQM Lifecycle Hardening — QA Report

## Completed
- Removed legacy automatic academic-term cron execution.
- Calendar automation now manages evaluation campaigns only; it does not advance terms.
- Close Term & Start Next Term now finalizes database report-card snapshots, prepares next-term opening positions, synchronizes next-term invoices, then activates the next term.
- Added report-card `snapshot_data` storage.
- Enabled RLS on `student_fee_credits` with admin/finance policy.
- Public Alumni page now reads published alumni records from Supabase instead of hard-coded demo graduates.
- Added lifecycle static QA script.

## Live database verification
- AMQM Supabase project: active and healthy.
- First Term remains current: 2026-06-06 through 2026-09-18.
- Second Term begins 2026-09-28.
- Legacy `amqm-academic-term-worker` cron is absent.
- `amqm-calendar-automation-hourly` remains active.
- Calendar automation was executed successfully and created the existing Evaluation 1 campaign.
- It no longer pre-creates invalid draft evaluation rows because the Quran position validator requires a real stopping position.
- The current database has 207 active students and 208 approved records for each of Evaluations 1, 2 and 3; the extra approved record is consistent with a student no longer counted as active.
- Close Term was NOT executed against production because doing so would intentionally move the live school from First Term to Second Term before the configured 2026-09-28 start date.

## Automated checks
- `npm run qa:static` — PASS
- `npm run qa:lifecycle` — PASS (11 checks)
- Database function inspection — PASS: no date-based term switch remains inside `close_term_and_start_next`; invoice preparation and report snapshot steps are present.

## Environment limitation
The local environment did not have project dependencies installed. `npm install --ignore-scripts` timed out, so a local Next.js production build/lint could not be independently repeated here. Vercel had already reported the deployment successful before this hardening pass.

# AMQM Report Card — Final Design Patch

This patch replaces only the report-card renderer and the report-card signature lookup migration.

## Files
- `src/app/reports/page.tsx` — new A4 institutional report-card design.
- `supabase/migrations/094_fix_report_card_supervisor_role.sql` — correct signature lookup; class teachers are joined through `class_teachers`, and the School Supervisor is selected by active `job_title = 'School Supervisor'`.

## Important
The database function was also corrected directly in the connected Supabase project during this work. A verification call returned:
- School Supervisor: MUHAMMAD MUBARAK HARUNA (no signature image configured)
- School Director: Musa (signature image configured)

If migration 094 is already recorded as applied in your Supabase migration history, do not try to re-run it manually. The live function has already been corrected.

## Application
Replace the existing `src/app/reports/page.tsx` with the patched file. The rest of the application is unchanged.

The report remains data-driven and uses the existing QR, student, evaluation, Qur'an progress, attendance, class-teacher and signature data.

## Design goals
- Single A4 portrait page
- Formal institutional / Islamic visual language
- Compact evaluation table
- Clear Qur'an memorization journey
- Strong final result block
- Three approval columns
- No invented signatures
- View and Print use the same canonical report HTML
- Print preview re-renders when signature/settings data arrives

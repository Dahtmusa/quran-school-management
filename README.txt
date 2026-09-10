REPORT CARD FINAL REFINEMENT PATCH

Files:
- src/app/reports/page.tsx
- supabase/migrations/094_fix_report_card_supervisor_role.sql

Apply:
1. Replace the existing src/app/reports/page.tsx with this version.
2. Add the migration to supabase/migrations/.
3. Apply migration 094 in Supabase SQL Editor (or your normal migration workflow).
4. Reload the app, generate the report card, and print/export to PDF.

Scope:
- Report card layout only.
- Compact evaluation cards and Hifz statistic tiles.
- Fixed A4 one-page sizing.
- Three approval blocks remain visible.
- Supervisor lookup uses the active profile with job_title = School Supervisor.
- No signatures are invented; signature_data is shown only when configured.
- Existing academic/Qur'an calculations are preserved.

Validation performed here:
- Static QA passed: 114 Surahs, 6236 Ayahs, evaluation approval guards OK,
  graduation completion guards OK, attendance notification gate OK.
- Full Next.js build could not be run because dependencies/node_modules are not
  included in the uploaded project ZIP.

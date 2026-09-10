REPORT CARD PATCH

1. Replace the existing:
   src/app/reports/page.tsx
   with the version in this patch.

2. Add:
   supabase/migrations/094_fix_report_card_supervisor_role.sql

3. Apply migration 094 to the Supabase database before testing the live report card.

Scope: report-card UI/layout and report-card signature lookup only.

AMQM Finance & Fees — Stability Fix

Replace:
  src/app/fees/page.tsx
  src/lib/admin-management-store.ts

Root cause fixed:
- The page subscribed to realtime changes on student_fees.
- sync_student_fee_allocations writes many student_fees rows, which triggered a refresh storm.
- Multiple refreshes could overlap and a late/transient empty response could overwrite valid figures.
- loadFinanceSummary/loadFeeStructures silently converted query errors into empty arrays, making the UI show zeros.

The fix:
- Remove realtime subscription to student_fees.
- Debounce payment realtime refreshes.
- Serialize/ignore stale refresh results with a request sequence.
- Preserve the user's selected term during background refreshes.
- Synchronize each selected term only once per page session.
- Keep existing data when a refresh fails instead of replacing it with zeros.
- Do not show false "no fee structure" warnings while initial data is loading.

No SQL migration is required for this stability fix.
After replacing the two files, run:
  npm run build

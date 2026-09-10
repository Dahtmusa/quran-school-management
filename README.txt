AMQM First Term 2026/27 Historical Evaluation Workflow Patch

Files changed:
supabase/migrations/095_first_term_historical_class_workflow.sql
supabase/migrations/096_historical_approval_position_scope.sql
src/lib/live-store.ts
src/app/teacher/page.tsx
src/app/evaluations/historical/page.tsx

Workflow:
- Teacher enters only each student's First Term ending Surah/Ayah.
- The historical baseline is automatic: An-Nas 114:1 for Nas->Baqarah and Al-Baqarah 2:1 for Baqarah->Nas.
- Eval 3 score is calculated from the existing page-target rule in the teacher UI.
- Eval 2 = Eval 3 / 2; Eval 1 = Eval 3 / 4 (baseline score 0).
- Teacher submits the entire class through one atomic RPC; a failure rolls the whole class back.
- Eval 1 and Eval 2 are derived/approved metadata; Eval 3 waits for Admin approval.
- Admin approves the whole class in one atomic action.
- Only after approval does the student's official current position update, and that approved position is copied to start_surah/start_ayah for the next term.
- Existing approved historical records are not rewritten when another class is approved.

Validation performed:
- Production database function was tested in a transaction with a real 19-student class and then rolled back.
- Teacher-side simulated submission returned 19 students successfully.
- Simulated admin approval returned successfully and showed 19/19 positions carried forward; transaction was rolled back.
- Production data was rechecked after rollback: the tested classes still had 0 new Eval 3 rows.
- Full Next build could not run because node_modules/dependencies are not installed in the working copy. Global TypeScript also reports the expected missing dependency/type errors from the uninstalled project packages.

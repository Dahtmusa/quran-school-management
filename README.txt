AMQM — Historical First Term Evaluation Draft Save

Replace/copy these files into the existing repository:
  src/app/teacher/page.tsx
  src/lib/live-store.ts
  supabase/migrations/095_teacher_historical_eval_drafts.sql

The database migration has already been applied to the production Supabase project.
No manual SQL execution is required.

What this adds:
- Explicit "Save progress" button.
- Immediate local auto-save for every historical-form change.
- Cloud auto-save after a short pause, using the teacher + term as the draft key.
- Restores the newest local/server draft after refresh and logout/login.
- Cloud draft allows continuation after login on another device/browser.
- A newer local draft is automatically synced to the server when the page reopens.
- Teachers can submit any completed student or group; the whole class does not need to be complete.
- Students already submitted are excluded from subsequent partial submissions.
- Remaining unfinished entries stay available for later continuation.

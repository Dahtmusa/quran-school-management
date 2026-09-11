# AMQM Calendar Configuration Fix

## What this fixes
- Loads the already-saved academic year/session dates back into the planner instead of showing blank `Dates not set` fields.
- Loads saved Evaluation 1/2/3 windows back into the correct term accordion.
- Prevents repeated planner saves from inserting duplicate session opening/closing events.
- Prevents duplicate evaluation windows for the same term/evaluation number.
- Associates the surviving 2026/27 calendar markers with the academic year.
- Changes the active-term helper text from automatic date advancement to controlled/manual term closure.

## Important
The live database did not contain Second Term or Third Term evaluation window records at the time this fix was prepared. No dates were invented. After deployment, enter the school's actual missing evaluation dates once; subsequent saves will update the existing records instead of creating duplicates.

## Live database status
Migration 105 was already applied to the connected Supabase production database while diagnosing the issue. Do **not** rerun it there. The source changes still need to be committed/deployed.

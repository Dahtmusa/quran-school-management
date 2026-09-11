# AMQM Full End-to-End Production Audit — 11 September 2026

## Scope

Audited the production database, lifecycle controls, finance carry-forward, academic baseline, attendance, parent linkage, report-card state, calendar configuration, routing/source integrity, and the current admin dashboard semantics.

## Critical findings and fixes

### 1. Admin population figures were operationally wrong
The dashboard was counting all non-deleted students rather than active students.

- Database total: 210 records
- Active students: 207
- Non-active operational records: 3

**Fix:** operational student loaders/dashboard now use active students. The separate Removed-students workflow remains available.

### 2. Staff KPI included parent accounts
The dashboard displayed 14 active profiles as staff. The actual staff population is 12:

- 8 teachers
- 2 administrators
- 1 super administrator
- 1 security staff
- 2 parent profiles excluded from staff totals

**Fix:** dashboard staff KPI excludes parent accounts.

### 3. Attendance KPI was misleading
The old dashboard averaged sparse historical per-student percentages. Only 4 student attendance records exist in the imported First-Term period, so a displayed 2% average did not represent today's school attendance.

**Fix:** dashboard now shows today's recorded attendance coverage and present-equivalent records. If no attendance is recorded today it displays that explicitly instead of implying a 0–2% school attendance rate.

### 4. Evaluation health incorrectly looked like a live digital pipeline
The 624 approved evaluations are historical First-Term records:

- 621 approved records belong to active students
- 3 approved records belong to withdrawn students
- 624 total historical evaluation rows

**Fix:** dashboard labels First Term as the historical baseline instead of presenting these records as live pending/review work.

### 5. Second-Term operational foundation was incomplete
Before this audit:

- Second-Term fee structures: 2
- Second-Term enrollments: 0
- Second-Term primary teacher assignments: 0
- Second-Term evaluation windows persisted: 0/3

**Fix applied live:** Second-Term operational preparation now contains:

- 207/207 student term-enrollment records
- 8 primary teacher/class assignments
- 207 Second-Term student-fee obligations
- Second-Term invoices with carry-forward lines already prepared

The term has **not** been activated.

### 6. Finance dashboard was counting inactive fee rows
The First-Term fee table contained 209 fee rows, including 2 inactive students. Active-student accounting is:

- 207 fee students
- ₦19,980,000 current First-Term obligations
- ₦1,700,000 allocated/recorded payments
- ₦18,280,000 current-term outstanding before any future carry-forward treatment

**Fix:** operational finance queries now exclude inactive students.

### 7. Second-Term carry-forward is present
For the 207 active students, Second-Term invoices currently total ₦38,260,000. This is greater than the new Second-Term fee obligation because the invoices include outstanding previous-term balances.

190 of the 207 active Second-Term invoices contain multiple line items, confirming that the carry-forward structure is being represented separately rather than silently replacing the current-term charge.

### 8. Parent linkage is incomplete
Only 14 of 207 active students currently have a parent linkage. 193 do not.

This is a **launch warning**, not an automatic academic/finance blocker, because parent accounts may still be created/linked. The system must not fabricate parent relationships.

### 9. First-Term report-card snapshots are not finalized yet
207 First-Term report cards exist, but snapshot_data is currently empty because the historical term has not been formally closed/archived.

This is expected. The controlled First-Term closure will create the immutable historical snapshot before Second Term becomes active.

### 10. Calendar evaluation data has a real configuration gap
The production database currently contains only:

- First-Term Evaluation 1

There are currently **0 persisted Second-Term evaluation windows** and **0 Third-Term evaluation windows**.

No dates were invented during the audit. The admin must save the actual Second-Term Evaluation 1–3 dates in Calendar.

### 11. Third-Term fees are not configured
Third Term currently has no fee structures. This is not a blocker for starting Second Term, but it must be completed before Third-Term finance is opened.

## Routing/source audit

The `/fees` and `/evaluations` routes exist in the source and the dashboard links point to valid application routes. No broken static route reference was found.

The generic browser “This page couldn't load” screen shown in the screenshots could not be reproduced from the source/database audit without an authenticated production browser session. The new dashboard/finance changes reduce the known runtime/data hazards. If that screen remains after deploying this patch, the next required evidence is the browser console error or Vercel runtime log for the exact route.

## Database safety

The production audit did **not** activate Second Term.

The new transition function is gated by a digital-launch readiness check. It will not switch the current term until required baseline, enrollment, fee, teacher-assignment and evaluation-window conditions are satisfied.

## Current launch state

**NOT READY YET — intentionally.**

The primary remaining blocker is the missing persisted Second-Term Evaluation 1–3 calendar windows.

Parent links and First-Term attendance history remain warnings that should be completed/improved, but they do not justify fabricating data or prematurely switching the term.

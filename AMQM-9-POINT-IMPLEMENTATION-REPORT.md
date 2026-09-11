# AMQM — 9-Point Production Implementation

## Operating model

First Term is treated as a historical/import baseline. It is not the first digital teaching term.
Second Term is the first fully digital operational term.

The production transition is intentionally controlled. The implementation does **not** automatically close First Term or switch the live school to Second Term.

## Implemented

1. Historical baseline: protected per-student snapshot of Qur'an position, evaluations, finance, attendance and enrollment.
2. Digital academic lifecycle: term-scoped progress and chained approved evaluation positions are retained from the existing lifecycle hardening.
3. Attendance: boarding teachers can record attendance for assigned boarding students; security remains responsible for scan workflows.
4. Finance: carry-forward/immutable payment hardening remains active; admin dashboard finance queries are term-scoped.
5. Report cards: snapshot field and lifecycle hardening are retained for immutable finalized records.
6. Student history: term-scoped student enrollment and teacher assignment history tables added.
7. Parent portal: current-term scoped evaluation loading and existing child-scoped data protections retained.
8. Admin/teacher performance: teacher evaluation loading is current-term/teacher scoped; admin evaluation loading is capped and current-term scoped; operational indexes added.
9. CMS/security: structured `news_posts` source powers public News and homepage; class/staff/alumni deletion paths are archive-oriented; media deletion removes the matching storage/database record; critical changes receive audit entries.

## Live database changes

Migrations 106–108 have been applied to the connected Supabase project.

The historical baseline has been captured for all 207 active students. Readiness currently reports:
- 207 active students
- 207 baseline rows
- 0 missing baselines
- 0 missing Qur'an positions
- First Term configured
- Second Term configured
- ready = true

First Term remains `historical_baseline` and `is_current=true` until the school deliberately chooses the controlled **Start Digital Second Term** action.

## QA

- Existing static QA: PASS
- Lifecycle QA: 11/11 PASS
- Operational QA: 7/7 PASS

## Important

Do not run migrations 102–108 again against the production database. They are already applied. Future schema changes should be new forward migrations.

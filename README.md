# Quran School Management System

A responsive Quran memorization school platform for a two-year programme (Year 1 + Year 2), with Day and Boarding sections.

## Core rules

- Three formal Quran evaluations per term.
- A teacher submission is **not official** until an authorised administrator approves it.
- Only approved evaluations can update the student's official memorization position.
- Only approved evaluations can be included in report cards.
- Evaluation 1, 2 and 3 must all be approved before a term report card can be finalized.
- Year 2 Term 3 graduation requires all three Term 3 evaluations to be approved; the database then transitions the student to Alumni and creates a certificate record.
- Parents only see their own children's protected academic/attendance/fee information.
- Staff/security workflows are role-restricted and auditable.
- Public homepage, leadership, management, staff, alumni and media content is CMS-controlled.
  
## Quran metadata  
 
The application uses `quran-meta` Hafs metadata for exact 604-page Madinah Mushaf page/Juz/Hizb calculations in the UI. The library documents 6,236 ayahs, 604 pages, 30 Juz and 60 Hizbs and provides per-ayah page/Juz/Hizb metadata.

Run:

```bash
npm install
npm run prepare:quran
```

This generates `supabase/seed.sql` with all 6,236 exact verse metadata rows for the database `quran_verses` table. Run the generated seed after migrations when initializing a Supabase project.

## Supabase / Next.js

The production application is designed for Supabase Auth with Next.js SSR using `@supabase/ssr`, with browser and server clients separated. Do not place service/secret keys in browser code.

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## Review mode

The current review pages use local demo state so the UX can be tested before connecting real school data. The Supabase migrations contain the production data model, approval guards, RLS foundations, attendance review workflow, notification outbox, CMS structures and alumni lifecycle.

## Production test order

1. Seed Quran metadata.
2. Create test Admin, Teacher, Parent and Security accounts.
3. Create a test Year 2 student.
4. Submit Evaluation 1/2/3.
5. Verify pending evaluations do not change official progress or reports.
6. Approve each evaluation and verify the official stage advances exactly once.
7. Verify report generation is blocked until all three are approved.
8. Verify Term 3 Year 2 completion creates the Alumni record and certificate record.
9. Test security scan → Admin review → official attendance → SMS outbox.
10. Test CMS changes on mobile and desktop.
11. Test RLS with each role before production deployment.

## QA status — V7 review

Static QA is available with `npm run qa:static`. It validates the bundled 114-surah / 6,236-ayah structure and checks the critical SQL guards for evaluation approval, exact position calculation, graduation completion, and admin-gated attendance notifications.

A full `npm install` / `next build` could not be executed in the sandbox because the package registry was not reachable. This is an environment limitation, not a claim that the production build has passed.

### Critical workflow rules

- Pending, draft, and returned Quran evaluations never advance official student progress.
- Only approved evaluations advance the official memorization position.
- Report-card eligibility requires all three evaluations for the selected term to be approved.
- Year-2 graduation/certificate creation is tied to Term 3, all three approved evaluations, and completion of the configured Quran path; Evaluation 3 is always used as the final position regardless of approval order.
- Security attendance scans are provisional. Parent SMS jobs are created only after administrator approval and only when `notify_parent=true` and the status is not `excused`.

## Production administration

The public homepage is database-driven through `homepage_sections` and `site_settings`. Admins can edit homepage sections, navigation, school/contact settings, public leadership/staff profiles, alumni publishing, and staff account roles from **Website CMS & Staff Management**.

The portal login at `/auth/login` routes users to role-specific dashboards (Admin, Teacher, Parent, Finance, Admissions, Security). Admins can create students directly from **Students** and create staff/teacher/parent accounts through the secure `admin-create-user` Supabase Edge Function.

Classes are shared between Day and Boarding. Each student carries their own Day/Boarding section badge and can be moved between classes/sections by an authorized administrator.

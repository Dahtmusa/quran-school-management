# AMQM Staff Mobile Navigation Fix

Focused UI-only patch for the authenticated staff/teacher/parent mobile navigation.

## Changes
- Reuses the public homepage mobile menu visual language: white drawer, school branding, rounded navigation links, overlay, close button.
- Applies to admin, teachers, finance, admissions, security, parents, and other authenticated roles through the existing role-based links.
- Keeps the existing desktop sidebar/navigation and role permissions unchanged.
- No database, API, finance, academic, attendance, or lifecycle changes.

## Install
Replace only:
`src/components/Topbar.tsx`

No SQL migration is required.

# AMQM Administrator Full Profile Editor

This patch adds a dedicated `/profile` page for `super_admin`, `admin`, and `principal` users.

## Included
- Full-page responsive profile editor using AMQM green/gold/cream visual language.
- Personal/contact fields: full name, phone, profile email, preferred email, username.
- Staff fields: job title, department, joined date, ID expiry, employment status.
- Public professional profile: biography, qualifications, experience, subjects/responsibilities, website visibility.
- Profile photo upload using the existing `school-profile-media` storage bucket.
- Official signature preview and replacement using the existing centralized signature RPC.
- System-managed role, staff ID, scan code, and account metadata shown read-only.
- Profile updates written through a SECURITY DEFINER RPC and recorded in `audit_logs`.
- Topbar administrator "Edit profile" now opens the full profile page.
- `/profile` is protected by the existing server-side role routing.

## Database
Migration `107_admin_full_profile_editor.sql` has already been applied to the connected AMQM Supabase project. Do not rerun it against the same database.

## Scope
This patch intentionally does not modify student, finance, attendance, evaluation, calendar, report-card, CMS, or parent workflows.

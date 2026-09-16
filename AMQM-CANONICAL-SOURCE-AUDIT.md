# AMQM Canonical Student Source Audit — Final

Date: 2026-09-16

## Source of truth
`public.students` is the live source of truth for each student’s start position, memorization direction, current position, current page and current Hizb.

The `get_school_student_directory()` RPC is the canonical read path for admin, teacher and parent student directories.

## Progress
Hifz completion is calculated from the student’s own start position to current position using the student’s direction, with exact 604-page Hafs metadata. Historical evaluation rows remain historical snapshots and do not overwrite the live student profile.

## Report cards
Attendance is no longer displayed on student report cards because the school did not record report-card attendance. No attendance data was deleted from the database.
The previous placeholder book drawing is replaced by the supplied Quran image, with the existing 27mm artwork area retained.

## Parent portal
Parent-linked students now use the same canonical student directory data source rather than a separate nested `students(*)` Quran/profile mapping.

## Legacy compatibility
`src/lib/data.ts` remains for shared types/helpers and legacy/demo compatibility, but production student directories are loaded from the live Supabase store.

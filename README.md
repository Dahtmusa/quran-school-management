# AMQM Mobile Responsive Navigation Patch

Scope: mobile application shell only.

Changes:
- Makes the hamburger control explicitly touch-friendly and accessible.
- Provides a robust mobile navigation drawer for admin/teacher/parent/finance/admissions/security roles.
- Includes the full admin navigation: Dashboard, Students, Classes & Teachers, Staff, Admissions, Attendance, Quran Evaluations, Finance & Fees, Program & Terms, School Calendar, Report Cards, Alumni, Website CMS, User Management.
- Highlights the active route and closes the drawer after navigation.
- Adds Escape-to-close and body scroll locking while the drawer is open.
- Prevents application-shell horizontal overflow on mobile.
- Adds safe-area support for modern mobile browsers.

No database changes. No migrations. No finance/academic/business logic changes.

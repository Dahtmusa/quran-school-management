# AMQM Mobile Navigation Fix

This is a focused production UI fix for the responsive management shell.

Changed only:
- `src/components/AdminShell.tsx`
- `src/components/Topbar.tsx`
- `src/app/globals.css`

## Fixes
- Removes desktop-width leakage/overflow on small screens.
- Makes the mobile navigation a real full-height `100dvh` drawer.
- Ensures navigation items are always visible and scroll independently.
- Keeps the active navigation item clearly highlighted.
- Adds safe-area support for mobile devices.
- Locks background scrolling while the menu is open.
- Supports Escape and overlay close.
- Keeps the existing role-based navigation and links unchanged.
- Does not change database logic, finance calculations, academic logic, routes, permissions, or migrations.

No SQL migration is included or required.

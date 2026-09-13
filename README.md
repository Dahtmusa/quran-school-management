# AMQM Mobile Navigation Fix

Fixes the authenticated mobile navigation drawer in `src/components/Topbar.tsx` only.

- Normalizes role values before selecting navigation links.
- Ensures the mobile drawer renders a usable navigation area.
- Adds active-route highlighting.
- Makes the drawer independently scrollable on small screens.
- Closes the drawer after navigation and when the route changes.
- Keeps View Website and Sign Out in a fixed footer area.

No database migration or finance/academic logic changes are included.

AMQM Mobile Navigation Fix

Scope: mobile navigation only.

Fixes:
- Raises mobile navigation overlay to z-index 9999 and panel to 10000.
- Keeps hamburger trigger above the overlay.
- Ensures click handlers explicitly open/close the mobile menu.
- Adds active navigation state/class for mobile links.
- Adds Escape-key and body-scroll locking while the menu is open.
- Adds accessible dialog semantics and aria-expanded/current state.
- Adds polished active/focus styles.
- Next.js viewport metadata was already present in src/app/layout.tsx, so no duplicate HTML meta tag was added.

No database or migration changes.

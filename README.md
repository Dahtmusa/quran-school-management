# AMQM Finance Dashboard UX / Layout Fix

Scope: `src/app/fees/page.tsx` only.

Fixes:
- Removes the finance page's artificial max-width/white gutters by making the finance canvas full-width inside AdminShell.
- Switches the dashboard to AMQM's green/cream/gold visual language for better readability.
- Keeps the student ledger horizontally scrollable inside its own container so the whole page does not get a horizontal scrollbar.
- Gives the Actions column enough width so `Next Term Invoice` is never clipped.
- Makes Quick Actions real, polished controls and connects them to the relevant student ledger / fee configuration sections with smooth scrolling.
- Improves responsive layout for mobile/tablet/desktop.
- No database changes, migrations, finance calculations, payment logic, carry-forward logic, or other pages are changed.

Deploy this source patch only. No SQL migration is required.

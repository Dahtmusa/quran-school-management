AMQM Finance & Fees v3 patch

Replace:
src/app/fees/page.tsx

Fixes:
- Removes the byStudentAccount temporal-dead-zone/runtime crash caused by status filtering before the map declaration.
- Finance invoice generation/printing uses the currently selected term rather than requiring a future next term.
- Quick invoice actions are no longer disabled simply because there is no next term.
- Finance currency display is normalized to the ₦ symbol instead of NGN.
- Keeps the selected-term carry-forward calculations.
- Keeps the Actions column visible/sticky on narrower screens so Invoice/History/Receipt/Pay are not cut off.

Do not run or modify the carry-forward SQL again for this UI patch.

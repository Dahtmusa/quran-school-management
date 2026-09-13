# AMQM Signature UX Fix

This is a narrowly scoped UI/UX patch for staff signatures.

## Changed files
- `src/components/Topbar.tsx`
- `src/components/SignaturePad.tsx`
- `src/app/teacher/page.tsx`

## Behaviour
- Signature area is collapsible instead of always occupying the profile modal.
- Existing signatures are shown as a compact saved preview.
- `Edit signature` opens a dedicated, larger drawing area.
- Canvas supports mouse, touch and stylus through Pointer Events.
- `Save & Close` saves the new signature, refreshes the saved preview, clears the drawing pad, and closes the editor.
- `Cancel` closes without changing the saved signature.
- The saved signature remains available to the existing report-card signature loader, so report cards use the newly saved signature on subsequent renders.
- No database schema or migration is included.
- No finance, academic, attendance, calendar, or other business logic is changed.

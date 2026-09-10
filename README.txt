AMQM FINAL ID CARD — REFERENCE DESIGN IMPLEMENTATION

Replaces the ID card renderer with the user's approved reference layout:
- Student and staff use the same front/back design system.
- All names display in uppercase with controlled/adaptive sizing.
- School name is never ellipsized.
- QR only; barcode removed.
- Front: logo, AMQM branding, ID badge, photo, name, key fields, QR, ID.
- Back: white layout, Trusted Islamic Education heading, verification QR, validity, director signature/name, contact numbers.
- Decorative green/gold curve is kept away from contact/signature text.
- Student and staff pages load the stored school logo and director signature.
- Staff teaching cards now have a Print ID button.

Replace these files:
  src/lib/id-card.ts
  src/app/students/page.tsx
  src/app/staff/page.tsx

No SQL is required.

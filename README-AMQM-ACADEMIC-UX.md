# AMQM Academic Workflow + ID Cards Update

Implemented for the AMQM Quran school management system:

- One-time current academic Year/Term configuration with automatic date-based progression.
- Current 2026/27 session seeded with Term 1, Term 2 and Term 3.
- Evaluation campaigns remain Admin-created and class-targeted; Admin never enters student results.
- Evaluation 2 cannot open until Evaluation 1 is approved for the selected students; same for Evaluation 3.
- Calendar opening/closing windows control teacher visibility.
- Expired draft evaluations auto-submit to Admin review.
- Five teacher rubrics: Memorization, Accuracy, Fluency, Tajweed, Retention.
- Instant calculation of ayahs/pages/Hizb covered, score and grade.
- Automatic teacher comments with editable generated text.
- Approval advances official Quran position.
- Incremental report cards show approved vs pending evaluations; finalization occurs after all three are approved.
- Parent Quran progress dashboard has percentage/ring, loading bar, ayahs/pages/Hizb remaining and current Juz/Hizb.
- Premium two-sided AMQM Student/Staff ID card with QR + Code128 barcode and expiry date.
- Back side uses Director signature wording.
- Attendance scanner accepts both QR JSON payloads and raw barcode IDs.
- Student and staff ID expiry defaults to the current academic-year end.

Note: full local npm installation timed out in this environment; the package should be verified by the Vercel production build after upload.

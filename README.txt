AMQM Finance & Fees — Design 3 implementation

Replace these two files in the existing project:
1. src/app/fees/page.tsx
2. src/lib/admin-management-store.ts

This implements the Design 3 dark finance dashboard and includes:
- KPI financial overview
- collection trend and payment-status dashboard
- quick actions
- student search and selection
- bulk invoice generation
- bulk invoice printing
- bulk class invoices
- bulk receipts
- bulk class receipts
- improved fee configuration for day/boarding + term + due date
- stable refresh/realtime behavior from the previous finance fix

No SQL migration is required for these frontend/store changes.

Validation performed:
- TypeScript/TSX transpile parse: PASS
- npm run qa:static: PASS

A full Next.js production build could not be run in this environment because node_modules is not present in the supplied project and dependencies are not installed here.

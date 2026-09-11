AMQM Finance Carry-Forward Ledger

Files:
- src/app/fees/page.tsx
- src/lib/admin-management-store.ts
- supabase/migrations/095_term_carry_forward_ledger.sql

INSTALL:
1. Back up the database first.
2. Run migration 095_term_carry_forward_ledger.sql once in Supabase SQL Editor.
3. Replace the two source files above.
4. Run: npm run build
5. Test a student with a previous outstanding balance and record a partial payment in the new term.

BEHAVIOUR:
- Previous term balances remain in their original term.
- The next term shows them as Balance Brought Forward.
- Current term fees are added separately.
- Total Payable = Brought Forward + Current Term Fees.
- Payments recorded in the new term settle the oldest outstanding fee first.
- Outstanding is the remaining balance across brought-forward + current-term obligations.
- No historical fee rows are duplicated.
- Existing term-aware payments are backfilled into payment_allocations without changing existing student_fees amounts.
- Overpayments are retained as student credits rather than silently discarded.

IMPORTANT:
This migration adds an allocation ledger. Do not delete existing student_fees or payments.

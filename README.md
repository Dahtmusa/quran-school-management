# AMQM Director Identity Fix

This is a narrowly scoped production fix.

- Corrects the active profile with job title `School Director` to `ISMAIL ILIYASU DANLADI`.
- Makes report-card signer selection prefer the explicitly configured `School Director` profile instead of an unrelated `super_admin` account.
- No student, finance, academic, attendance, calendar, or other application data is changed.

The SQL migration has already been applied to the connected production Supabase project during this fix. Do not rerun it if you are deploying from the already-updated production database.

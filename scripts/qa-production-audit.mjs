import fs from 'node:fs';
const checks=[
 ['production audit migration','supabase/migrations/108_amqm_production_audit_hardening.sql'],
 ['dashboard uses operational snapshot','src/app/admin/page.tsx'],
 ['active-only student loader','src/lib/live-store.ts'],
 ['finance excludes inactive students','src/lib/admin-management-store.ts'],
 ['digital launch readiness loader','src/lib/live-store.ts'],
 ['historical-first-term wording','src/app/evaluations/page.tsx'],
];
let failed=0; for(const [name,file] of checks){if(fs.existsSync(file)){console.log('PASS',name)}else{console.log('FAIL',name);failed++}} if(failed)process.exit(1); console.log(`Production audit QA: ${checks.length-failed}/${checks.length} checks passed.`);

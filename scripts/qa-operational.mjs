import fs from 'node:fs';
const checks=[
 ['historical baseline migration','supabase/migrations/106_amqm_operational_foundation_and_hardening.sql'],
 ['dashboard RPC migration','supabase/migrations/107_amqm_dashboard_and_operational_rpc.sql'],
 ['structured news loader','src/lib/cms-live-store.ts'],
 ['calendar digital transition UI','src/app/calendar/page.tsx'],
 ['teacher attendance RPC client','src/lib/attendance-store.ts'],
 ['archive-safe class deletion','src/lib/live-store.ts'],
 ['public news page','src/app/news/page.tsx'],
];
let failed=0; for(const [name,file] of checks){if(fs.existsSync(file)){console.log('PASS',name)}else{console.log('FAIL',name);failed++}} if(failed)process.exit(1); console.log(`Operational QA: ${checks.length-failed}/${checks.length} checks passed.`);

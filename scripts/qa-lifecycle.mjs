import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mustExist = [
  'supabase/migrations/102_amqm_lifecycle_hardening.sql',
  'src/app/calendar/page.tsx',
  'src/app/evaluations/page.tsx',
  'src/app/alumni/page.tsx',
  'src/lib/live-store.ts',
];
const checks = [];
for (const file of mustExist) checks.push([file, fs.existsSync(path.join(root,file))]);
const migration = fs.readFileSync(path.join(root,'supabase/migrations/102_amqm_lifecycle_hardening.sql'),'utf8');
checks.push(['no automatic term advancement in lifecycle migration', !migration.includes('current_date > cur.ends_on')]);
checks.push(['controlled close function present', migration.includes('close_term_and_start_next')]);
checks.push(['report-card snapshots present', migration.includes('snapshot_data')]);
checks.push(['next-term invoice preparation present', migration.includes('sync_term_invoices(next_id)')]);
checks.push(['fee-credit RLS present', migration.includes('enable row level security')]);
checks.push(['alumni page uses live loader', fs.readFileSync(path.join(root,'src/app/alumni/page.tsx'),'utf8').includes('loadPublicAlumni')]);
let failed=0; for (const [name,ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok)failed++; }
if(failed) process.exit(1);
console.log(`Lifecycle QA passed: ${checks.length} checks.`);

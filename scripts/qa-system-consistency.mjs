import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
const expect=(ok,msg)=>checks.push([ok,msg]);

const nav=read('src/lib/nav-links.ts');
const topbar=read('src/components/Topbar.tsx');
const calendar=read('src/app/calendar/page.tsx');
const screening=read('src/app/admissions/screening/[token]/page.tsx');
const migration=read('supabase/migrations/20260920150000_continuous_journey_admissions_screening.sql');

expect(!topbar.includes('/program-setup'), 'Topbar has no obsolete Program & Terms link');
expect(topbar.includes("import { roleLinks } from '@/lib/nav-links'"), 'Topbar uses the shared navigation source');
expect(nav.includes("['/calendar', 'School Calendar'"), 'Admin navigation includes School Calendar');
expect(!calendar.match(/two[- ]year/i), 'Calendar has no fixed two-year wording');
expect(screening.includes('min-h-11'), 'Virtual meeting controls are touch-friendly');
expect(screening.includes('facingMode'), 'Virtual meeting requests a mobile-friendly front camera');
expect(screening.includes('pendingIce'), 'Virtual meeting queues early ICE candidates');
expect(screening.includes('NEXT_PUBLIC_WEBRTC_TURN_URL'), 'Virtual meeting supports optional TURN configuration');
expect(migration.includes('screening_token'), 'Remote screening uses unique tokens');
expect(migration.includes("lower(trim(coalesce(a.state,'')))='adamawa'"), 'Screening mode is based on Adamawa residency');

const failed=checks.filter(x=>!x[0]);
if(failed.length){
 console.error('System consistency QA FAILED');
 for(const [,msg] of failed)console.error(' - '+msg);
 process.exit(1);
}
console.log(`System consistency QA PASSED: ${checks.length} checks.`);

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };

const nav = fs.readFileSync(path.join(root, 'src/lib/nav-links.ts'), 'utf8');
const calendar = fs.readFileSync(path.join(root, 'src/app/calendar/page.tsx'), 'utf8');
const adminSetup = fs.readFileSync(path.join(root, 'src/app/program-setup/page.tsx'), 'utf8');
const lifecycle = fs.readFileSync(path.join(root, 'supabase/migrations/20260918123000_academic_session_term_lifecycle_v2.sql'), 'utf8');

expect(!nav.includes("'/program-setup', 'Program & Terms'"), 'Program & Terms must be removed from admin navigation');
expect(nav.includes("'/calendar', 'School Calendar'"), 'School Calendar must remain in admin navigation');
expect(calendar.includes('The Hifz structure is already built in.'), 'Calendar should explain that Hifz structure is built in');
expect(calendar.includes('Create next school year'), 'Calendar should provide a simple next-school-year action');
expect(calendar.includes('Existing students keep their current Quran progress'), 'Calendar must communicate continuous student progress');
expect(!adminSetup.includes('Create current structure'), 'Admin should no longer be offered manual programme structure creation');
expect(!adminSetup.includes('Add year'), 'Admin should no longer be offered manual year creation');
expect(!adminSetup.includes('Add term'), 'Admin should no longer be offered manual term creation');
expect(lifecycle.includes('create or replace function public.amqm_open_session'), 'Session opening function must remain available');
expect(lifecycle.includes("previous academic session") && lifecycle.includes("promoted_year1_to_year2"), 'Returning-student carry-forward logic must remain available');
expect(lifecycle.includes("s.program_year='year_1'"), 'Existing Year 1 students must be carried forward at session opening');
expect(lifecycle.includes('p.closing_surah,p.closing_ayah,p.closing_page,p.closing_hizb'), 'New session opening must preserve last official Quran position');
expect(lifecycle.includes('not exists(select 1 from public.student_term_progress p'), 'New students must not overwrite existing term progress');

if (failures.length) {
  console.error('Academic UX QA FAILED');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('Academic UX QA PASSED');
console.log('Single admin calendar entry point: OK');
console.log('Programme structure hidden from admin workflow: OK');
console.log('Continuous student Quran progress: OK');
console.log('New-session carry-forward safeguards: OK');

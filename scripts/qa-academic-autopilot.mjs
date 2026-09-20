import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };

const nav = fs.readFileSync(path.join(root, 'src/lib/nav-links.ts'), 'utf8');
const calendar = fs.readFileSync(path.join(root, 'src/app/calendar/page.tsx'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'src/app/program-setup/page.tsx'), 'utf8');
const liveStore = fs.readFileSync(path.join(root, 'src/lib/live-store.ts'), 'utf8');
const simpleLifecycle = fs.readFileSync(path.join(root, 'supabase/migrations/20260920132000_simple_continuous_student_calendar_lifecycle.sql'), 'utf8');
const nextYear = fs.readFileSync(path.join(root, 'supabase/migrations/20260920130000_simplified_school_year_creation.sql'), 'utf8');
const evalSql = fs.readFileSync(path.join(root, 'supabase/migrations/002_quran_progress_workflow.sql'), 'utf8');
const gradSql = fs.readFileSync(path.join(root, 'supabase/migrations/005_alumni_lifecycle_and_cms_staff.sql'), 'utf8');

expect(!nav.includes("'/program-setup', 'Program & Terms'"), 'Program & Terms must not be in admin navigation');
expect(nav.includes("'/calendar', 'School Calendar'"), 'School Calendar must remain in admin navigation');
expect(setup.includes("redirect('/calendar')"), 'Old Program & Terms route must redirect to the single calendar setup');
expect(calendar.includes('Hifz structure is built into AMQM'), 'Calendar must explain that Hifz structure is built in');
expect(calendar.includes('Create next school year'), 'Calendar must provide a simple next-year action');
expect(liveStore.includes('export async function createNextSchoolYear'), 'Client store must expose next-year creation');
expect(nextYear.includes('student_progress_unchanged'), 'Next-year creation must explicitly preserve student progress');
expect(nextYear.includes('is_current,lifecycle_status,predecessor_year_id'), 'Next-year creation must remain a scheduled calendar record');
expect(simpleLifecycle.includes('student_records_changed'), 'Simple lifecycle must document non-mutating student transition');
expect(simpleLifecycle.includes("student_promotion',false"), 'Simple lifecycle must explicitly disable student promotion');
expect(simpleLifecycle.includes('quran_progress_changed'), 'Simple lifecycle must explicitly preserve Quran progress');
expect(!simpleLifecycle.includes("set program_year='year_2'"), 'Simple school-year opening must not promote students');
expect(!simpleLifecycle.includes('set class_id=null'), 'Simple school-year opening must not reset student classes');
expect(!simpleLifecycle.includes('delete from public.teacher_students'), 'Simple school-year opening must not delete teacher assignments');
expect(!simpleLifecycle.includes('quran_closing'), 'Simple school-year opening must not rewrite Quran position from historical session data');
expect(evalSql.includes("status='approved'"), 'Evaluation workflow must retain approval guard');
expect(evalSql.includes('Evaluation must start from the student current official memorization position.'), 'Evaluation start-position continuity must remain enforced');
expect(gradSql.includes('final_global = final_required'), 'Graduation must require full Quran completion');

if (failures.length) {
  console.error('Academic autopilot QA FAILED');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('Academic autopilot QA PASSED');
console.log('One admin setup route: OK');
console.log('No manual Program & Terms workflow: OK');
console.log('Next school year creation preserves existing students: OK');
console.log('No promotion/reset on school-year opening: OK');
console.log('Evaluation continuity safeguards: OK');
console.log('Quran completion safeguard: OK');

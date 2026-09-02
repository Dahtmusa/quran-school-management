import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const quranSource = fs.readFileSync(path.join(root, 'src/lib/quran.ts'), 'utf8');
const rows = [...quranSource.matchAll(/\[(\d+),.*?,(\d+),(\d+)\]/g)].map(m => ({id:+m[1], ayahs:+m[2], page:+m[3]}));
const totalAyahs = rows.reduce((n, r) => n + r.ayahs, 0);
const failures = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };

expect(rows.length === 114, `Expected 114 surahs, found ${rows.length}`);
expect(totalAyahs === 6236, `Expected 6236 ayahs, found ${totalAyahs}`);
expect(rows.at(0)?.page === 1, 'Al-Fatihah must start on page 1');
expect(rows.at(-1)?.page === 604, 'An-Nas must end on page 604');

const evalSql = fs.readFileSync(path.join(root, 'supabase/migrations/002_quran_progress_workflow.sql'), 'utf8');
const gradSql = fs.readFileSync(path.join(root, 'supabase/migrations/005_alumni_lifecycle_and_cms_staff.sql'), 'utf8');
const attSql = fs.readFileSync(path.join(root, 'supabase/migrations/003_attendance_staff_cms.sql'), 'utf8');

expect(evalSql.includes("status='approved'"), 'Evaluation approval guard missing');
expect(evalSql.includes('Evaluation must start from the student current official memorization position.'), 'Evaluation start-position lock missing');
expect(evalSql.includes('new.memorized_ayahs := abs(to_global-from_global)+1'), 'Ayah calculation guard missing');
expect(evalSql.includes('new.memorized_pages := abs(to_meta.page-from_meta.page)+1'), 'Page calculation guard missing');
expect(evalSql.includes('new.memorized_hizbs := abs(to_meta.hizb-from_meta.hizb)+1'), 'Hizb calculation guard missing');
expect(gradSql.includes('e.evaluation_number = 3'), 'Graduation must use final Evaluation 3');
expect(gradSql.includes('final_global = final_required'), 'Graduation must require full Quran completion');
expect(attSql.includes('notify_parent boolean not null default true'), 'Attendance parent notification toggle missing');
expect(attSql.includes('if r.notify_parent and r.proposed_status in'), 'Attendance notification approval gate missing');

if (failures.length) {
  console.error('QA FAILED');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('Static QA PASSED');
console.log(`Surahs: ${rows.length}`);
console.log(`Ayahs: ${totalAyahs}`);
console.log('Evaluation approval guards: OK');
console.log('Graduation completion guards: OK');
console.log('Attendance notification gate: OK');

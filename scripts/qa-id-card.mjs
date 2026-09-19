import fs from 'node:fs';

const file='src/lib/id-card.ts';
const source=fs.readFileSync(file,'utf8');
const exact='مركز علي وميمونة لتحفيظ القرآن الكريم';
const legacy=['مركز علي وميمونة لتحفيظ القران الكريم'];

const checks=[
  ['exact Arabic school name is defined', source.includes(`const ARABIC_SCHOOL_NAME='${exact}';`)],
  ['Arabic school name is rendered on front and back', (source.match(/\$\{ARABIC_SCHOOL_NAME\}/g)||[]).length === 2],
  ['same renderer supports student IDs', source.includes("type:'STUDENT'|'STAFF'")],
  ['same renderer supports staff IDs', source.includes("input.type==='STUDENT'?'Student':'Staff'")],
  ['Arabic is explicitly RTL', source.includes('direction:rtl')],
  ['legacy Arabic variants are absent', legacy.every(value => !source.includes(value))],
];

let failed=0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`ID-card Arabic QA: ${checks.length}/${checks.length} checks passed.`);
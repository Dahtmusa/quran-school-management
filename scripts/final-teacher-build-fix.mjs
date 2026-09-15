import fs from 'node:fs';
import { execSync } from 'node:child_process';
const path='src/app/teacher/page.tsx';
let s=fs.readFileSync(path,'utf8');
// Remove every duplicate handler occurrence after the first; keep the first complete implementation.
for (const name of ['handleSaveQuranProfile','handleSetStudentStatus','handleSaveSection','openAddStudent','handleAssign']) {
  const marker='  async function '+name;
  const first=s.indexOf(marker);
  if(first!==-1){
    let second=s.indexOf(marker,first+marker.length);
    while(second!==-1){
      const nextNames=['handleSaveQuranProfile','handleSetStudentStatus','handleSaveSection','openAddStudent','handleAssign'];
      let end=s.length;
      for(const n of nextNames){const p=s.indexOf('  async function '+n,second+marker.length);if(p!==-1&&p<end)end=p;}
      const returnPos=s.indexOf('  return <AdminShell',second);
      if(returnPos!==-1&&returnPos<end)end=returnPos;
      s=s.slice(0,second)+s.slice(end);
      second=s.indexOf(marker,first+marker.length);
    }
  }
}
// The campaign UI still calculates evaluation metrics; restore only that import.
s=s.replace("import { SURAHS, label, absoluteProgress } from '@/lib/quran';", "import { SURAHS, label, absoluteProgress, calculateEvaluation } from '@/lib/quran';");
fs.writeFileSync(path,s);
execSync('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
execSync('git add src/app/teacher/page.tsx && if ! git diff --cached --quiet; then git commit -m "Fix final teacher dashboard build" && git push; fi');

import fs from 'node:fs';
import { execSync } from 'node:child_process';
const path='src/app/teacher/page.tsx';
let s=fs.readFileSync(path,'utf8');
const marker='  async function handleSaveQuranProfile() {';
const first=s.indexOf(marker);
const second=s.indexOf(marker,first+marker.length);
if(second!==-1){
  const end=s.indexOf('  return <AdminShell',second);
  if(end!==-1) s=s.slice(0,second)+s.slice(end);
}
fs.writeFileSync(path,s);
execSync('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
execSync('git add src/app/teacher/page.tsx && if ! git diff --cached --quiet; then git commit -m "Clean up teacher dashboard handlers" && git push; fi');

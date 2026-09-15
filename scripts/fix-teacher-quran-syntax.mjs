import fs from 'node:fs';
import { execSync } from 'node:child_process';
const path='src/app/teacher/page.tsx';
let s=fs.readFileSync(path,'utf8');
s=s.replace("{s.status !== 'active' && <button disabled={busy} className=\"rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700\" onClick={() => handleSetStudentStatus(s,'active')}>Reactivate</button>\n                </div>", "{s.status !== 'active' && <button disabled={busy} className=\"rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700\" onClick={() => handleSetStudentStatus(s,'active')}>Reactivate</button>}\n                </div>");
fs.writeFileSync(path,s);
execSync('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
execSync('git add src/app/teacher/page.tsx && if ! git diff --cached --quiet; then git commit -m "Fix teacher Quran dashboard JSX" && git push; fi');

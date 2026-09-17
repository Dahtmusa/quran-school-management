import fs from 'node:fs';
import { execSync } from 'node:child_process';

const reportPath = 'src/app/reports/page.tsx';
const packagePath = 'package.json';
const scriptPath = 'scripts/oneoff-report-font-fix.mjs';
const baseCommit = 'c48e7f2f5d959a76adc5ac33ae17ccee4d344ea0';

execSync(`git fetch --no-tags origin ${baseCommit} --depth=1`, { stdio: 'inherit' });
const baseReport = execSync(`git show ${baseCommit}:src/app/reports/page.tsx`, { encoding: 'utf8' });
const start = baseReport.indexOf('const PRINT_CSS = `');
const end = baseReport.indexOf('`;\n\nfunction buildFullPageHTML', start);
if (start < 0 || end < 0) throw new Error('PRINT_CSS block not found in known-good report card source');

const block = baseReport.slice(start, end);
const bump = (_match, value) => {
  const raw = Number(value);
  const factor = raw <= 5.5 ? 1.28 : raw <= 7 ? 1.20 : raw <= 10 ? 1.16 : 1.10;
  const scaled = Number((raw * factor).toFixed(1));
  return `font-size:${scaled % 1 === 0 ? scaled.toFixed(0) : scaled}px`;
};

let css = block.replace(/font-size:(\d+(?:\.\d+)?)px/g, bump);
css = css.replace(
  'padding:6mm 6.5mm 0;display:flex;flex-direction:column;gap:2.4mm;',
  'padding:5.5mm 6.5mm 0;display:flex;flex-direction:column;gap:2mm;'
);
css = css.replace(
  'grid-template-columns:1fr 44mm;gap:2.5mm;',
  'grid-template-columns:1fr 44mm;gap:2mm;'
);

fs.writeFileSync(reportPath, baseReport.slice(0, start) + css + baseReport.slice(end));

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (pkg.scripts?.postinstall === 'node scripts/oneoff-report-font-fix.mjs') {
  delete pkg.scripts.postinstall;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}
if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

execSync("git config user.name 'github-actions[bot]' && git config user.email '41898282+github-actions[bot]@users.noreply.github.com'", { stdio: 'inherit' });
execSync('git add src/app/reports/page.tsx package.json', { stdio: 'inherit' });
execSync("git commit -m 'chore: apply corrected readable A4 report card typography'", { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });

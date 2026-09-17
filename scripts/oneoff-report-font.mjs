import fs from 'node:fs';
import { execSync } from 'node:child_process';

const reportPath = 'src/app/reports/page.tsx';
const packagePath = 'package.json';
const scriptPath = 'scripts/oneoff-report-font.mjs';
const report = fs.readFileSync(reportPath, 'utf8');
const marker = '/* AMQM readable A4 typography v1 */';

if (!report.includes(marker)) {
  const start = report.indexOf('const PRINT_CSS = `');
  const end = report.indexOf('`;\n\nfunction buildFullPageHTML', start);
  if (start < 0 || end < 0) throw new Error('PRINT_CSS block not found');

  const block = report.slice(start, end);
  const bump = (match) => {
    const raw = Number(match[1]);
    const factor = raw <= 5.5 ? 1.28 : raw <= 7 ? 1.20 : raw <= 10 ? 1.16 : 1.10;
    return `font-size:${Number((raw * factor).toFixed(1)).toString().replace(/\.0$/, '')}px`;
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
  css += `\n${marker}\n`;
  fs.writeFileSync(reportPath, report.slice(0, start) + css + report.slice(end));
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (pkg.scripts?.postinstall === 'node scripts/oneoff-report-font.mjs') {
  delete pkg.scripts.postinstall;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

execSync("git config user.name 'github-actions[bot]' && git config user.email '41898282+github-actions[bot]@users.noreply.github.com'", { stdio: 'inherit' });
execSync(`git add ${reportPath} ${packagePath} ${scriptPath} 2>/dev/null || true`, { stdio: 'inherit' });
execSync("git add src/app/reports/page.tsx package.json", { stdio: 'inherit' });
execSync("git commit -m 'chore: apply readable A4 report card typography'", { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });

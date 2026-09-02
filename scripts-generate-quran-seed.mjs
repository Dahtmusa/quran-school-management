// Run after npm install: node scripts-generate-quran-seed.mjs
// Generates an exact Hafs 604-page quran_verses seed using quran-meta.
import { mkdir, writeFile } from 'node:fs/promises';
import { getAyahMeta } from 'quran-meta/hafs';

const TOTAL_AYAHS = 6236;
const esc = (v) => String(v).replaceAll("'", "''");
const rows = [];
for (let id = 1; id <= TOTAL_AYAHS; id++) {
  const m = getAyahMeta(id);
  rows.push(`(${m.surah},${m.ayah},${id},${m.page},${m.juz},${m.hizbId})`);
}
await mkdir('supabase', { recursive: true });
const sql = `-- Generated from quran-meta Hafs metadata. Do not hand-edit.\ntruncate table public.quran_verses;\ninsert into public.quran_verses(surah,ayah,global_ayah,page,juz,hizb) values\n${rows.join(',\n')}\non conflict (surah,ayah) do update set global_ayah=excluded.global_ayah,page=excluded.page,juz=excluded.juz,hizb=excluded.hizb;\n`;
await writeFile('supabase/seed.sql', sql);
console.log(`Generated ${TOTAL_AYAHS} exact Hafs verse metadata rows.`);

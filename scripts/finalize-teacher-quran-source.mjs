import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Finalize the teacher dashboard and central live-store mapping in one controlled patch.
let s = fs.readFileSync('src/app/teacher/page.tsx', 'utf8');

// Remove the temporary historical-entry workflow from the teacher dashboard.
const hStart = s.indexOf('  /* ── Historical records section ── */');
const hEnd = s.indexOf('  const surahMap = Object.fromEntries', hStart);
if (hStart !== -1 && hEnd !== -1) s = s.slice(0, hStart) + s.slice(hEnd);
const jsxStart = s.indexOf("    {/* ── Historical Records — pinned near the top so it's easy to find ── */}");
const jsxEnd = s.indexOf('    {/* Campaign evaluation sections */}', jsxStart);
if (jsxStart !== -1 && jsxEnd !== -1) s = s.slice(0, jsxStart) + s.slice(jsxEnd);

// Remove historical-only imports and make the teacher dashboard use canonical live-profile RPCs.
s = s.replace(/, teacherSubmitHistoricalEval3/g, '');
s = s.replace("import { SURAHS, label, calculateEvaluation, progressBetween, positionOrdinal } from '@/lib/quran';", "import { SURAHS, label, absoluteProgress } from '@/lib/quran';");
s = s.replace(
  "import { loadTeacherDirectory, loadTeacherEvaluations, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation, saveMySignature, getMySignature, loadOperationalTerms, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents } from '@/lib/live-store';",
  "import { loadTeacherDirectory, loadTeacherEvaluations, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation, saveMySignature, getMySignature, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents, teacherUpdateStudentQuranProfile, teacherSetStudentStatus } from '@/lib/live-store';"
);

if (!s.includes('quranEditTarget')) {
  const anchor = "  const [editSectionMsg, setEditSectionMsg] = useState('');\n";
  s = s.replace(anchor, anchor + "  const [quranEditTarget, setQuranEditTarget] = useState<any | null>(null);\n  const [quranEditDirection, setQuranEditDirection] = useState<'nas_to_baqarah'|'baqarah_to_nas'>('nas_to_baqarah');\n  const [quranEditSurah, setQuranEditSurah] = useState(114);\n  const [quranEditAyah, setQuranEditAyah] = useState(1);\n  const [quranEditBusy, setQuranEditBusy] = useState(false);\n  const [quranEditMsg, setQuranEditMsg] = useState('');\n");
}

if (!s.includes('handleSaveQuranProfile')) {
  const anchor = "  async function handleSaveSection() {\n";
  const handlers = `  async function handleSaveQuranProfile() {\n    if (!quranEditTarget) return;\n    setQuranEditBusy(true); setQuranEditMsg('');\n    try {\n      await teacherUpdateStudentQuranProfile(quranEditTarget.id, { direction: quranEditDirection, currentSurah: quranEditSurah, currentAyah: quranEditAyah });\n      const fresh = await loadTeacherDirectory();\n      setStudents(fresh);\n      const updated = fresh.find((x:any) => x.id === quranEditTarget.id);\n      if (updated) setSelected(updated);\n      setQuranEditTarget(null);\n      setMessage('Quran profile saved as the official student record.');\n    } catch (e:any) { setQuranEditMsg(e?.message || 'Failed to save Quran profile'); }\n    finally { setQuranEditBusy(false); }\n  }\n\n  async function handleSetStudentStatus(student:any, status:'active'|'suspended'|'withdrawn') {\n    if (status === 'withdrawn' && !window.confirm('Mark this student inactive? All academic and historical records will be preserved.')) return;\n    setBusy(true); setMessage('');\n    try {\n      await teacherSetStudentStatus(student.id, status);\n      const fresh = await loadTeacherDirectory(); setStudents(fresh);\n      if (selected?.id === student.id) setSelected(fresh.find((x:any)=>x.id===student.id) || null);\n      setMessage(status === 'suspended' ? student.name + ' is now frozen.' : status === 'withdrawn' ? student.name + ' is now inactive.' : student.name + ' is active again.');\n    } catch (e:any) { setMessage(e?.message || 'Failed to update student status'); }\n    finally { setBusy(false); }\n  }\n\n`;
  s = s.replace(anchor, handlers + anchor);
}

// Use the exact ayah-based authoritative Quran completion percentage, not Surah-count approximation.
s = s.replace(
  /          const sTot = sBtoN \? Math\.max\(1, 114 - startSurahId\) : Math\.max\(1, startSurahId - 2\);\n          const sDone = sBtoN \? Math\.max\(0, currSurahId - startSurahId\) : Math\.max\(0, startSurahId - currSurahId\);\n          const sPct = Math\.min\(100, Math\.round\(\(sDone \/ sTot\) \* 100\)\);/,
  "          const canonicalProgress = absoluteProgress({ surah: currSurahId, ayah: Number(s.current?.ayah || 1) }, s.direction);\n          const sPct = Math.min(100, Math.max(0, Math.round(canonicalProgress.percent)));"
);

// Add official Quran editing and status controls to the main teacher student table.
const oldActions = /                  <button className="rounded-xl bg-teal-50[\s\S]*?                  <\/button>\n                  <button className="rounded-xl bg-slate-100[\s\S]*?                  <\/button>/;
const newActions = `                  <button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 transition-colors" onClick={() => {\n                    setQuranEditTarget(s);\n                    setQuranEditDirection(s.direction === 'Baqarah-to-Nas' ? 'baqarah_to_nas' : 'nas_to_baqarah');\n                    setQuranEditSurah(Number(s.current?.surah || s.start?.surah || 114));\n                    setQuranEditAyah(Number(s.current?.ayah || s.start?.ayah || 1));\n                    setQuranEditMsg('');\n                  }}>Edit Quran</button>\n                  <button className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors" onClick={() => { setSelected(s); setSelectedTab('academic'); }}>Profile</button>\n                  {s.status === 'active' && <button disabled={busy} className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700" onClick={() => handleSetStudentStatus(s,'suspended')}>Freeze</button>}\n                  {s.status === 'active' && <button disabled={busy} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700" onClick={() => handleSetStudentStatus(s,'withdrawn')}>Inactive</button>}\n                  {s.status !== 'active' && <button disabled={busy} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700" onClick={() => handleSetStudentStatus(s,'active')}>Reactivate</button>`;
s = s.replace(oldActions, newActions);

if (!s.includes('Authoritative Quran profile modal')) {
  const anchor = "    {/* Edit section modal */}\n";
  const modal = `    {/* Authoritative Quran profile modal */}\n    {quranEditTarget && (\n      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">\n        <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">\n          <div className="flex items-center justify-between"><div><h3 className="text-xl font-black">Edit official Quran profile</h3><p className="text-xs text-slate-500">{quranEditTarget.name} · {quranEditTarget.admissionNo}</p></div><button className="btn bg-slate-100" onClick={()=>setQuranEditTarget(null)}>Close</button></div>\n          <div className="mt-5 grid gap-4 sm:grid-cols-3">\n            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Direction<select className="input mt-1 w-full" value={quranEditDirection} onChange={e=>setQuranEditDirection(e.target.value as any)}><option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option></select></label>\n            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Surah<select className="input mt-1 w-full" value={quranEditSurah} onChange={e=>{setQuranEditSurah(Number(e.target.value));setQuranEditAyah(1)}}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select></label>\n            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Ayah<select className="input mt-1 w-full" value={quranEditAyah} onChange={e=>setQuranEditAyah(Number(e.target.value))}>{Array.from({length:SURAHS.find(x=>x.id===quranEditSurah)?.ayahs||286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>\n          </div>\n          {quranEditMsg && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{quranEditMsg}</div>}\n          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">This is the student's official live Quran record. Saving updates the central student record and automatically recalculates the Mushaf page and Hizb. The same record is used across student profiles, teachers, admins, parents and report cards.</div>\n          <div className="mt-5 flex justify-end gap-2"><button className="btn bg-slate-100" onClick={()=>setQuranEditTarget(null)}>Cancel</button><button className="btn btn-primary" disabled={quranEditBusy} onClick={handleSaveQuranProfile}>{quranEditBusy?'Saving…':'Save official record'}</button></div>\n        </div>\n      </div>\n    )}\n\n`;
  s = s.replace(anchor, modal + anchor);
}

fs.writeFileSync('src/app/teacher/page.tsx', s);

// Add canonical live-store wrappers if they are not already present.
const livePath = 'src/lib/live-store.ts';
let live = fs.readFileSync(livePath, 'utf8');
if (!live.includes('export async function teacherUpdateStudentQuranProfile')) {
  const anchor = "export async function teacherUpdateStudentSection(studentId: string, section: 'day' | 'boarding') {\n";
  const insert = `export async function teacherUpdateStudentQuranProfile(studentId: string, input: { direction: 'nas_to_baqarah'|'baqarah_to_nas'; currentSurah: number; currentAyah: number }) {\n  const { error } = await supabase().rpc('teacher_update_student_quran_profile', { p_student_id: studentId, p_direction: input.direction, p_current_surah: input.currentSurah, p_current_ayah: input.currentAyah });\n  if (error) throw error;\n}\n\nexport async function teacherSetStudentStatus(studentId: string, status: 'active'|'suspended'|'withdrawn') {\n  const { error } = await supabase().rpc('teacher_set_student_status', { p_student_id: studentId, p_status: status });\n  if (error) throw error;\n}\n\n`;
  live = live.replace(anchor, insert + anchor);
  fs.writeFileSync(livePath, live);
}

execSync('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
execSync('git add src/app/teacher/page.tsx src/lib/live-store.ts && if ! git diff --cached --quiet; then git commit -m "Finalize teacher Quran records as source of truth" && git push; fi');

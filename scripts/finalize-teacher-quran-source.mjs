import fs from 'node:fs';
import { execSync } from 'node:child_process';

const path = 'src/app/teacher/page.tsx';
let s = fs.readFileSync(path, 'utf8');

// Remove the temporary historical-entry workflow from the teacher dashboard.
const hStart = s.indexOf('  /* ── Historical records section ── */');
const hEnd = s.indexOf('  const surahMap = Object.fromEntries', hStart);
if (hStart !== -1 && hEnd !== -1) {
  s = s.slice(0, hStart) + s.slice(hEnd);
}
const jsxStart = s.indexOf('    {/* ── Historical Records — pinned near the top so it\'s easy to find ── */}');
const jsxEnd = s.indexOf('    {/* Campaign evaluation sections */}', jsxStart);
if (jsxStart !== -1 && jsxEnd !== -1) {
  s = s.slice(0, jsxStart) + s.slice(jsxEnd);
}

// Remove imports that only belonged to historical setup calculations.
s = s.replace(/, teacherSubmitHistoricalEval3/g, '');
s = s.replace(/, calculateEvaluation, progressBetween, positionOrdinal/g, '');

// Add the authoritative live-profile functions and progress helper import.
s = s.replace(
  "import { loadTeacherDirectory, loadTeacherEvaluations, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation, saveMySignature, getMySignature, loadOperationalTerms, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents } from '@/lib/live-store';",
  "import { loadTeacherDirectory, loadTeacherEvaluations, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation, saveMySignature, getMySignature, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents, teacherUpdateStudentQuranProfile, teacherSetStudentStatus } from '@/lib/live-store';"
);
s = s.replace(
  "import { automatedComment } from '@/lib/data';",
  "import { automatedComment } from '@/lib/data';"
);
s = s.replace(
  "import { SURAHS, label } from '@/lib/quran';",
  "import { SURAHS, label, absoluteProgress } from '@/lib/quran';"
);

// Add live Quran edit/status state beside the existing section-edit state.
const sectionAnchor = "  const [editSectionMsg, setEditSectionMsg] = useState('');\n";
if (!s.includes('quranEditTarget')) {
  s = s.replace(sectionAnchor, sectionAnchor + "  const [quranEditTarget, setQuranEditTarget] = useState<any | null>(null);\n  const [quranEditDirection, setQuranEditDirection] = useState<'nas_to_baqarah'|'baqarah_to_nas'>('nas_to_baqarah');\n  const [quranEditSurah, setQuranEditSurah] = useState(114);\n  const [quranEditAyah, setQuranEditAyah] = useState(1);\n  const [quranEditBusy, setQuranEditBusy] = useState(false);\n  const [quranEditMsg, setQuranEditMsg] = useState('');\n");
}

// Add canonical save/status handlers before the existing section-save handler.
const handlerAnchor = "  async function handleSaveSection() {\n";
if (!s.includes('handleSaveQuranProfile')) {
  const handlers = `  async function handleSaveQuranProfile() {\n    if (!quranEditTarget) return;\n    setQuranEditBusy(true); setQuranEditMsg('');\n    try {\n      await teacherUpdateStudentQuranProfile(quranEditTarget.id, {\n        direction: quranEditDirection, currentSurah: quranEditSurah, currentAyah: quranEditAyah,\n      });\n      const [fresh] = await Promise.all([loadTeacherDirectory(), loadTeacherEvaluations()]);\n      setStudents(fresh);\n      const updated = fresh.find((x:any) => x.id === quranEditTarget.id);\n      if (updated) setSelected(updated);\n      setQuranEditTarget(null);\n      setMessage('Quran profile saved as the official student record.');\n    } catch (e:any) {\n      setQuranEditMsg(e?.message || 'Failed to save Quran profile');\n    } finally { setQuranEditBusy(false); }\n  }\n\n  async function handleSetStudentStatus(student:any, status:'active'|'suspended'|'withdrawn') {\n    if (status === 'withdrawn' && !window.confirm('Mark this student inactive? All academic and historical records will be preserved.')) return;\n    setBusy(true); setMessage('');\n    try {\n      await teacherSetStudentStatus(student.id, status);\n      const fresh = await loadTeacherDirectory(); setStudents(fresh);\n      if (selected?.id === student.id) setSelected(fresh.find((x:any)=>x.id===student.id) || null);\n      setMessage(status === 'suspended' ? `${student.name} is now frozen.` : status === 'withdrawn' ? `${student.name} is now inactive.` : `${student.name} is active again.`);\n    } catch (e:any) { setMessage(e?.message || 'Failed to update student status'); }\n    finally { setBusy(false); }\n  }\n\n`;
  s = s.replace(handlerAnchor, handlers + handlerAnchor);
}

// Replace the old approximate Surah-only progress calculation in the table with the canonical ayah-based calculation.
const oldProgress = /          const sTot = sBtoN \? Math\.max\(1, 114 - startSurahId\) : Math\.max\(1, startSurahId - 2\);\n          const sDone = sBtoN \? Math\.max\(0, currSurahId - startSurahId\) : Math\.max\(0, startSurahId - currSurahId\);\n          const sPct = Math\.min\(100, Math\.round\(\(sDone \/ sTot\) \* 100\)\);/;
s = s.replace(oldProgress, "          const canonicalProgress = absoluteProgress({ surah: currSurahId, ayah: Number(s.current?.ayah || 1) }, s.direction);\n          const sPct = Math.min(100, Math.max(0, Math.round(canonicalProgress.percent)));" );

// Replace actions with Quran edit + freeze/inactive controls.
const oldActions = /                  <button className=\"rounded-xl bg-teal-50[\\s\\S]*?                  <\\/button>\n                  <button className=\"rounded-xl bg-slate-100[\\s\\S]*?                  <\\/button>/;
const newActions = `                  <button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 transition-colors" onClick={() => {\n                    setQuranEditTarget(s);\n                    setQuranEditDirection(s.direction === 'Baqarah-to-Nas' ? 'baqarah_to_nas' : 'nas_to_baqarah');\n                    setQuranEditSurah(Number(s.current?.surah || s.start?.surah || 114));\n                    setQuranEditAyah(Number(s.current?.ayah || s.start?.ayah || 1));\n                    setQuranEditMsg('');\n                  }}>Edit Quran</button>\n                  <button className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors" onClick={() => { setSelected(s); setSelectedTab('academic'); }}>Profile</button>\n                  {s.status === 'active' && <button disabled={busy} className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700" onClick={() => handleSetStudentStatus(s,'suspended')}>Freeze</button>}\n                  {s.status === 'active' && <button disabled={busy} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700" onClick={() => handleSetStudentStatus(s,'withdrawn')}>Inactive</button>}\n                  {s.status !== 'active' && <button disabled={busy} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700" onClick={() => handleSetStudentStatus(s,'active')}>Reactivate</button>}`;
s = s.replace(oldActions, newActions);

// Insert the Quran edit modal immediately before the existing section modal.
const modalAnchor = "    {/* Edit section modal */}\n";
if (!s.includes('quranEditTarget &&')) {
  const modal = `    {/* Authoritative Quran profile modal */}\n    {quranEditTarget && (\n      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">\n        <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">\n          <div className="flex items-center justify-between">\n            <div><h3 className="text-xl font-black">Edit official Quran profile</h3><p className="text-xs text-slate-500">{quranEditTarget.name} · {quranEditTarget.admissionNo}</p></div>\n            <button className="btn bg-slate-100" onClick={() => setQuranEditTarget(null)}>Close</button>\n          </div>\n          <div className="mt-5 grid gap-4 sm:grid-cols-3">\n            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Direction\n              <select className="input mt-1 w-full" value={quranEditDirection} onChange={e=>setQuranEditDirection(e.target.value as any)}>\n                <option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option>\n              </select>\n            </label>\n            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Surah\n              <select className="input mt-1 w-full" value={quranEditSurah} onChange={e=>{setQuranEditSurah(Number(e.target.value));setQuranEditAyah(1)}}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select>\n            </label>\n            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Ayah\n              <select className="input mt-1 w-full" value={quranEditAyah} onChange={e=>setQuranEditAyah(Number(e.target.value))}>{Array.from({length:SURAHS.find(x=>x.id===quranEditSurah)?.ayahs || 286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select>\n            </label>\n          </div>\n          {quranEditMsg && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{quranEditMsg}</div>}\n          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">This is the student's official live Quran record. Saving updates the central student record and automatically recalculates the Mushaf page and Hizb. The same record is used by student profiles, teachers, admins, parents and report cards.</div>\n          <div className="mt-5 flex justify-end gap-2"><button className="btn bg-slate-100" onClick={()=>setQuranEditTarget(null)}>Cancel</button><button className="btn btn-primary" disabled={quranEditBusy} onClick={handleSaveQuranProfile}>{quranEditBusy?'Saving…':'Save official record'}</button></div>\n        </div>\n      </div>\n    )}\n\n`;
  s = s.replace(modalAnchor, modal + modalAnchor);
}

fs.writeFileSync(path, s);
execSync('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
execSync('git add src/app/teacher/page.tsx && git diff --cached --quiet || (git commit -m "Finalize teacher Quran records as source of truth" && git push)');

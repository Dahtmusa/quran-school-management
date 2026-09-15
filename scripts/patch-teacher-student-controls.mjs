import fs from 'node:fs';

const teacherPath = 'src/app/teacher/page.tsx';
const storePath = 'src/lib/live-store.ts';
let page = fs.readFileSync(teacherPath, 'utf8');
let store = fs.readFileSync(storePath, 'utf8');

page = page.replace(
  'teacherSubmitHistoricalEval3, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents',
  'teacherSubmitHistoricalEval3, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents, teacherUpdateStudentQuranProfile, teacherSetStudentStatus'
);
page = page.replace(
  "const [editSectionMsg, setEditSectionMsg] = useState('');",
  "const [editSectionMsg, setEditSectionMsg] = useState('');\n  const [studentEditOpen, setStudentEditOpen] = useState(false);\n  const [studentEdit, setStudentEdit] = useState<any>(null);\n  const [studentEditBusy, setStudentEditBusy] = useState(false);\n  const [studentEditMsg, setStudentEditMsg] = useState('');\n  const [statusBusy, setStatusBusy] = useState(false);"
);
const oldProgress = `          const sBtoN = s.direction === 'Baqarah-to-Nas';
          const startSurahId = s.start?.surah || (sBtoN ? 2 : 114);
          const currSurahId  = s.current?.surah || startSurahId;
          const startName = SURAHS.find(x => x.id === startSurahId)?.name ?? \`Surah \${startSurahId}\`;
          const currName  = SURAHS.find(x => x.id === currSurahId)?.name  ?? \`Surah \${currSurahId}\`;
          const sTot = sBtoN ? Math.max(1, 114 - startSurahId) : Math.max(1, startSurahId - 2);
          const sDone = sBtoN ? Math.max(0, currSurahId - startSurahId) : Math.max(0, startSurahId - currSurahId);
          const sPct = Math.min(100, Math.round((sDone / sTot) * 100));`;
const newProgress = `          const sBtoN = s.direction === 'Baqarah-to-Nas';
          const startSurahId = Number(s.start?.surah || (sBtoN ? 2 : 114));
          const currSurahId  = Number(s.current?.surah || startSurahId);
          const startAyah = Number(s.start?.ayah || 1);
          const currAyah = Number(s.current?.ayah || 1);
          const startName = SURAHS.find(x => x.id === startSurahId)?.name ?? \`Surah \${startSurahId}\`;
          const currName  = SURAHS.find(x => x.id === currSurahId)?.name  ?? \`Surah \${currSurahId}\`;
          const startPos = positionOrdinal({surah:startSurahId, ayah:startAyah});
          const currPos = positionOrdinal({surah:currSurahId, ayah:currAyah});
          const endPos = positionOrdinal({surah:sBtoN ? 114 : 2, ayah:1});
          const totalDistance = Math.abs(endPos - startPos);
          const movedDistance = sBtoN ? Math.max(0, currPos - startPos) : Math.max(0, startPos - currPos);
          const sPct = totalDistance > 0 ? Math.min(100, Math.round((movedDistance / totalDistance) * 100)) : 0;`;
if (!page.includes(oldProgress)) throw new Error('Teacher progress block not found');
page = page.replace(oldProgress, newProgress);
const oldProfileButton = `                  <button className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors" onClick={() => { setSelected(s); setSelectedTab('academic'); }}>
                    Profile
                  </button>`;
const newButtons = `                  <button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 transition-colors" onClick={() => { setStudentEdit({ ...s, directionValue: s.direction === 'Nas-to-Baqarah' ? 'nas_to_baqarah' : 'baqarah_to_nas', currentSurah: Number(s.current?.surah || s.start?.surah || 2), currentAyah: Number(s.current?.ayah || s.start?.ayah || 1) }); setStudentEditMsg(''); setStudentEditOpen(true); }}>
                    Edit Quran
                  </button>
                  <button className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors" onClick={() => { setSelected(s); setSelectedTab('academic'); }}>
                    Profile
                  </button>
                  {s.status === 'active' ? <button className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100 transition-colors" disabled={statusBusy} onClick={async()=>{setStatusBusy(true);try{await teacherSetStudentStatus(s.id,'suspended');await refresh();setMessage(\`${s.name} has been frozen.\`)}catch(e:any){setMessage(e?.message||'Unable to freeze student.')}finally{setStatusBusy(false)}}}>Freeze</button> : <button className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-100 transition-colors" disabled={statusBusy} onClick={async()=>{setStatusBusy(true);try{await teacherSetStudentStatus(s.id,'active');await refresh();setMessage(\`${s.name} is active again.\`)}catch(e:any){setMessage(e?.message||'Unable to reactivate student.')}finally{setStatusBusy(false)}}}>Reactivate</button>}
                  {s.status === 'active' && <button className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100 transition-colors" disabled={statusBusy} onClick={async()=>{if(!window.confirm(\`Make \${s.name} inactive? Their records will be preserved.\`))return;setStatusBusy(true);try{await teacherSetStudentStatus(s.id,'withdrawn');await refresh();setMessage(\`${s.name} is now inactive.\`)}catch(e:any){setMessage(e?.message||'Unable to make student inactive.')}finally{setStatusBusy(false)}}}>Inactive</button>}`;
if (!page.includes(oldProfileButton)) throw new Error('Teacher profile button not found');
page = page.replace(oldProfileButton, newButtons);
const profileMarker = '    {/* Profile modal */}';
const editor = `    {studentEditOpen && studentEdit && <Modal title={\`Edit Quran profile — \${studentEdit.name}\`} close={() => setStudentEditOpen(false)}>
      <p className="text-xs text-slate-500">Teachers can update only the student's Quran direction and current memorization position. Personal details remain admin-controlled.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-xs font-black uppercase tracking-wide text-slate-500">Direction
          <select className="input mt-1 w-full" value={studentEdit.directionValue} onChange={e=>setStudentEdit((x:any)=>({...x,directionValue:e.target.value}))}>
            <option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option>
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Surah
          <select className="input mt-1 w-full" value={studentEdit.currentSurah} onChange={e=>setStudentEdit((x:any)=>({...x,currentSurah:Number(e.target.value),currentAyah:1}))}>
            {SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Ayah
          <select className="input mt-1 w-full" value={studentEdit.currentAyah} onChange={e=>setStudentEdit((x:any)=>({...x,currentAyah:Number(e.target.value)}))}>
            {Array.from({length:(SURAHS.find(x=>x.id===Number(studentEdit.currentSurah))?.ayahs||286)},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {studentEditMsg && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{studentEditMsg}</div>}
      <div className="mt-6 flex justify-end gap-2"><button className="btn bg-slate-100" onClick={()=>setStudentEditOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={studentEditBusy} onClick={async()=>{setStudentEditBusy(true);setStudentEditMsg('');try{await teacherUpdateStudentQuranProfile(studentEdit.id,{direction:studentEdit.directionValue,currentSurah:Number(studentEdit.currentSurah),currentAyah:Number(studentEdit.currentAyah)});await refresh();setStudentEditOpen(false);setMessage(\`${studentEdit.name} Quran profile updated.\`)}catch(e:any){setStudentEditMsg(e?.message||'Unable to save Quran profile.')}finally{setStudentEditBusy(false)}}}>{studentEditBusy?'Saving…':'Save changes'}</button></div>
    </Modal>}

`;
if (!page.includes(profileMarker)) throw new Error('Profile modal marker not found');
page = page.replace(profileMarker, editor + profileMarker);

const storeAnchor = `export async function teacherUpdateStudentSection(studentId: string, section: 'day' | 'boarding') {`;
const storeInsert = `export async function teacherUpdateStudentQuranProfile(studentId: string, input: { direction: 'nas_to_baqarah' | 'baqarah_to_nas'; currentSurah: number; currentAyah: number }) {
  const { error } = await supabase().rpc('teacher_update_student_quran_profile', {
    p_student_id: studentId, p_direction: input.direction, p_current_surah: input.currentSurah, p_current_ayah: input.currentAyah,
  });
  if (error) throw error;
}

export async function teacherSetStudentStatus(studentId: string, status: 'active' | 'suspended' | 'withdrawn') {
  const { error } = await supabase().rpc('teacher_set_student_status', { p_student_id: studentId, p_status: status });
  if (error) throw error;
}

`;
if (!store.includes(storeAnchor)) throw new Error('Store anchor not found');
store = store.replace(storeAnchor, storeInsert + storeAnchor);

fs.writeFileSync(teacherPath, page);
fs.writeFileSync(storePath, store);
console.log('Teacher controls patch applied.');

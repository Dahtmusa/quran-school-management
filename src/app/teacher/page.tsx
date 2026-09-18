'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import QuranProgress from '@/components/QuranProgress';
import { loadTeacherDirectory, loadTeacherEvaluations, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation, saveMySignature, getMySignature, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents, teacherUpdateStudentQuranProfile, teacherSetStudentStatus } from '@/lib/live-store';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';
import { SURAHS, label, progressBetween, calculateEvaluation } from '@/lib/quran';
import { automatedComment } from '@/lib/data';
import { loadTeacherBoardingAttendanceToday, recordTeacherBoardingAttendance, type TeacherBoardingAttendanceRow } from '@/lib/attendance-store';
import { useEffect, useMemo, useRef, useState } from 'react';

type EvalForm = { toSurah: number; toAyah: number; mem: number; acc: number; flu: number; taj: number; ret: number; comment: string; };

function loadDraft(evalId: string): EvalForm | null {
  try { const x = localStorage.getItem(`eval_${evalId}`); return x ? JSON.parse(x) : null; } catch { return null; }
}
function saveDraft(evalId: string, form: EvalForm) {
  try { localStorage.setItem(`eval_${evalId}`, JSON.stringify(form)); } catch {}
}
function clearDraft(evalId: string) {
  try { localStorage.removeItem(`eval_${evalId}`); } catch {}
}

export default function TeacherDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'academic'|'personal'|'contacts'>('academic');
  const [profileOpen, setProfileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, EvalForm>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [mySig, setMySig] = useState<any|null>(null);
  const [sigBusy, setSigBusy] = useState(false);
  const [sigMsg, setSigMsg] = useState('');
  const [sigOpen, setSigOpen] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [boardingAttendance, setBoardingAttendance] = useState<TeacherBoardingAttendanceRow[]>([]);
  const [studentView, setStudentView] = useState<'all'|'day'|'boarding'>('all');
  const sigPadRef = useRef<SignaturePadRef|null>(null);

  const [editSectionTarget, setEditSectionTarget] = useState<any | null>(null);
  const [editSectionValue, setEditSectionValue] = useState<'day'|'boarding'>('day');
  const [editSectionBusy, setEditSectionBusy] = useState(false);
  const [editSectionMsg, setEditSectionMsg] = useState('');
  const [quranEditTarget, setQuranEditTarget] = useState<any | null>(null);
  const [quranEditDirection, setQuranEditDirection] = useState<'nas_to_baqarah'|'baqarah_to_nas'>('nas_to_baqarah');
  const [quranEditStartSurah, setQuranEditStartSurah] = useState(114);
  const [quranEditStartAyah, setQuranEditStartAyah] = useState(1);
  const [quranEditSurah, setQuranEditSurah] = useState(114);
  const [quranEditAyah, setQuranEditAyah] = useState(1);
  const [quranEditBusy, setQuranEditBusy] = useState(false);
  const [quranEditMsg, setQuranEditMsg] = useState('');
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [addBusy, setAddBusy] = useState<string | null>(null);
  const [addMsg, setAddMsg] = useState('');

  const refresh = async () => {
    const [studentRows, evaluationRows, attendanceRows] = await Promise.all([
      loadTeacherDirectory(),
      loadTeacherEvaluations(),
      loadTeacherBoardingAttendanceToday(),
    ]);
    setStudents(studentRows);
    setEvaluations(evaluationRows);
    setBoardingAttendance(attendanceRows);
    return studentRows;
  };
  useEffect(() => { refresh(); getCurrentProfile().then(setMe); }, []);
  useEffect(() => {
    getMySignature().then(sig => { setMySig(sig.signature_data ? sig : null); setSigOpen(!sig.signature_data); });
  }, []);

  useEffect(() => {
    const active = evaluations.filter((ev:any) => ev.status === 'draft' || ev.status === 'returned');
    setForms(prev => {
      const next = { ...prev };
      for (const ev of active) {
        if (next[ev.id]) continue;
        const saved = loadDraft(ev.id);
        next[ev.id] = saved ?? {
          toSurah: Number(ev.to_surah || ev.students?.current_surah || 2),
          toAyah: Number(ev.to_ayah || ev.students?.current_ayah || 1),
          mem: Number(ev.memorization_score || 4), acc: Number(ev.accuracy_score || 4),
          flu: Number(ev.fluency_score || 4), taj: Number(ev.tajweed_score || 4), ret: Number(ev.retention_score || 4), comment: ev.teacher_comment || '',
        };
      }
      return next;
    });
  }, [evaluations]);

  const activeEvals = useMemo(() => evaluations.filter((ev:any) => ev.status === 'draft' || ev.status === 'returned'), [evaluations]);
  const byCampaign = useMemo(() => {
    const map = new Map<string,{campaign:any;evals:any[]}>();
    for (const ev of activeEvals) { const cid=ev.campaign_id || 'none'; if(!map.has(cid)) map.set(cid,{campaign:ev.evaluation_campaigns,evals:[]}); map.get(cid)!.evals.push(ev); }
    return [...map.values()];
  }, [activeEvals]);
  function updateForm(evalId:string, updates:Partial<EvalForm>) {
    setForms(prev => { const next={...prev,[evalId]:{...prev[evalId],...updates}}; saveDraft(evalId,next[evalId]); return next; });
  }
  function hasMoved(ev:any):boolean {
    const f=forms[ev.id]; if(!f) return false; const dir=ev.students?.memorization_direction;
    const fs=Number(ev.from_surah), fa=Number(ev.from_ayah);
    if(dir==='baqarah_to_nas') return f.toSurah>fs || (f.toSurah===fs && f.toAyah>fa);
    return f.toSurah<fs || (f.toSurah===fs && f.toAyah<fa);
  }
  async function submitClass(campaignEvals:any[]) {
    if(!campaignEvals.every((ev:any)=>hasMoved(ev))){setMessage('All students must have a valid stopping position before you can submit the class evaluation.');return;}
    setBusy(true);setMessage('');
    try{ for(const ev of campaignEvals){ const f=forms[ev.id]; const score=Math.round(((f.mem+f.acc+f.flu+f.taj+f.ret)/25)*100); await submitTeacherEvaluation({evaluationId:ev.id,toSurah:f.toSurah,toAyah:f.toAyah,memorization:f.mem,accuracy:f.acc,fluency:f.flu,tajweed:f.taj,retention:f.ret,score,comment:f.comment}); clearDraft(ev.id); } setForms({}); await refresh(); setMessage('Class evaluation submitted to Admin for review.'); }
    catch(err:any){setMessage(err?.message || 'Submission failed.');} finally{setBusy(false);}
  }
  async function uploadPhoto(file:File|null){ if(!file)return; setBusy(true); try{const url=await uploadProfileImage(file,'staff');setMe((x:any)=>({...x,avatar_url:url}));await updateOwnProfile({avatar_url:url});setMessage('Profile photo updated.');}catch(e:any){setMessage(e?.message||'Photo upload failed');}finally{setBusy(false);} }
  async function markBoardingAttendance(studentId:string,status:'present'|'late'|'absent'|'excused'|'sick'){
    setAttendanceBusy(true);
    setMessage('');
    try{
      await recordTeacherBoardingAttendance(studentId,status);
      const fresh=await loadTeacherBoardingAttendanceToday();
      setBoardingAttendance(fresh);
      const row=fresh.find((x:any)=>x.studentId===studentId);
      setMessage(row ? `${row.fullName} marked ${row.statusLabel?.toLowerCase() || status}.` : 'Boarding attendance recorded.');
    }catch(e:any){
      setMessage(e?.message || 'Attendance could not be recorded.');
    }finally{setAttendanceBusy(false);}
  }

  async function handleSaveQuranProfile(){
    if(!quranEditTarget)return; setQuranEditBusy(true);setQuranEditMsg('');
    try{await teacherUpdateStudentQuranProfile(quranEditTarget.id,{direction:quranEditDirection,startSurah:quranEditStartSurah,startAyah:quranEditStartAyah,currentSurah:quranEditSurah,currentAyah:quranEditAyah});const fresh=await loadTeacherDirectory();setStudents(fresh);const updated=fresh.find((x:any)=>x.id===quranEditTarget.id);if(updated)setSelected(updated);setQuranEditTarget(null);setMessage('Quran profile saved as the official student record.');}catch(e:any){setQuranEditMsg(e?.message||'Failed to save Quran profile');}finally{setQuranEditBusy(false);}
  }
  async function handleSetStudentStatus(student:any,status:'active'|'suspended'|'withdrawn'){
    if(status==='withdrawn'&&!window.confirm('Mark this student inactive? All academic and historical records will be preserved.'))return;setBusy(true);setMessage('');
    try{await teacherSetStudentStatus(student.id,status);const fresh=await loadTeacherDirectory();setStudents(fresh);if(selected?.id===student.id)setSelected(fresh.find((x:any)=>x.id===student.id)||null);setMessage(status==='suspended'?student.name+' is now frozen.':status==='withdrawn'?student.name+' is now inactive.':student.name+' is active again.');}catch(e:any){setMessage(e?.message||'Failed to update student status');}finally{setBusy(false);}
  }
  async function handleSaveSection(){
    if(!editSectionTarget)return;setEditSectionBusy(true);setEditSectionMsg('');
    try{await teacherUpdateStudentSection(editSectionTarget.id,editSectionValue);await refresh();setEditSectionTarget(null);}catch(e:any){setEditSectionMsg(e?.message||'Failed to update section');}finally{setEditSectionBusy(false);}
  }
  async function openAddStudent(){setAddMsg('');setAddSearch('');setUnassigned(await getUnassignedStudents());setAddStudentOpen(true);}
  async function handleAssign(studentId:string){setAddBusy(studentId);setAddMsg('');try{await teacherAssignStudentToClass(studentId);await refresh();setUnassigned(prev=>prev.filter(x=>x.student_id!==studentId));setAddMsg('Student added to your class.');}catch(e:any){setAddMsg(e?.message||'Failed to assign student');}finally{setAddBusy(null);}}

  const doneCount = activeEvals.filter(ev => hasMoved(ev)).length;
  const returnedCount = activeEvals.filter(ev => ev.status === 'returned').length;
  const dayCount = students.filter(s => s.section === 'Day').length;
  const boardingCount = students.filter(s => s.section === 'Boarding').length;
  const boardingMarkedCount = boardingAttendance.filter(row => !!row.statusCode).length;
  const boardingRemainingCount = Math.max(0, boardingAttendance.length - boardingMarkedCount);
  const filteredStudents = useMemo(() => students.filter(s => {
    const matchesSearch = s.name?.toLowerCase().includes(studentSearch.toLowerCase());
    const matchesView = studentView === 'all'
      || (studentView === 'day' && s.section === 'Day')
      || (studentView === 'boarding' && s.section === 'Boarding');
    return matchesSearch && matchesView;
  }), [students, studentSearch, studentView]);

  return <AdminShell title="Teacher Workspace"><div className="space-y-5">

    {/* Hero */}
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-5 text-white shadow-xl md:p-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.24em] text-amber-300">Teacher workspace</div>
          {me?.full_name && <h2 className="mt-1 text-3xl font-black md:text-4xl">As-salāmu ʿalaykum, {me.full_name.split(' ')[0]}.</h2>}
          {!me?.full_name && <h2 className="mt-1 text-3xl font-black md:text-4xl">Your students. Your impact.</h2>}
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Evaluate all students in your class before submitting. Progress saves automatically so you can continue where you left off.</p>
        </div>
        <button onClick={() => setProfileOpen(true)} className="flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-4 text-left backdrop-blur hover:bg-white/20 transition-colors">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-white/15">{me?.avatar_url ? <img src={me.avatar_url} className="h-full w-full object-cover" alt="Profile" /> : <div className="grid h-full place-items-center text-lg font-black">{me?.full_name?.charAt(0)||'T'}</div>}</div>
          <div><div className="text-sm font-black">My profile</div><div className="text-xs text-emerald-200">{me?.phone||'Add phone'}</div></div>
        </button>
      </div>
    </section>

    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}

    {/* Stats */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="My students" value={students.length} color="emerald"/>
      <StatCard label="Day students" value={dayCount} color="blue"/>
      <StatCard label="Boarding students" value={boardingCount} color="violet"/>
      <StatCard label={activeEvals.length ? `${doneCount}/${activeEvals.length} done` : 'No active eval'} value={returnedCount>0?`${returnedCount} returned`:(activeEvals.length?`${Math.round((doneCount/activeEvals.length)*100)}%`:'—')} color={returnedCount>0?'rose':'amber'} label2={returnedCount>0?'Returned evals':activeEvals.length?'Progress':'Evaluations'}/>
    </div>

    {/* Attendance responsibility — teacher can only record boarding attendance */}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Attendance</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">Today&apos;s attendance responsibility</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Day students are recorded at the main gate. Your teacher attendance workspace is limited to the boarding students assigned to your class.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border bg-blue-50 px-3 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-wide text-blue-600">Day · Gate</div><div className="mt-0.5 text-xl font-black text-blue-900">{dayCount}</div></div>
            <div className="rounded-xl border bg-violet-50 px-3 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-wide text-violet-600">Boarding</div><div className="mt-0.5 text-xl font-black text-violet-900">{boardingAttendance.length}</div></div>
            <div className="rounded-xl border bg-emerald-50 px-3 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">Marked</div><div className="mt-0.5 text-xl font-black text-emerald-900">{boardingMarkedCount}</div></div>
            <div className="rounded-xl border bg-amber-50 px-3 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-wide text-amber-600">Remaining</div><div className="mt-0.5 text-xl font-black text-amber-900">{boardingRemainingCount}</div></div>
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Boarding students assigned to you</div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">Teacher can mark boarding only</span>
        </div>
        {boardingAttendance.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-400">No active boarding students are assigned to your account.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {boardingAttendance.map(row => (
              <div key={row.studentId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-black text-slate-900">{row.fullName}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{row.admissionNo || '—'} · {row.className || 'Unassigned class'}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.statusCode ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.statusLabel || 'Not marked'}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button disabled={attendanceBusy} onClick={() => markBoardingAttendance(row.studentId,'present')} className="rounded-xl bg-emerald-50 px-2 py-2 text-[11px] font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Present</button>
                  <button disabled={attendanceBusy} onClick={() => markBoardingAttendance(row.studentId,'late')} className="rounded-xl bg-amber-50 px-2 py-2 text-[11px] font-black text-amber-700 hover:bg-amber-100 disabled:opacity-50">Late</button>
                  <button disabled={attendanceBusy} onClick={() => markBoardingAttendance(row.studentId,'absent')} className="rounded-xl bg-rose-50 px-2 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50">Absent</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>

    {/* Campaign evaluation sections */}
    {byCampaign.map(({ campaign, evals: campEvals }) => {
      const allDone = campEvals.every(ev => hasMoved(ev));
      const doneHere = campEvals.filter(ev => hasMoved(ev)).length;
      const hasReturned = campEvals.some(ev => ev.status === 'returned');
      const pct = campEvals.length ? Math.round((doneHere / campEvals.length) * 100) : 0;

      return <section key={campaign?.id || 'none'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`border-b p-5 ${hasReturned ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black">{campaign?.title || 'Evaluation'}</h2>
                {hasReturned && <span className="pill bg-rose-100 text-rose-700 border border-rose-200">⚠ Contains returned evaluations</span>}
                {allDone && !hasReturned && <span className="pill bg-emerald-100 text-emerald-700">Ready to submit</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">Window: {campaign?.opens_at ? new Date(campaign.opens_at).toLocaleString() : '—'} → {campaign?.closes_at ? new Date(campaign.closes_at).toLocaleString() : '—'}</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full transition-all ${allDone ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-black text-slate-600">{doneHere}/{campEvals.length} students ready</span>
                <span className="text-xs text-slate-400">{pct}%</span>
              </div>
            </div>
            <button className={`btn shrink-0 px-5 ${allDone ? 'btn-primary' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`} disabled={busy || !allDone} onClick={() => submitClass(campEvals)}>
              {busy ? 'Submitting…' : allDone ? '✓ Submit class evaluation' : `${campEvals.length - doneHere} remaining`}
            </button>
          </div>
        </div>

        <div className="divide-y">
          {campEvals.map(ev => {
            const f = forms[ev.id];
            const done = hasMoved(ev);
            const isOpen = expandedEval === ev.id;
            const dir = ev.students?.memorization_direction;
            const isBtoN = dir === 'baqarah_to_nas';
            const start = { surah: Number(ev.from_surah), ayah: Number(ev.from_ayah) };
            const stop = f ? { surah: f.toSurah, ayah: f.toAyah } : start;
            const calc = done ? calculateEvaluation(start, stop, isBtoN ? 'Baqarah-to-Nas' : 'Nas-to-Baqarah') : { memorizedAyahs: 0, memorizedPages: 0, memorizedHizbs: 0 };
            const score = f ? Math.round(((f.mem + f.acc + f.flu + f.taj + f.ret) / 25) * 100) : 0;
            const grade = score >= 90 ? 'Excellent' : score >= 80 ? 'Very Good' : score >= 70 ? 'Good' : score >= 60 ? 'Satisfactory' : 'Needs Improvement';
            const evCurrSurah = Number(ev.students?.current_surah || start.surah);
            const _tot = isBtoN ? Math.max(1, 114 - start.surah) : Math.max(1, start.surah - 2);
            const _done = isBtoN ? Math.max(0, evCurrSurah - start.surah) : Math.max(0, start.surah - evCurrSurah);
            const progress = Math.min(100, (_done / _tot) * 100);
            const maxAyah = (SURAHS.find(x => x.id === (f?.toSurah || 2)) || SURAHS[0]).ayahs;
            const isReturned = ev.status === 'returned';

            return <div key={ev.id} className={`${isOpen ? 'bg-slate-50' : isReturned ? 'bg-rose-50/40' : ''}`}>
              <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedEval(isOpen ? null : ev.id)}>
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100 border border-slate-200">
                  {ev.students?.photo_url ? <img src={ev.students.photo_url} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full place-items-center text-lg font-black text-slate-300">{ev.students?.full_name?.charAt(0)}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">{ev.students?.full_name}</span>
                    <span className="text-xs text-slate-400">{ev.students?.admission_no}</span>
                    <MemorizationBadge direction={dir} />
                    <SectionBadge section={ev.students?.section === 'boarding' ? 'Boarding' : 'Day'} />
                    {isReturned && <span className="pill bg-rose-100 text-rose-700 border border-rose-200 text-[11px]">Returned — needs correction</span>}
                    {done && !isReturned && <span className="pill bg-emerald-50 text-emerald-700 text-[11px]">{score}% · {grade}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-36 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400">S.{ev.students?.current_surah||'?'} · {Math.round(progress)}% of journey</span>
                  </div>
                </div>
                <div className="ml-2 shrink-0 text-xl">{done ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">○</span>}</div>
                <div className="ml-1 text-xs text-slate-400">{isOpen ? '▲' : '▼'}</div>
              </button>

              {isOpen && f && <div className="border-t bg-white p-5 space-y-4">
                {isReturned && ev.admin_comment && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm"><span className="font-black text-rose-700">Admin returned: </span><span className="text-rose-600">{ev.admin_comment}</span></div>}

                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoCard color="emerald" label="Starting from" value={label(start)}/>
                  <InfoCard color="blue" label="Covered so far" value={done?`${calc.memorizedAyahs} ayahs · ${calc.memorizedPages} pages`:'Not entered yet'}/>
                  <InfoCard color={score>=75?'emerald':score>=60?'amber':'rose'} label="Current score" value={done?`${score}% · ${grade}`:'—'}/>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">Stopping Surah
                    <select className="input mt-1 w-full" value={f.toSurah} onChange={e => updateForm(ev.id, { toSurah: Number(e.target.value), toAyah: 1 })}>
                      {SURAHS.map(x => <option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">Stopping Ayah
                    <select className="input mt-1 w-full" value={f.toAyah} onChange={e => updateForm(ev.id, { toAyah: Number(e.target.value) })}>
                      {Array.from({ length: maxAyah }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {!done && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-800">The stopping position must move {isBtoN ? 'forward (higher surah/ayah)' : 'backward (lower surah/ayah)'} from {label(start)}.</div>}

                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Rubric scores — 1 (weak) to 5 (excellent)</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {([['Memorization', 'mem'], ['Accuracy', 'acc'], ['Fluency', 'flu'], ['Tajweed', 'taj'], ['Retention', 'ret']] as [string, keyof EvalForm][]).map(([name, key]) =>
                      <div key={key} className="text-center">
                        <div className="text-[11px] font-bold text-slate-500 mb-1">{name}</div>
                        <select className="input w-full text-center font-black" value={f[key] as number} onChange={e => updateForm(ev.id, { [key]: Number(e.target.value) })}>
                          {[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Teacher comment</span>
                    <button className="btn bg-amber-50 text-amber-900 text-xs" type="button" onClick={() => updateForm(ev.id, { comment: automatedComment(f.mem as any, f.acc as any, f.flu as any, f.taj as any, f.ret as any) })}>Auto-generate</button>
                  </div>
                  <textarea className="input w-full min-h-[72px] resize-none text-sm bg-white" value={f.comment} onChange={e => updateForm(ev.id, { comment: e.target.value })} placeholder="Write an observation or click Auto-generate…" />
                </div>
                <div className="text-right text-xs text-slate-400">Progress saves automatically — you can close and continue later.</div>
              </div>}
            </div>;
          })}
        </div>
      </section>;
    })}

    {activeEvals.length === 0 && <section className="card p-12 text-center">
      <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-3xl">📋</div>
      <h3 className="text-lg font-black text-slate-700">No open evaluation windows</h3>
      <p className="mt-2 text-sm text-slate-400">When Admin opens an evaluation for your class, it will appear here.</p>
    </section>}

    {/* My students — proper table */}
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">My students</h2>
          <p className="text-xs text-slate-500">{students.length} student{students.length !== 1 ? 's' : ''} assigned to your account</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border bg-slate-50 p-1">
            {([['all','All'],['day','Day students'],['boarding','Boarding']] as const).map(([key,label]) => (
              <button key={key} onClick={() => setStudentView(key)} className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${studentView===key ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
            ))}
          </div>
          <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search student…" className="rounded-xl border px-3 py-2 text-sm w-44" />
          <button onClick={openAddStudent} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">+ Add student</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Student</th>
              <th className="px-3 py-3">Section</th>
              <th className="px-3 py-3">Year</th>
              <th className="px-3 py-3">Direction</th>
              <th className="px-3 py-3">Started at</th>
              <th className="px-3 py-3">Current position</th>
              <th className="px-3 py-3">Progress</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
        {filteredStudents.map(s => {
          const sBtoN = s.direction === 'Baqarah-to-Nas';
          const startSurahId = s.start?.surah || (sBtoN ? 2 : 114);
          const currSurahId  = s.current?.surah || startSurahId;
          const startName = SURAHS.find(x => x.id === startSurahId)?.name ?? `Surah ${startSurahId}`;
          const currName  = SURAHS.find(x => x.id === currSurahId)?.name  ?? `Surah ${currSurahId}`;
          const canonicalProgress = progressBetween({ surah: startSurahId, ayah: Number(s.start?.ayah || 1) }, { surah: currSurahId, ayah: Number(s.current?.ayah || 1) }, s.direction);
          const sPct = Math.min(100, Math.max(0, Math.round(canonicalProgress.percent)));

          return (
            <tr key={s.id} className="border-t hover:bg-slate-50/60 transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center">
                    {s.photoUrl ? <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" /> : <span className="text-xs font-black text-slate-400">{s.name?.charAt(0)}</span>}
                  </div>
                  <div>
                    <div className="font-semibold leading-tight">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.admissionNo}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${s.section === 'Boarding' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{s.section}</span>
              </td>
              <td className="px-3 py-3 text-xs text-slate-500">{s.year || '—'}</td>
              <td className="px-3 py-3 text-xs font-semibold text-emerald-700">{sBtoN ? 'B → N' : 'N → B'}</td>
              <td className="px-3 py-3 text-xs text-slate-600">{startName} <span className="text-slate-400">:{s.start?.ayah || 1}</span></td>
              <td className="px-3 py-3 text-xs font-semibold text-emerald-700">{currName} <span className="text-emerald-500 font-normal">:{s.current?.ayah || 1}</span></td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${sPct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{sPct}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 transition-colors" onClick={() => {
                    setQuranEditTarget(s);
                    setQuranEditDirection(s.direction === 'Baqarah-to-Nas' ? 'baqarah_to_nas' : 'nas_to_baqarah');
                    setQuranEditStartSurah(Number(s.start?.surah || 114));
                    setQuranEditStartAyah(Number(s.start?.ayah || 1));
                    setQuranEditSurah(Number(s.current?.surah || s.start?.surah || 114));
                    setQuranEditAyah(Number(s.current?.ayah || s.start?.ayah || 1));
                    setQuranEditMsg('');
                  }}>Edit Quran</button>
                  <button className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors" onClick={() => { setSelected(s); setSelectedTab('academic'); }}>Profile</button>
                  {s.status === 'active' && <button disabled={busy} className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700" onClick={() => handleSetStudentStatus(s,'suspended')}>Freeze</button>}
                  {s.status === 'active' && <button disabled={busy} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700" onClick={() => handleSetStudentStatus(s,'withdrawn')}>Inactive</button>}
                  {s.status !== 'active' && <button disabled={busy} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700" onClick={() => handleSetStudentStatus(s,'active')}>Reactivate</button>}
                </div>
              </td>
            </tr>
          );
        })}
        {!filteredStudents.length && (
          <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
            {studentSearch ? 'No students match your search.' : 'No students are assigned to your account.'}
          </td></tr>
        )}
          </tbody>
        </table>
      </div>
    </section>

    {/* Student profile modal — rich view matching admin students page */}
    {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4" onClick={e => e.target === e.currentTarget && setSelected(null)}>
      <div className="mx-auto mt-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-4 border-b p-6">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            {selected.photoUrl ? <img src={selected.photoUrl} alt={selected.name} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-2xl font-black text-slate-300">{selected.name?.charAt(0)}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black uppercase tracking-wider text-slate-400">{selected.admissionNo}</div>
            <h2 className="mt-0.5 text-2xl font-black">{selected.name}</h2>
            <div className="mt-1 flex flex-wrap gap-2"><SectionBadge section={selected.section}/><MemorizationBadge direction={selected.direction}/><span className="pill bg-slate-100 text-slate-600">{selected.year}</span></div>
            <div className="mt-1 text-xs text-slate-500">{selected.className || '—'}</div>
            {selected.section === 'Boarding' && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Boarding attendance</span><button className="btn bg-emerald-50 text-emerald-800" disabled={attendanceBusy} onClick={async()=>{setAttendanceBusy(true);try{await recordTeacherBoardingAttendance(selected.id,'present');setMessage(`${selected.name} attendance recorded.`)}catch(e:any){setMessage(e?.message||'Attendance could not be recorded.')}finally{setAttendanceBusy(false)}}}>{attendanceBusy?'Saving…':'Mark Present'}</button><button className="btn bg-amber-50 text-amber-800" disabled={attendanceBusy} onClick={async()=>{setAttendanceBusy(true);try{await recordTeacherBoardingAttendance(selected.id,'late');setMessage(`${selected.name} marked late.`)}catch(e:any){setMessage(e?.message||'Attendance could not be recorded.')}finally{setAttendanceBusy(false)}}}>Late</button><button className="btn bg-rose-50 text-rose-800" disabled={attendanceBusy} onClick={async()=>{setAttendanceBusy(true);try{await recordTeacherBoardingAttendance(selected.id,'absent');setMessage(`${selected.name} marked absent.`)}catch(e:any){setMessage(e?.message||'Attendance could not be recorded.')}finally{setAttendanceBusy(false)}}}>Absent</button></div>}
          </div>
          <button onClick={() => setSelected(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">✕</button>
        </div>
        {/* Tabs */}
        <div className="flex border-b">
          {(['academic','personal','contacts'] as const).map(t => (
            <button key={t} onClick={() => setSelectedTab(t)}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors ${selectedTab===t ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-400 hover:text-slate-700'}`}>
              {t === 'academic' ? 'Academic' : t === 'personal' ? 'Personal & Medical' : 'Contacts'}
            </button>
          ))}
        </div>
        {/* Tab content */}
        <div className="p-6">
          {selectedTab === 'academic' && <>
            <QuranProgress student={selected} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Start</div><div className="mt-1 text-base font-black text-slate-900">{label(selected.start)}</div></div>
              <div className="rounded-2xl border bg-emerald-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Current</div><div className="mt-1 text-base font-black text-emerald-900">{label(selected.current)}</div></div>
              <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Class</div><div className="mt-1 text-base font-black text-slate-900">{selected.className || '—'}</div></div>
            </div>
          </>}
          {selectedTab === 'personal' && <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Date of birth</div><div className="mt-1 font-black text-slate-900">{selected.dateOfBirth || '—'}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gender</div><div className="mt-1 font-black text-slate-900">{selected.gender || '—'}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Admission no.</div><div className="mt-1 font-black text-slate-900">{selected.admissionNo}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Year</div><div className="mt-1 font-black text-slate-900">{selected.year}</div></div>
          </div>}
          {selectedTab === 'contacts' && <div className="space-y-4">
            <div className="rounded-2xl border p-4">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Parent / Guardian</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Name</div><div className="mt-1 font-black text-slate-900">{selected.parent?.name || '—'}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phone</div><div className="mt-1 font-black text-slate-900">{selected.parent?.phone || '—'}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Relationship</div><div className="mt-1 font-black text-slate-900">{selected.parent?.relationship || '—'}</div></div>
              </div>
            </div>
          </div>}
        </div>
        <div className="flex justify-end border-t p-4">
          <button onClick={() => setSelected(null)} className="btn bg-slate-100">Close</button>
        </div>
      </div>
    </div>}

    {/* Authoritative Quran profile modal */}
    {quranEditTarget && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
        <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between"><div><h3 className="text-xl font-black">Edit official Quran profile</h3><p className="text-xs text-slate-500">{quranEditTarget.name} · {quranEditTarget.admissionNo}</p></div><button className="btn bg-slate-100" onClick={()=>setQuranEditTarget(null)}>Close</button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Direction<select className="input mt-1 w-full" value={quranEditDirection} onChange={e=>setQuranEditDirection(e.target.value as any)}><option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option></select></label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Starting Surah<select className="input mt-1 w-full" value={quranEditStartSurah} onChange={e=>{setQuranEditStartSurah(Number(e.target.value));setQuranEditStartAyah(1)}}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select></label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Starting Ayah<select className="input mt-1 w-full" value={quranEditStartAyah} onChange={e=>setQuranEditStartAyah(Number(e.target.value))}>{Array.from({length:SURAHS.find(x=>x.id===quranEditStartSurah)?.ayahs||286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Surah<select className="input mt-1 w-full" value={quranEditSurah} onChange={e=>{setQuranEditSurah(Number(e.target.value));setQuranEditAyah(1)}}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select></label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Ayah<select className="input mt-1 w-full" value={quranEditAyah} onChange={e=>setQuranEditAyah(Number(e.target.value))}>{Array.from({length:SURAHS.find(x=>x.id===quranEditSurah)?.ayahs||286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          {quranEditMsg && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{quranEditMsg}</div>}
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">This is the student's official live Quran record. Saving updates the central student record and automatically recalculates the Mushaf page and Hizb. The same record is used across student profiles, teachers, admins, parents and report cards.</div>
          <div className="mt-5 flex justify-end gap-2"><button className="btn bg-slate-100" onClick={()=>setQuranEditTarget(null)}>Cancel</button><button className="btn btn-primary" disabled={quranEditBusy} onClick={handleSaveQuranProfile}>{quranEditBusy?'Saving…':'Save official record'}</button></div>
        </div>
      </div>
    )}

    {/* Edit section modal */}
    {editSectionTarget && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4">
        <div className="mx-auto my-8 w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
          <h3 className="text-lg font-black">Edit section — {editSectionTarget.name}</h3>
          <p className="mt-1 text-xs text-slate-500">Change whether this student is a day or boarding student.</p>
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-700">Section
              <select value={editSectionValue} onChange={e => setEditSectionValue(e.target.value as 'day' | 'boarding')}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="day">Day</option>
                <option value="boarding">Boarding</option>
              </select>
            </label>
          </div>
          {editSectionMsg && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{editSectionMsg}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setEditSectionTarget(null)} className="btn bg-slate-100">Cancel</button>
            <button onClick={handleSaveSection} disabled={editSectionBusy} className="btn btn-primary">{editSectionBusy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    )}

    {/* Add missing student modal */}
    {addStudentOpen && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4">
        <div className="mx-auto mt-10 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h3 className="text-lg font-black">Add missing student</h3>
              <p className="text-xs text-slate-500">These students have no class assigned. Add them to your class.</p>
            </div>
            <button onClick={() => setAddStudentOpen(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">✕</button>
          </div>
          <div className="p-5">
            <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search by name or admission no…" className="w-full rounded-xl border px-3 py-2 text-sm" />
            {addMsg && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">{addMsg}</p>}
            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
              {unassigned.filter(s => !addSearch || s.full_name?.toLowerCase().includes(addSearch.toLowerCase()) || s.admission_no?.toLowerCase().includes(addSearch.toLowerCase())).map(s => (
                <div key={s.student_id} className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3">
                  <div>
                    <div className="font-semibold text-sm">{s.full_name}</div>
                    <div className="text-[11px] text-slate-400">{s.admission_no} · {s.section === 'boarding' ? 'Boarding' : 'Day'} · {s.program_year === 'year_2' ? 'Year 2' : 'Year 1'}</div>
                  </div>
                  <button onClick={() => handleAssign(s.student_id)} disabled={addBusy === s.student_id} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {addBusy === s.student_id ? 'Adding…' : 'Add'}
                  </button>
                </div>
              ))}
              {unassigned.filter(s => !addSearch || s.full_name?.toLowerCase().includes(addSearch.toLowerCase()) || s.admission_no?.toLowerCase().includes(addSearch.toLowerCase())).length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">{addSearch ? 'No unassigned students match your search.' : 'No unassigned students found.'}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end border-t p-4">
            <button onClick={() => setAddStudentOpen(false)} className="btn bg-slate-100">Close</button>
          </div>
        </div>
      </div>
    )}

    {/* Profile modal */}
    {profileOpen && <Modal title="My profile" close={() => setProfileOpen(false)}>
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-100 border">{me?.avatar_url ? <img src={me.avatar_url} className="h-full w-full object-cover" alt="Profile" /> : <div className="grid h-full place-items-center text-2xl font-black text-slate-300">{me?.full_name?.charAt(0)||'T'}</div>}</div>
        <label className="btn bg-slate-100">Change photo<input hidden type="file" accept="image/*" onChange={e => uploadPhoto(e.target.files?.[0] || null)} /></label>
      </div>
      <label className="mt-5 block text-sm font-semibold">Phone number<input className="input mt-1 w-full" placeholder="+234 xxx xxx xxxx" value={me?.phone || ''} onChange={e => setMe((x: any) => ({ ...x, phone: e.target.value }))} /></label>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await updateOwnProfile({ phone: me?.phone || null }); setMessage('Phone updated.'); } catch (e: any) { setMessage(e?.message || 'Unable to update phone'); } finally { setBusy(false); } }} className="btn btn-primary mt-4 w-full">Save Profile</button>
      <div className="mt-6 border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-black text-slate-800">Official Signature</div><p className="mt-0.5 text-xs text-slate-500">Used on your students’ official report cards.</p></div>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={()=>setSigOpen(v=>!v)}>{sigOpen?'Close':'Edit signature'}</button>
        </div>
        {sigMsg && <div className="mt-2 rounded-xl bg-teal-50 p-2 text-xs font-semibold text-teal-800">{sigMsg}</div>}
        {mySig&&!sigOpen&&<div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
          <div className="flex h-14 flex-1 items-center justify-center rounded-xl border border-white bg-white"><img src={(mySig as any).signature_data} alt="Saved signature" className="h-full w-full object-contain p-1"/></div>
          <div className="shrink-0 text-right"><div className="text-xs font-black text-emerald-700">✓ Saved</div><div className="mt-0.5 text-[10px] text-slate-500">Ready for reports</div></div>
        </div>}
        {sigOpen&&<div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-600">Draw your signature below</span><span className="text-[10px] text-slate-400">Finger, mouse or stylus</span></div>
          <SignaturePad ref={el => { sigPadRef.current = el; }} height={150}/>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-white" onClick={()=>{sigPadRef.current?.clear();setSigOpen(false)}}>Cancel</button>
            <button className="btn btn-primary" disabled={sigBusy} onClick={async () => {
              const pad = sigPadRef.current;
              if (!pad || pad.isEmpty()) { setSigMsg('Please draw your signature first.'); return; }
              const data = pad.getDataURL(); if (!data) return; setSigBusy(true);
              try { await saveMySignature(data); const s = await getMySignature(); setMySig(s.signature_data ? s : null); pad.clear(); setSigOpen(false); setSigMsg('Signature updated successfully.'); }
              catch (err: any) { setSigMsg(err?.message || 'Failed to save.'); }
              finally { setSigBusy(false); }
            }}>{sigBusy ? 'Saving…' : 'Save & Close'}</button>
          </div>
        </div>}
        {!mySig&&!sigOpen&&<p className="mt-3 text-xs font-semibold text-amber-700">No signature saved yet. Choose “Edit signature” to add one.</p>}
      </div>
    </Modal>}
  </div></AdminShell>;
}

function StatCard({ label, label2, value, color }: { label: string; label2?: string; value: number | string; color: string }) {
  const colors: Record<string,string> = { emerald:'bg-emerald-50 text-emerald-900', blue:'bg-blue-50 text-blue-900', violet:'bg-violet-50 text-violet-900', amber:'bg-amber-50 text-amber-900', rose:'bg-rose-50 text-rose-900' };
  return <div className={`rounded-2xl p-5 ${colors[color]||colors.emerald}`}><div className="text-xs font-black uppercase tracking-wide opacity-60">{label2||label}</div><div className="mt-2 text-3xl font-black">{value}</div><div className="mt-1 text-xs opacity-50">{label2?label:''}</div></div>;
}
function InfoCard({ color, label, value }: { color: string; label: string; value: string }) {
  const bg = color === 'emerald' ? 'bg-emerald-50 text-emerald-800' : color === 'blue' ? 'bg-blue-50 text-blue-800' : color === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800';
  return <div className={`rounded-xl p-3 ${bg}`}><div className="text-xs font-black uppercase">{label}</div><div className="mt-1 text-sm font-black">{value}</div></div>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="btn bg-slate-100" onClick={close}>Close</button></div>{children}</div></div>;
}
function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-sm font-semibold">{v}</div></div>;
}

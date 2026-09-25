'use client';

import AdminShell from '@/components/AdminShell';
import {loadAdmissionApplications,updateAdmissionApplication,enrollAdmissionApplication,loadClasses,scheduleAdmissionScreening,saveAdmissionScreening} from '@/lib/live-store';
import {loadCMSSettings,saveCMSSetting} from '@/lib/cms-live-store';
import {printAdmissionLetter} from '@/lib/admission-letter';
import {useEffect,useMemo,useState} from 'react';

const DEFAULT_ADMISSION_SETTINGS = {
  application_fee_ngn: 5000,
  application_form_price_ngn: 2000,
  registration_fee_ngn: 25000,
  opening_date: '',
  closing_date: '',
  screening_from: '',
  screening_to: '',
  requirements: [
    'Birth certificate (photocopy)',
    'Immunization card (photocopy)',
    'Previous school report card',
    'Two passport photographs of the child',
    'Parent/guardian valid ID',
  ] as string[],
  letter_body_template: '',
  sms_screening_success: '',
  sms_screening_fail: '',
  sms_admission_offered: '',
  sms_registered: '',
};
type AdmissionSettings = typeof DEFAULT_ADMISSION_SETTINGS;

async function notifyParent(applicationId: string, kind: 'screening_success'|'screening_fail'|'admission_offered'|'registered') {
  const res = await fetch('/api/admissions/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationId, kind }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body?.error || 'SMS failed') + (body?.detail ? ' — ' + body.detail : ''));
  return body as { sent: boolean; to: string; message: string };
}

export default function AdmissionsManage(){
 const [items,setItems]=useState<any[]>([]),[classes,setClasses]=useState<any[]>([]),[settings,setSettings]=useState<any>({}),[selected,setSelected]=useState<any|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [scheduleAt,setScheduleAt]=useState('');
 const [admissionSettings,setAdmissionSettings]=useState<AdmissionSettings>(DEFAULT_ADMISSION_SETTINGS);
 const [reqDraft,setReqDraft]=useState('');
 const refresh=async()=>{const [a,c,s]=await Promise.all([loadAdmissionApplications(),loadClasses(),loadCMSSettings()]);setItems(a);setClasses(c);setSettings(s);const saved:any=s.admission_settings||{};setAdmissionSettings({...DEFAULT_ADMISSION_SETTINGS,...saved,requirements:Array.isArray(saved.requirements)?saved.requirements:DEFAULT_ADMISSION_SETTINGS.requirements});setReqDraft((Array.isArray(saved.requirements)?saved.requirements:DEFAULT_ADMISSION_SETTINGS.requirements).join('\n'))};
 useEffect(()=>{refresh()},[]);
 const portal=settings.admission_portal||{};
 const payment=settings.school_payment||{};

 async function saveAdmissionSettings(){
   setBusy(true);
   try{
     const cleanedReq=reqDraft.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
     const next={...admissionSettings,requirements:cleanedReq,application_fee_ngn:Number(admissionSettings.application_fee_ngn)||0,application_form_price_ngn:Number(admissionSettings.application_form_price_ngn)||0,registration_fee_ngn:Number(admissionSettings.registration_fee_ngn)||0};
     await saveCMSSetting('admission_settings',next);
     setMessage('Admission settings saved.');
     await refresh();
   }catch(e:any){setMessage(e?.message||'Unable to save admission settings.');}
   finally{setBusy(false);}
 }

 async function printLetter(a:any){
   const cls=classes.find((c:any)=>c.id===a.class_id);
   printAdmissionLetter({applicant_name:a.applicant_name,application_no:a.application_no,class_name:cls?.name||a.class_id||null,section:a.requested_section||a.section||null,parent_name:a.parent_name,starting_surah:a.starting_surah,starting_ayah:a.starting_ayah,screening_score:a.screening_score},admissionSettings,settings);
 }
 async function sendNotify(a:any,kind:'screening_success'|'screening_fail'|'admission_offered'|'registered'){
   setBusy(true);
   try{const r=await notifyParent(a.id,kind);setMessage(`SMS sent to ${r.to}.`);}
   catch(e:any){setMessage(e?.message||'SMS could not be sent.');}
   finally{setBusy(false);}
 }
 const setS=<K extends keyof AdmissionSettings>(k:K,v:AdmissionSettings[K])=>setAdmissionSettings(prev=>({...prev,[k]:v}));
 const virtualCount=useMemo(()=>items.filter(a=>a.screening_mode==='virtual').length,[items]);

 async function savePortal(){
   setBusy(true);try{await saveCMSSetting('admission_portal',{enabled:!!portal.enabled,opening_date:portal.opening_date||null,closing_date:portal.closing_date||null,screening_date:portal.screening_date||null});setMessage('Admission portal schedule saved.');await refresh()}catch(e:any){setMessage(e?.message||'Unable to save')}finally{setBusy(false)}
 }
 async function verify(a:any){setBusy(true);try{await updateAdmissionApplication(a.id,{payment_status:'verified',payment_reference:a.payment_reference||null,status:'payment_verified'});setMessage(a.application_no+' payment verified.');await refresh()}catch(e:any){setMessage(e?.message||'Unable to verify')}finally{setBusy(false)}}
 async function schedule(a:any){
   if(!scheduleAt)return;
   setBusy(true);try{const r=await scheduleAdmissionScreening(a.id,scheduleAt,'');setMessage(a.application_no+' screening scheduled as '+r.screening_mode+'.');setScheduleAt('');await refresh();setSelected(null)}catch(e:any){setMessage(e?.message||'Unable to schedule screening')}finally{setBusy(false)}
 }
 async function outcome(a:any,outcome:'successful'|'unsuccessful'|'further_assessment'){
   setBusy(true);try{await saveAdmissionScreening(a.id,outcome,a.screening_score?Number(a.screening_score):null,a.screening_notes||'');setMessage(a.application_no+' marked '+outcome.replace('_',' ')+'.');await refresh();setSelected(null)}catch(e:any){setMessage(e?.message||'Unable to save screening outcome')}finally{setBusy(false)}
 }
 async function enroll(a:any){setBusy(true);try{const r=await enrollAdmissionApplication(a.id,a.class_id||null,a.starting_surah?Number(a.starting_surah):null,a.starting_ayah?Number(a.starting_ayah):null,a.screening_score?Number(a.screening_score):null,a.screening_notes||'');setMessage('Enrolled '+r.admission_no+'. Quran starting position preserved.');await refresh()}catch(e:any){setMessage(e?.message||'Unable to enroll')}finally{setBusy(false)}}

 return <AdminShell title="Admissions Management"><div className="space-y-6">
  <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-emerald-950 p-6 text-white"><div><div className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Admissions lifecycle</div><h2 className="mt-2 text-3xl font-black">Application → Screening → Decision → Class → Quran start.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/75">Adamawa applicants are scheduled for physical screening. Applicants outside Adamawa are scheduled into AMQM's own secure browser video room with a unique link.</p></div></section>
  {message&&<div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}
  <section className="grid gap-4 lg:grid-cols-3">
   <div className="card p-5 lg:col-span-2"><h2 className="font-black">Admission portal</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={!!portal.enabled} onChange={e=>setSettings((x:any)=>({...x,admission_portal:{...portal,enabled:e.target.checked}}))}/> Portal open for applications</label><label className="text-sm font-semibold">Opening date<input className="input mt-1" type="date" value={portal.opening_date||''} onChange={e=>setSettings((x:any)=>({...x,admission_portal:{...portal,opening_date:e.target.value}}))}/></label><label className="text-sm font-semibold">Closing date<input className="input mt-1" type="date" value={portal.closing_date||''} onChange={e=>setSettings((x:any)=>({...x,admission_portal:{...portal,closing_date:e.target.value}}))}/></label></div><button disabled={busy} onClick={savePortal} className="btn btn-primary mt-4">Save admissions settings</button></div>
   <div className="card p-5"><div className="text-xs font-black uppercase tracking-widest text-emerald-700">Virtual screenings</div><div className="mt-2 text-4xl font-black">{virtualCount}</div><p className="mt-1 text-xs text-slate-500">Applications from outside Adamawa requiring an online interview.</p></div>
  </section>

  <details className="card overflow-hidden" open>
    <summary className="cursor-pointer border-b bg-slate-50 p-5 select-none">
      <div className="inline-flex items-center gap-3">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Admission settings</span>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-800">Configurable</span>
      </div>
      <div className="mt-1 text-sm font-black text-slate-800">Fees · Requirements · Letter template · SMS templates</div>
      <div className="text-xs text-slate-500">Everything the applicant sees on the website and everything the parent gets from the school comes from here.</div>
    </summary>
    <div className="grid gap-4 p-5 lg:grid-cols-2">
      <label className="text-xs font-black text-slate-600">Application fee (₦) — pays to submit application
        <input type="number" className="input mt-1 w-full" value={admissionSettings.application_fee_ngn} onChange={e=>setS('application_fee_ngn',Number(e.target.value)||0 as any)} />
      </label>
      <label className="text-xs font-black text-slate-600">Application form price (₦) — used later when Phase 2 ships
        <input type="number" className="input mt-1 w-full" value={admissionSettings.application_form_price_ngn} onChange={e=>setS('application_form_price_ngn',Number(e.target.value)||0 as any)} />
      </label>
      <label className="text-xs font-black text-slate-600">Registration fee (₦) — paid before class enrollment
        <input type="number" className="input mt-1 w-full" value={admissionSettings.registration_fee_ngn} onChange={e=>setS('registration_fee_ngn',Number(e.target.value)||0 as any)} />
      </label>
      <div />
      <label className="text-xs font-black text-slate-600">Screening period · from
        <input type="date" className="input mt-1 w-full" value={admissionSettings.screening_from||''} onChange={e=>setS('screening_from',e.target.value as any)} />
      </label>
      <label className="text-xs font-black text-slate-600">Screening period · to
        <input type="date" className="input mt-1 w-full" value={admissionSettings.screening_to||''} onChange={e=>setS('screening_to',e.target.value as any)} />
      </label>
      <label className="text-xs font-black text-slate-600 lg:col-span-2">Requirements checklist (one per line — shown on the public page and printed on the admission letter)
        <textarea rows={5} className="input mt-1 w-full" value={reqDraft} onChange={e=>setReqDraft(e.target.value)} placeholder={'Birth certificate\nImmunization card\n…'} />
      </label>
      <label className="text-xs font-black text-slate-600 lg:col-span-2">Admission letter body (placeholders: {'{applicant_name} · {parent_name} · {application_no} · {class_name} · {section} · {starting_position} · {registration_fee} · {screening_score} · {date} · {school_name}'})
        <textarea rows={8} className="input mt-1 w-full" value={admissionSettings.letter_body_template||''} onChange={e=>setS('letter_body_template',e.target.value as any)} placeholder="Dear {parent_name}, we are pleased to offer {applicant_name} admission to {school_name} ..." />
      </label>
      <label className="text-xs font-black text-slate-600 lg:col-span-2">SMS · Successful screening (placeholders: {'{applicant_name} · {parent_name} · {application_no}'})
        <textarea rows={2} className="input mt-1 w-full" value={admissionSettings.sms_screening_success||''} onChange={e=>setS('sms_screening_success',e.target.value as any)} />
      </label>
      <label className="text-xs font-black text-slate-600 lg:col-span-2">SMS · Unsuccessful screening
        <textarea rows={2} className="input mt-1 w-full" value={admissionSettings.sms_screening_fail||''} onChange={e=>setS('sms_screening_fail',e.target.value as any)} />
      </label>
      <label className="text-xs font-black text-slate-600 lg:col-span-2">SMS · Admission letter offered
        <textarea rows={2} className="input mt-1 w-full" value={admissionSettings.sms_admission_offered||''} onChange={e=>setS('sms_admission_offered',e.target.value as any)} />
      </label>
      <label className="text-xs font-black text-slate-600 lg:col-span-2">SMS · Registration completed
        <textarea rows={2} className="input mt-1 w-full" value={admissionSettings.sms_registered||''} onChange={e=>setS('sms_registered',e.target.value as any)} />
      </label>
    </div>
    <div className="border-t bg-slate-50 p-4 text-right">
      <button type="button" disabled={busy} onClick={saveAdmissionSettings} className="btn btn-primary">Save admission settings</button>
    </div>
  </details>

  <section className="card overflow-hidden"><div className="border-b p-5"><h2 className="font-black">Application queue</h2><p className="text-xs text-slate-500">Submitted → payment verified → screening scheduled → successful / unsuccessful / further assessment → enrolled.</p></div><div className="divide-y">
   {items.map(a=><div key={a.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{a.applicant_name}</h3><span className="pill bg-slate-100">{a.status}</span><span className="pill bg-amber-50 text-amber-800">{a.payment_status}</span><span className="pill bg-emerald-50 text-emerald-800">{a.screening_mode||'—'}</span></div><div className="mt-1 text-xs text-slate-500">{a.application_no} · {a.state||'—'} · {a.lga||'—'} · {a.parent_phone}</div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><b>Quran start:</b> {a.starting_surah?'Surah '+a.starting_surah+' : Ayah '+(a.starting_ayah||1):'Assign after screening'}</div><div><b>Screening:</b> {a.screening_scheduled_at?new Date(a.screening_scheduled_at).toLocaleString():a.screening_outcome||'Not scheduled'}</div></div>{a.screening_mode==='virtual'&&a.screening_token&&<div className="mt-2 break-all text-xs text-emerald-700">Applicant link: /admissions/screening/{a.screening_token}</div>}</div><div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end"><button className="btn bg-slate-100" onClick={()=>setSelected(a)}>Details</button>{a.payment_status!=='verified'&&<button className="btn btn-green" onClick={()=>verify(a)}>Verify payment</button>}{a.payment_status==='verified'&&a.screening_outcome!=='successful'&&a.screening_outcome!=='unsuccessful'&&<button className="btn bg-amber-100 text-amber-900" onClick={()=>{setSelected(a);setScheduleAt(a.screening_scheduled_at?new Date(a.screening_scheduled_at).toISOString().slice(0,16):'')}}>Schedule screening</button>}{a.screening_outcome==='successful'&&a.status==='accepted'&&<button className="btn btn-primary" onClick={()=>enroll(a)}>Enroll student</button>}{a.screening_mode==='virtual'&&a.screening_token&&<a className="btn bg-emerald-100 text-emerald-900" target="_blank" rel="noreferrer" href={'/admissions/screening/'+a.screening_token+'?role=interviewer'}>Open video room</a>}{a.screening_outcome==='successful'&&<button className="btn bg-amber-50 text-amber-900" onClick={()=>printLetter(a)} title="Print admission letter">▤ Letter</button>}{(a.parent_phone||a.guardian_phone)&&<div className="inline-flex gap-1"><button disabled={busy||a.screening_outcome!=='successful'} className="btn bg-emerald-50 text-emerald-800 text-[11px]" onClick={()=>sendNotify(a,'screening_success')} title="SMS parent: screening successful">SMS ✓</button><button disabled={busy||a.screening_outcome!=='unsuccessful'} className="btn bg-rose-50 text-rose-800 text-[11px]" onClick={()=>sendNotify(a,'screening_fail')} title="SMS parent: screening unsuccessful">SMS ✗</button><button disabled={busy||a.screening_outcome!=='successful'} className="btn bg-sky-50 text-sky-800 text-[11px]" onClick={()=>sendNotify(a,'admission_offered')} title="SMS parent: admission letter issued">SMS letter</button></div>}</div></div></div>)}
   {!items.length&&<div className="p-10 text-center text-sm text-slate-500">No applications yet.</div>}
  </div></section>
  {selected&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-5" onClick={()=>setSelected(null)}><div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={e=>e.stopPropagation()}>
   <div className="flex justify-between"><div><div className="text-xs uppercase tracking-wider text-emerald-700">Application {selected.application_no}</div><h2 className="mt-1 text-2xl font-black">{selected.applicant_name}</h2></div><button className="btn bg-slate-100" onClick={()=>setSelected(null)}>Close</button></div>
   <div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Date of birth',selected.date_of_birth],['Gender',selected.gender],['Parent',selected.parent_name],['Parent phone',selected.parent_phone],['Guardian',selected.guardian_name],['Guardian phone',selected.guardian_phone],['Email',selected.guardian_email],['Address',(selected.address||'—')+', '+(selected.lga||'')+', '+(selected.state||'')],['Quran level',selected.quran_level],['Screening mode',selected.screening_mode],['Screening time',selected.screening_scheduled_at?new Date(selected.screening_scheduled_at).toLocaleString():'—'],['Outcome',selected.screening_outcome||'Pending']].map(([k,v])=><div className="rounded-xl bg-slate-50 p-3" key={k as string}><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-sm font-semibold">{v||'—'}</div></div>)}</div>
   <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-slate-600">Class after successful screening<select className="input mt-1 w-full" value={selected.class_id||''} onChange={e=>setSelected((x:any)=>({...x,class_id:e.target.value}))}><option value="">Assign class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-xs font-black text-slate-600">Screening time<input className="input mt-1 w-full" type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}/></label><input className="input" type="number" placeholder="Screening score" value={selected.screening_score||''} onChange={e=>setSelected((x:any)=>({...x,screening_score:e.target.value}))}/><textarea className="input sm:col-span-2" placeholder="Screening notes / assessment" value={selected.screening_notes||''} onChange={e=>setSelected((x:any)=>({...x,screening_notes:e.target.value}))}/></div>
   <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy||selected.payment_status!=='verified'} className="btn bg-amber-100 text-amber-900" onClick={()=>schedule(selected)}>Schedule {selected.screening_mode==='virtual'?'video':'physical'} screening</button>{selected.screening_mode==='virtual'&&selected.screening_token&&<a className="btn bg-emerald-100 text-emerald-900" target="_blank" rel="noreferrer" href={'/admissions/screening/'+selected.screening_token+'?role=interviewer'}>Open interview room</a>}</div>
   <div className="mt-6 border-t pt-5"><div className="text-xs font-black uppercase tracking-widest text-slate-500">Decision</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="btn btn-green" onClick={()=>outcome(selected,'successful')}>Successful</button><button disabled={busy} className="btn bg-rose-100 text-rose-900" onClick={()=>outcome(selected,'unsuccessful')}>Unsuccessful</button><button disabled={busy} className="btn bg-amber-100 text-amber-900" onClick={()=>outcome(selected,'further_assessment')}>Further Assessment Required</button></div></div>
   <div className="mt-6 border-t pt-5"><div className="text-xs font-black uppercase tracking-widest text-slate-500">After successful screening</div><p className="mt-2 text-sm text-slate-500">Assign the class and Quran starting Surah/Ayah, then enroll. The student's Quran journey starts from that position and continues across future school years.</p></div>
  </div></div>}
 </div></AdminShell>
}
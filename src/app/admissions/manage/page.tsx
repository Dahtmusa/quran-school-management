'use client';

import AdminShell from '@/components/AdminShell';
import {loadAdmissionApplications,updateAdmissionApplication,enrollAdmissionApplication,loadClasses,scheduleAdmissionScreening,saveAdmissionScreening} from '@/lib/live-store';
import {loadCMSSettings,saveCMSSetting} from '@/lib/cms-live-store';
import {printAdmissionLetter} from '@/lib/admission-letter';
import {useEffect,useMemo,useState} from 'react';

const DEFAULT_ADMISSION_SETTINGS = {
  admission_fee_ngn: 5000,
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
  sms_screening_scheduled: '',
  sms_screening_success: '',
  sms_screening_fail: '',
  sms_admission_offered: '',
  sms_registered: '',
};
type AdmissionSettings = typeof DEFAULT_ADMISSION_SETTINGS;

async function notifyParent(applicationId: string, kind: 'screening_success'|'screening_fail'|'admission_offered'|'registered'|'screening_scheduled') {
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
 const [savedSnapshot,setSavedSnapshot]=useState<AdmissionSettings|null>(null);
 const [savedAt,setSavedAt]=useState<string|null>(null);
 const [reqDraft,setReqDraft]=useState('');
 const refresh=async()=>{
   const [a,c,s]=await Promise.all([loadAdmissionApplications(),loadClasses(),loadCMSSettings()]);
   setItems(a);setClasses(c);setSettings(s);
   const rawSaved:any=s.admission_settings||null;
   const saved:any=rawSaved||{};
   const merged={...DEFAULT_ADMISSION_SETTINGS,...saved,requirements:Array.isArray(saved.requirements)?saved.requirements:DEFAULT_ADMISSION_SETTINGS.requirements};
   setAdmissionSettings(merged);
   setSavedSnapshot(rawSaved?merged:null);
   setReqDraft((Array.isArray(saved.requirements)?saved.requirements:DEFAULT_ADMISSION_SETTINGS.requirements).join('\n'));
   try{const {data:row}=await (await import('@/lib/supabase/client')).createClient().from('site_settings').select('updated_at').eq('key','admission_settings').maybeSingle();setSavedAt((row as any)?.updated_at||null);}catch{setSavedAt(null);}
 };
 useEffect(()=>{refresh()},[]);
 const portal=settings.admission_portal||{};
 const payment=settings.school_payment||{};

 async function saveAdmissionSettings(){
   setBusy(true);
   try{
     const cleanedReq=reqDraft.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
     const next={...admissionSettings,requirements:cleanedReq,admission_fee_ngn:Number(admissionSettings.admission_fee_ngn)||0};
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
   if(!scheduleAt){alert('Pick a date and time for the screening first (the "Screening time" field just above this button).');setMessage('Pick a date and time for the screening first.');return;}
   setBusy(true);
   try{
     const r=await scheduleAdmissionScreening(a.id,scheduleAt,'');
     let smsNote='';
     try{const s=await notifyParent(a.id,'screening_scheduled');smsNote=` SMS sent to ${s.to}.`;}
     catch(smsErr:any){smsNote=` (SMS failed: ${smsErr?.message||'unknown error'})`;}
     setMessage(a.application_no+' screening scheduled as '+r.screening_mode+'.'+smsNote);
     setScheduleAt('');await refresh();setSelected(null);
   }catch(e:any){setMessage(e?.message||'Unable to schedule screening')}
   finally{setBusy(false)}
 }
 async function outcome(a:any,outcome:'successful'|'unsuccessful'|'further_assessment'){
   setBusy(true);try{await saveAdmissionScreening(a.id,outcome,a.screening_score?Number(a.screening_score):null,a.screening_notes||'');setMessage(a.application_no+' marked '+outcome.replace('_',' ')+'.');await refresh();setSelected(null)}catch(e:any){setMessage(e?.message||'Unable to save screening outcome')}finally{setBusy(false)}
 }
 async function enroll(a:any){setBusy(true);try{const r=await enrollAdmissionApplication(a.id,a.class_id||null,a.starting_surah?Number(a.starting_surah):null,a.starting_ayah?Number(a.starting_ayah):null,a.screening_score?Number(a.screening_score):null,a.screening_notes||'');setMessage('Enrolled '+r.admission_no+'. Quran starting position preserved.');await refresh()}catch(e:any){setMessage(e?.message||'Unable to enroll')}finally{setBusy(false)}}

 return <AdminShell title="Admissions Management"><div className="space-y-6">
  <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-emerald-950 p-6 text-white"><div><div className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Admissions lifecycle</div><h2 className="mt-2 text-3xl font-black">Application → Screening → Decision → Class → Quran start.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/75">Adamawa applicants are scheduled for physical screening. Applicants outside Adamawa are scheduled into AMQM's own secure browser video room with a unique link.</p></div></section>
  {message&&<div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}
  <section className="grid gap-4 lg:grid-cols-3">
   <div className="card p-5 lg:col-span-2">
     <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Portal status</div>
     <div className="mt-1 text-lg font-black">
       {(() => {
         const today=new Date().toISOString().slice(0,10);
         const o=admissionSettings.opening_date||''; const c=admissionSettings.closing_date||'';
         if(!o) return 'Not scheduled — set an opening date in Admission settings';
         if(today<o) return `Portal opens ${o}`;
         if(c&&today>c) return `Portal closed since ${c}`;
         return `Portal is OPEN${c?` until ${c}`:''}`;
       })()}
     </div>
     <div className="mt-2 text-xs text-slate-500">The public /admissions page opens and closes automatically based on the dates you set below.</div>
     <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
       <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Applications</div><div className="mt-1 text-xl font-black">{items.length}</div></div>
       <div className="rounded-xl bg-amber-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-amber-700">Awaiting payment</div><div className="mt-1 text-xl font-black">{items.filter(a=>a.payment_status!=='verified').length}</div></div>
       <div className="rounded-xl bg-sky-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-sky-700">Screening scheduled</div><div className="mt-1 text-xl font-black">{items.filter(a=>a.screening_scheduled_at&&!a.screening_outcome).length}</div></div>
       <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Successful</div><div className="mt-1 text-xl font-black">{items.filter(a=>a.screening_outcome==='successful').length}</div></div>
     </div>
   </div>
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
    {savedSnapshot ? (
      <div className="border-b bg-emerald-50/60 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Currently saved</div>
            <div className="mt-0.5 text-sm font-black text-emerald-950">These are the values on the public site right now.</div>
          </div>
          <div className="text-[11px] font-bold text-emerald-800/80">
            {savedAt ? `Last saved: ${new Date(savedAt).toLocaleString('en-NG', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true})}` : ''}
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <SavedTile label="Admission fee">₦{Number(savedSnapshot.admission_fee_ngn||0).toLocaleString('en-NG')}</SavedTile>
          <SavedTile label="Portal opens">{savedSnapshot.opening_date||<i className="text-slate-400">Not set</i>}</SavedTile>
          <SavedTile label="Portal closes">{savedSnapshot.closing_date||<i className="text-slate-400">Not set</i>}</SavedTile>
          <SavedTile label="Screening period">{savedSnapshot.screening_from||savedSnapshot.screening_to?`${savedSnapshot.screening_from||'—'} → ${savedSnapshot.screening_to||'—'}`:<i className="text-slate-400">Not set</i>}</SavedTile>
          <SavedTile label="Requirements">{savedSnapshot.requirements?.length?`${savedSnapshot.requirements.length} item${savedSnapshot.requirements.length===1?'':'s'}`:<i className="text-slate-400">None</i>}</SavedTile>
          <SavedTile label="Letter template">{savedSnapshot.letter_body_template?.trim()?`${savedSnapshot.letter_body_template.split(/\r?\n/).filter(Boolean).length} lines`:<i className="text-slate-400">Default</i>}</SavedTile>
          <SavedTile label="SMS templates set">{['sms_screening_scheduled','sms_screening_success','sms_screening_fail','sms_admission_offered','sms_registered'].filter(k=>(savedSnapshot as any)[k]?.trim()).length} of 5</SavedTile>
          <SavedTile label="Portal state">{(()=>{const today=new Date().toISOString().slice(0,10);const o=savedSnapshot.opening_date;const c=savedSnapshot.closing_date;if(!o) return <span className="text-slate-500">Not scheduled</span>; if(today<o) return <span className="text-amber-700">Opens {o}</span>; if(c&&today>c) return <span className="text-rose-700">Closed</span>; return <span className="text-emerald-700 font-black">OPEN</span>;})()}</SavedTile>
        </div>
        {Array.isArray(savedSnapshot.requirements) && savedSnapshot.requirements.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-black uppercase tracking-wide text-emerald-800">Show saved requirements list</summary>
            <ol className="mt-2 space-y-1 rounded-xl bg-white p-3 text-xs text-slate-700">{savedSnapshot.requirements.map((r,i)=><li key={i}>{i+1}. {r}</li>)}</ol>
          </details>
        )}
      </div>
    ) : (
      <div className="border-b bg-amber-50 p-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-amber-800">Nothing saved yet</div>
        <div className="mt-0.5 text-sm font-black text-amber-900">Fill in the fields below and press Save to publish these to the site.</div>
      </div>
    )}

    <div className="grid gap-4 p-5 lg:grid-cols-2">
      <label className="text-xs font-black text-slate-600 lg:col-span-2">Admission fee (₦) — one-time, non-refundable
        <input type="number" className="input mt-1 w-full" value={admissionSettings.admission_fee_ngn} onChange={e=>setS('admission_fee_ngn',Number(e.target.value)||0 as any)} />
        <div className="mt-1 text-[11px] font-medium text-slate-500">Applicants pay this after submitting the form and use their application number as the transfer reference.</div>
      </label>
      <label className="text-xs font-black text-slate-600">Portal opens on
        <input type="date" className="input mt-1 w-full" value={admissionSettings.opening_date||''} onChange={e=>setS('opening_date',e.target.value as any)} />
        <div className="mt-1 text-[11px] font-medium text-slate-500">The public /admissions page opens automatically on this date.</div>
      </label>
      <label className="text-xs font-black text-slate-600">Portal closes on
        <input type="date" className="input mt-1 w-full" value={admissionSettings.closing_date||''} onChange={e=>setS('closing_date',e.target.value as any)} />
        <div className="mt-1 text-[11px] font-medium text-slate-500">After this date, new applications are refused.</div>
      </label>
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
      <label className="text-xs font-black text-slate-600 lg:col-span-2">SMS · Screening scheduled (placeholders: {'{applicant_name} · {parent_name} · {application_no} · {screening_date} · {screening_time} · {mode} · {join_link} · {join_line}'})
        <textarea rows={3} className="input mt-1 w-full" value={admissionSettings.sms_screening_scheduled||''} onChange={e=>setS('sms_screening_scheduled',e.target.value as any)} placeholder="AMQM screening for {applicant_name} (Ref {application_no}): {screening_date} at {screening_time}. Mode: {mode}. {join_line}" />
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
   {items.map(a=><div key={a.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{a.applicant_name}</h3><span className="pill bg-slate-100">{a.status}</span><span className="pill bg-amber-50 text-amber-800">{a.payment_status}</span><span className="pill bg-emerald-50 text-emerald-800">{a.screening_mode||(String(a.state||'').trim().toLowerCase()==='adamawa'?'physical (pending)':'virtual (pending)')}</span></div><div className="mt-1 text-xs text-slate-500">{a.application_no} · {a.state||'—'} · {a.lga||'—'} · {a.parent_phone}</div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><b>Quran start:</b> {a.starting_surah?'Surah '+a.starting_surah+' : Ayah '+(a.starting_ayah||1):'Assign after screening'}</div><div><b>Screening:</b> {a.screening_scheduled_at?new Date(a.screening_scheduled_at).toLocaleString():a.screening_outcome||'Not scheduled'}</div></div>{a.screening_mode==='virtual'&&a.screening_token&&<div className="mt-2 break-all text-xs text-emerald-700">Applicant link: /admissions/screening/{a.screening_token}</div>}</div><div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end"><button className="btn bg-slate-100" onClick={()=>setSelected(a)}>Details</button>{a.payment_status!=='verified'&&<button className="btn btn-green" onClick={()=>verify(a)}>Verify payment</button>}{a.payment_status==='verified'&&a.screening_outcome!=='successful'&&a.screening_outcome!=='unsuccessful'&&<button className="btn bg-amber-100 text-amber-900" onClick={()=>{setSelected(a);setScheduleAt(a.screening_scheduled_at?new Date(a.screening_scheduled_at).toISOString().slice(0,16):'')}}>Schedule screening</button>}{a.screening_outcome==='successful'&&a.status==='accepted'&&<button className="btn btn-primary" onClick={()=>enroll(a)}>Enroll student</button>}{a.screening_mode==='virtual'&&a.screening_token&&<a className="btn bg-emerald-100 text-emerald-900" target="_blank" rel="noreferrer" href={'/admissions/screening/'+a.screening_token+'?role=interviewer'}>Open video room</a>}{a.screening_outcome==='successful'&&<button className="btn bg-amber-50 text-amber-900" onClick={()=>printLetter(a)} title="Print admission letter">▤ Letter</button>}{(a.parent_phone||a.guardian_phone)&&<div className="inline-flex gap-1"><button disabled={busy||a.screening_outcome!=='successful'} className="btn bg-emerald-50 text-emerald-800 text-[11px]" onClick={()=>sendNotify(a,'screening_success')} title="SMS parent: screening successful">SMS ✓</button><button disabled={busy||a.screening_outcome!=='unsuccessful'} className="btn bg-rose-50 text-rose-800 text-[11px]" onClick={()=>sendNotify(a,'screening_fail')} title="SMS parent: screening unsuccessful">SMS ✗</button><button disabled={busy||a.screening_outcome!=='successful'} className="btn bg-sky-50 text-sky-800 text-[11px]" onClick={()=>sendNotify(a,'admission_offered')} title="SMS parent: admission letter issued">SMS letter</button></div>}</div></div></div>)}
   {!items.length&&<div className="p-10 text-center text-sm text-slate-500">No applications yet.</div>}
  </div></section>
  {selected&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-5" onClick={()=>setSelected(null)}><div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={e=>e.stopPropagation()}>
   <div className="flex justify-between"><div><div className="text-xs uppercase tracking-wider text-emerald-700">Application {selected.application_no}</div><h2 className="mt-1 text-2xl font-black">{selected.applicant_name}</h2></div><button className="btn bg-slate-100" onClick={()=>setSelected(null)}>Close</button></div>
   <div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Date of birth',selected.date_of_birth],['Gender',selected.gender],['Parent',selected.parent_name],['Parent phone',selected.parent_phone],['Guardian',selected.guardian_name],['Guardian phone',selected.guardian_phone],['Email',selected.guardian_email],['Address',(selected.address||'—')+', '+(selected.lga||'')+', '+(selected.state||'')],['Quran level',selected.quran_level],['Screening mode',selected.screening_mode],['Screening time',selected.screening_scheduled_at?new Date(selected.screening_scheduled_at).toLocaleString():'—'],['Outcome',selected.screening_outcome||'Pending']].map(([k,v])=><div className="rounded-xl bg-slate-50 p-3" key={k as string}><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-sm font-semibold">{v||'—'}</div></div>)}</div>
   <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-slate-600">Class after successful screening<select className="input mt-1 w-full" value={selected.class_id||''} onChange={e=>setSelected((x:any)=>({...x,class_id:e.target.value}))}><option value="">Assign class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-xs font-black text-slate-600">Screening time<input className="input mt-1 w-full" type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}/></label><input className="input" type="number" placeholder="Screening score" value={selected.screening_score||''} onChange={e=>setSelected((x:any)=>({...x,screening_score:e.target.value}))}/><textarea className="input sm:col-span-2" placeholder="Screening notes / assessment" value={selected.screening_notes||''} onChange={e=>setSelected((x:any)=>({...x,screening_notes:e.target.value}))}/></div>
   <div className="mt-4 flex flex-wrap items-center gap-2">
     <div className={'rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wide '+((String(selected.state||'').trim().toLowerCase()==='adamawa')?'bg-emerald-50 text-emerald-800':'bg-sky-50 text-sky-800')}>
       Predicted: {(String(selected.state||'').trim().toLowerCase()==='adamawa')?'Physical (Adamawa)':`Virtual (${selected.state||'outside Adamawa'})`}
     </div>
     <button
       disabled={busy||selected.payment_status!=='verified'||!scheduleAt}
       className={'btn '+(scheduleAt?'bg-amber-500 text-white':'bg-amber-100 text-amber-900')}
       onClick={()=>schedule(selected)}
       title={!scheduleAt?'Pick a date and time above first':(selected.payment_status!=='verified'?'Verify payment first':'Schedule this screening')}>
       Schedule {(selected.screening_mode||(String(selected.state||'').trim().toLowerCase()==='adamawa'?'physical':'virtual'))==='virtual'?'video':'physical'} screening
     </button>
     {!scheduleAt && <div className="text-[11px] font-bold text-amber-800">← Pick a date & time above first</div>}
     {selected.payment_status!=='verified' && <div className="text-[11px] font-bold text-rose-700">Verify payment before scheduling</div>}
     {selected.screening_mode==='virtual'&&selected.screening_token&&<a className="btn bg-emerald-100 text-emerald-900" target="_blank" rel="noreferrer" href={'/admissions/screening/'+selected.screening_token+'?role=interviewer'}>Open interview room</a>}
   </div>
   <div className="mt-6 border-t pt-5"><div className="text-xs font-black uppercase tracking-widest text-slate-500">Decision</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="btn btn-green" onClick={()=>outcome(selected,'successful')}>Successful</button><button disabled={busy} className="btn bg-rose-100 text-rose-900" onClick={()=>outcome(selected,'unsuccessful')}>Unsuccessful</button><button disabled={busy} className="btn bg-amber-100 text-amber-900" onClick={()=>outcome(selected,'further_assessment')}>Further Assessment Required</button></div></div>
   <div className="mt-6 border-t pt-5"><div className="text-xs font-black uppercase tracking-widest text-slate-500">After successful screening</div><p className="mt-2 text-sm text-slate-500">Assign the class and Quran starting Surah/Ayah, then enroll. The student's Quran journey starts from that position and continues across future school years.</p></div>
  </div></div>}
 </div></AdminShell>
}

function SavedTile({label,children}:{label:string;children:React.ReactNode}){
  return <div className="rounded-xl border border-emerald-100 bg-white p-3">
    <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">{label}</div>
    <div className="mt-1 text-sm font-black text-slate-900">{children}</div>
  </div>;
}
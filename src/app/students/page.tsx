'use client';
import AdminShell from '@/components/AdminShell';
import QuranProgress from '@/components/QuranProgress';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import { Student } from '@/lib/data';
import { createStudent, loadClasses, loadStudents, loadSurahs, updateStudentBasic, updateStudentClass, updateStudentSection, updateStudentMemorization, uploadProfileImage, loadStudentExtended, updateStudentExtended, loadRemovedStudents, removeStudent, reinstateStudent, type LiveClass, type RemovedStudent } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';
import { loadCMSSettings } from '@/lib/cms-live-store';
import { printAcademicIdCard } from '@/lib/id-card';
import { label, SURAHS } from '@/lib/quran';

type ExtProfile = {
  blood_group: string|null; genotype: string|null; home_address: string|null; nationality: string|null;
  state_of_origin: string|null; local_government: string|null;
  parent_name: string|null; parent_phone: string|null; parent_email: string|null;
  guardian_name: string|null; guardian_phone: string|null; guardian_email: string|null; guardian_relationship: string|null;
  emergency_contact_name: string|null; emergency_contact_phone: string|null;
  date_of_birth: string|null; gender: string|null;
};

const blankExt: ExtProfile = {blood_group:null,genotype:null,home_address:null,nationality:'Nigerian',state_of_origin:null,local_government:null,parent_name:null,parent_phone:null,parent_email:null,guardian_name:null,guardian_phone:null,guardian_email:null,guardian_relationship:null,emergency_contact_name:null,emergency_contact_phone:null,date_of_birth:null,gender:null};

export default function Students(){
 const [all,setAll]=useState<Student[]>([]),[classes,setClasses]=useState<LiveClass[]>([]),[surahs,setSurahs]=useState<any[]>([]),[q,setQ]=useState(''),[section,setSection]=useState('All'),[gender,setGender]=useState('All'),[classFilter,setClassFilter]=useState('All');
 const [logoUrl,setLogoUrl]=useState<string|null>(null);
 const [selected,setSelected]=useState<Student|null>(null);
 const [extProfile,setExtProfile]=useState<ExtProfile>(blankExt);
 const [edit,setEdit]=useState<Student|null>(null);
 const [editExt,setEditExt]=useState<ExtProfile>(blankExt);
 const [showCreate,setShowCreate]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[photoFile,setPhotoFile]=useState<File|null>(null);
 const [activeTab,setActiveTab]=useState<'academic'|'personal'|'contacts'>('academic');
 const [form,setForm]=useState({admissionNo:'',fullName:'',dateOfBirth:'',gender:'',section:'day',programYear:'year_1',direction:'baqarah_to_nas',startSurah:'2',startAyah:'1',classId:'',photoUrl:''});

 /* ── page tab ── */
 const [pageTab,setPageTab]=useState<'active'|'removed'|'duplicates'>('active');

 /* ── removed students ── */
 const [removed,setRemoved]=useState<RemovedStudent[]>([]);
 const [removedLoaded,setRemovedLoaded]=useState(false);
 const [reinstating,setReinstating]=useState<string|null>(null);

 /* ── removal modal ── */
 const [removeTarget,setRemoveTarget]=useState<Student|null>(null);
 const [removeStatus,setRemoveStatus]=useState<'suspended'|'expelled'|'withdrawn'>('suspended');
 const [removeReason,setRemoveReason]=useState('');
 const [removeNotes,setRemoveNotes]=useState('');
 const [removeBusy,setRemoveBusy]=useState(false);

 async function refresh(){const [students,cls,quran,settings]=await Promise.all([loadStudents(),loadClasses(),loadSurahs(),loadCMSSettings()]);setAll(students);setClasses(cls);setSurahs(quran);setLogoUrl((settings as any).logo_url?.url||(settings as any).logo_url||null)}
 useEffect(()=>{refresh()},[]);

 useEffect(()=>{
   if(!selected) return;
   loadStudentExtended(selected.id).then(d=>setExtProfile(d||blankExt));
   setActiveTab('academic');
 },[selected]);

 const filtered=useMemo(()=>all.filter(s=>
   (section==='All'||s.section===section)&&
   (gender==='All'||s.gender===gender.toLowerCase())&&
   (classFilter==='All'||(s.className??'Unassigned')===classFilter)&&
   s.name.toLowerCase().includes(q.toLowerCase())
 ),[all,q,section,gender,classFilter]);

 async function saveStudent(){
   if(!edit)return; setSaving(true); setMessage('');
   try{
     let photoUrl=edit.photoUrl||null;
     if(photoFile){photoUrl=await uploadProfileImage(photoFile,'students');}
     await updateStudentBasic(edit.id,{full_name:edit.name,photo_url:photoUrl});
     await updateStudentSection(edit.id,edit.section==='Boarding'?'boarding':'day');
     const cls=classes.find(c=>c.name===edit.className);
     await updateStudentClass(edit.id,cls?.id??null);
     await updateStudentExtended(edit.id,editExt);
     await updateStudentMemorization(edit.id,{memorization_direction:edit.direction==='Baqarah-to-Nas'?'baqarah_to_nas':'nas_to_baqarah',start_surah:edit.start.surah,start_ayah:edit.start.ayah,current_surah:edit.current.surah,current_ayah:edit.current.ayah,program_year:edit.year==='Year 2'?'year_2':'year_1'});
     await refresh(); setEdit(null); setPhotoFile(null); setMessage('Student updated successfully.');
   }catch(e:any){setMessage(e?.message??'Unable to update student.')}finally{setSaving(false)}
 }

 async function create(){
   setSaving(true); setMessage('');
   try{
     let photoUrl=form.photoUrl||null;
     if(photoFile){photoUrl=await uploadProfileImage(photoFile,'students')}
     const result=await createStudent({admissionNo:form.admissionNo||undefined,fullName:form.fullName,dateOfBirth:form.dateOfBirth||undefined,gender:form.gender||undefined,section:form.section as 'day'|'boarding',programYear:form.programYear as 'year_1'|'year_2',memorizationDirection:form.direction as any,startSurah:Number(form.startSurah),startAyah:Number(form.startAyah),classId:form.classId||null,photoUrl});
     setShowCreate(false); setPhotoFile(null); setForm({...form,admissionNo:'',fullName:'',dateOfBirth:'',gender:'',photoUrl:''});
     await refresh(); setMessage(`Student created. Admission number: ${result.admission_no}.`);
   }catch(e:any){setMessage(e?.message??'Unable to create student.')}finally{setSaving(false)}
 }

 async function printStudentId(s:any){await printAcademicIdCard({type:'STUDENT',name:s.name,id:s.id,admissionNo:s.admissionNo,photoUrl:s.photoUrl,year:s.year,section:s.section,className:s.className,expiry:s.idExpiresOn,logoUrl});}

 function openEdit(s:Student){setEdit(s);loadStudentExtended(s.id).then(d=>setEditExt(d||blankExt));}

 function openRemovedTab(){
   setPageTab('removed');
   if(!removedLoaded){loadRemovedStudents().then(r=>{setRemoved(r);setRemovedLoaded(true);});}
 }

 async function confirmRemove(){
   if(!removeTarget||!removeReason.trim())return;
   setRemoveBusy(true);
   try{
     await removeStudent(removeTarget.id,removeStatus,removeReason.trim(),removeNotes.trim()||undefined);
     await refresh();
     setRemoved([]);setRemovedLoaded(false);
     setRemoveTarget(null);setRemoveReason('');setRemoveNotes('');
     setMessage(`${removeTarget.name} has been ${removeStatus}.`);
   }catch(e:any){setMessage(e?.message??'Failed to remove student.');}
   finally{setRemoveBusy(false);}
 }

 async function reinstate(id:string,name:string){
   if(!confirm(`Reinstate ${name} as an active student?`))return;
   setReinstating(id);
   try{
     await reinstateStudent(id);
     setRemoved(r=>r.filter(s=>s.id!==id));
     await refresh();
     setMessage(`${name} has been reinstated.`);
   }catch(e:any){setMessage(e?.message??'Failed to reinstate student.');}
   finally{setReinstating(null);}
 }

 /* Duplicate detection — client-side: group by normalised name, show groups with 2+ */
 const duplicateGroups=useMemo(()=>{
   const groups:Record<string,Student[]>={};
   for(const s of all){
     const key=s.name.trim().toLowerCase();
     if(!groups[key])groups[key]=[];
     groups[key].push(s);
   }
   return Object.values(groups).filter(g=>g.length>1);
 },[all]);

 return <AdminShell title="Students"><div className="space-y-4">
  {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 cursor-pointer" onClick={()=>setMessage('')}>{message} <span className="float-right text-emerald-600">✕</span></div>}
  <div className="card overflow-hidden">
   {/* ── Page tabs ── */}
   <div className="flex items-center justify-between border-b px-5 pt-4">
     <div className="flex gap-1">
       {(['active','removed','duplicates'] as const).map(t=>(
         <button key={t} onClick={()=>t==='removed'?openRemovedTab():setPageTab(t)}
           className={`rounded-lg px-4 py-2 text-sm font-bold capitalize transition-colors ${pageTab===t?'bg-emerald-700 text-white':'text-slate-500 hover:bg-slate-100'}`}>
           {t==='active'?`Active (${all.length})`:t==='removed'?`Removed (${removed.length}${!removedLoaded?'…':''})`:
             `Duplicates${duplicateGroups.length?` (${duplicateGroups.length})`:''}`}
         </button>
       ))}
     </div>
     {pageTab==='active'&&<button className="btn btn-primary" onClick={()=>setShowCreate(true)}>+ Add Student</button>}
   </div>

   {/* ── Active students tab ── */}
   {pageTab==='active'&&<>
   <div className="flex flex-wrap gap-3 border-b p-4">
     <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student..." className="rounded-lg border px-3 py-2 text-sm md:w-64"/>
     <select value={section} onChange={e=>setSection(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
       <option value="All">All sections</option><option value="Day">Day</option><option value="Boarding">Boarding</option>
     </select>
     <select value={gender} onChange={e=>setGender(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
       <option value="All">All genders</option><option value="Male">Male</option><option value="Female">Female</option>
     </select>
     <select value={classFilter} onChange={e=>setClassFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
       <option value="All">All classes</option>
       {[...new Set(all.map(s=>s.className??'Unassigned'))].sort().map(c=><option key={c} value={c}>{c}</option>)}
     </select>
     {(section!=='All'||gender!=='All'||classFilter!=='All'||q)&&
       <button onClick={()=>{setQ('');setSection('All');setGender('All');setClassFilter('All');}} className="rounded-lg border px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">✕ Clear</button>}
     <span className="self-center text-xs text-slate-400">{filtered.length} student{filtered.length!==1?'s':''}</span>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-4">Student</th><th>Section</th><th>Class</th><th>Year</th><th>Direction</th><th>Attendance</th><th>Outstanding</th><th></th></tr></thead>
   <tbody>{filtered.map(s=><tr className="border-t" key={s.id}>
     <td className="p-4"><div className="flex items-center gap-3">{s.photoUrl?<img src={s.photoUrl} alt={s.name} className="h-10 w-10 rounded-full object-cover"/>:<div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-black text-emerald-700">{s.name.slice(0,1)}</div>}<div><b>{s.name}</b><div className="text-xs text-slate-500">{s.admissionNo}</div></div></div></td>
     <td><SectionBadge section={s.section}/></td>
     <td className="text-sm">{s.className??'Unassigned'}</td>
     <td className="text-sm">{s.year}</td>
     <td><MemorizationBadge direction={s.direction}/></td>
     <td className="text-sm">{s.attendance}%</td>
     <td className={s.fees?'font-bold text-rose-600 text-sm':'text-emerald-600 text-sm'}>{s.fees?'₦'+s.fees.toLocaleString():'Paid'}</td>
     <td className="pr-4"><div className="flex gap-2">
       <button onClick={()=>setSelected(s)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">Profile</button>
       <button onClick={()=>openEdit(s)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Edit</button>
       <button onClick={()=>{setRemoveTarget(s);setRemoveStatus('suspended');setRemoveReason('');setRemoveNotes('');}} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">Remove</button>
     </div></td>
   </tr>)}</tbody></table></div>
   {filtered.length===0&&<div className="p-8 text-center text-sm text-slate-400">No active students found.</div>}
   </>}

   {/* ── Removed students tab ── */}
   {pageTab==='removed'&&<>
   {!removedLoaded&&<div className="p-8 text-center text-sm text-slate-400">Loading…</div>}
   {removedLoaded&&removed.length===0&&<div className="p-8 text-center text-sm text-slate-400">No removed students on record.</div>}
   {removedLoaded&&removed.length>0&&<div className="overflow-x-auto"><table className="w-full text-left text-sm">
     <thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-4">Student</th><th>Status</th><th>Reason</th><th>Removed by</th><th>Date</th><th></th></tr></thead>
     <tbody>{removed.map(s=>(
       <tr key={s.id} className="border-t">
         <td className="p-4"><div className="flex items-center gap-3">
           {s.photo_url?<img src={s.photo_url} alt={s.full_name} className="h-10 w-10 rounded-full object-cover"/>:<div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 font-black text-rose-700">{s.full_name.slice(0,1)}</div>}
           <div><b>{s.full_name}</b><div className="text-xs text-slate-500">{s.admission_no}</div></div>
         </div></td>
         <td><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status==='expelled'?'bg-rose-100 text-rose-800':s.status==='suspended'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}`}>{s.status}</span></td>
         <td className="max-w-xs text-xs text-slate-600"><div className="font-semibold">{s.removal_reason||'—'}</div>{s.removal_notes&&<div className="mt-0.5 text-slate-400 line-clamp-2">{s.removal_notes}</div>}</td>
         <td className="text-xs text-slate-500">{s.removed_by_name||'—'}</td>
         <td className="text-xs text-slate-500 whitespace-nowrap">{s.removed_at?new Date(s.removed_at).toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
         <td className="pr-4"><button onClick={()=>reinstate(s.id,s.full_name)} disabled={reinstating===s.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">{reinstating===s.id?'…':'Reinstate'}</button></td>
       </tr>
     ))}</tbody>
   </table></div>}
   </>}

   {/* ── Duplicates tab ── */}
   {pageTab==='duplicates'&&<>
   {duplicateGroups.length===0&&<div className="p-8 text-center text-sm text-slate-400">No duplicate names found. All student names are unique.</div>}
   {duplicateGroups.length>0&&<>
   <div className="border-b bg-amber-50 px-5 py-3 text-sm text-amber-800"><b>{duplicateGroups.length} duplicate name group{duplicateGroups.length!==1?'s':''} found.</b> Review each group and edit or remove the incorrect record.</div>
   <div className="divide-y">
   {duplicateGroups.map((group,gi)=>(
     <div key={gi} className="p-5">
       <div className="mb-2 text-xs font-black uppercase tracking-wide text-amber-700">⚠ Duplicate — {group.length} records with same name</div>
       <div className="overflow-x-auto"><table className="w-full text-left text-sm">
         <thead className="text-xs text-slate-400 uppercase"><tr><th className="pb-2">Student</th><th>Section</th><th>Class</th><th>Year</th><th></th></tr></thead>
         <tbody>{group.map(s=>(
           <tr key={s.id} className="border-t">
             <td className="py-3 pr-4"><div className="flex items-center gap-3">{s.photoUrl?<img src={s.photoUrl} alt={s.name} className="h-9 w-9 rounded-full object-cover"/>:<div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 font-black text-amber-700">{s.name.slice(0,1)}</div>}<div><b>{s.name}</b><div className="text-xs text-slate-500">{s.admissionNo}</div></div></div></td>
             <td><SectionBadge section={s.section}/></td>
             <td className="text-xs">{s.className??'Unassigned'}</td>
             <td className="text-xs">{s.year}</td>
             <td><div className="flex gap-2">
               <button onClick={()=>openEdit(s)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Edit</button>
               <button onClick={()=>{setRemoveTarget(s);setRemoveStatus('withdrawn');setRemoveReason('Duplicate record');setRemoveNotes('');}} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">Remove duplicate</button>
             </div></td>
           </tr>
         ))}</tbody>
       </table></div>
     </div>
   ))}
   </div>
   </>}
   </>}

  </div>
 </div>

 {/* PROFILE MODAL */}
 {selected&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4"><div className="mx-auto mt-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
   <div className="flex items-start gap-4 border-b p-6">
     <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{selected.photoUrl?<img src={selected.photoUrl} alt={selected.name} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-2xl font-black text-slate-300">{selected.name.charAt(0)}</div>}</div>
     <div className="flex-1 min-w-0">
       <div className="text-xs font-black uppercase tracking-wider text-slate-400">{selected.admissionNo}</div>
       <h2 className="mt-0.5 text-2xl font-black">{selected.name}</h2>
       <div className="mt-1 flex flex-wrap gap-2"><SectionBadge section={selected.section}/><MemorizationBadge direction={selected.direction}/><span className="pill bg-slate-100 text-slate-600">{selected.year}</span></div>
       <div className="mt-1 text-xs text-slate-500">{selected.className??'Unassigned'} · {selected.teacher}</div>
     </div>
     <button onClick={()=>setSelected(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">✕</button>
   </div>
   <div className="flex border-b">
     {(['academic','personal','contacts'] as const).map(t=><button key={t} onClick={()=>setActiveTab(t)} className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors ${activeTab===t?'border-b-2 border-emerald-600 text-emerald-700':'text-slate-400 hover:text-slate-700'}`}>{t==='academic'?'Academic':'personal'===t?'Personal & Medical':'Contacts'}</button>)}
   </div>
   <div className="p-6">
     {activeTab==='academic'&&<>
       <QuranProgress student={selected}/>
       <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
         <InfoBox k="Attendance" v={`${selected.attendance}%`}/>
         <InfoBox k="Fees due" v={selected.fees?`₦${selected.fees.toLocaleString()}`:'Paid'} red={!!selected.fees}/>
         <InfoBox k="Start" v={label(selected.start)}/>
         <InfoBox k="Current" v={label(selected.current)}/>
       </div>
     </>}
     {activeTab==='personal'&&<div className="grid gap-3 sm:grid-cols-2">
       <InfoBox k="Date of birth" v={extProfile.date_of_birth||'—'}/>
       <InfoBox k="Gender" v={extProfile.gender||'—'}/>
       <InfoBox k="Blood group" v={extProfile.blood_group||'—'}/>
       <InfoBox k="Genotype" v={extProfile.genotype||'—'}/>
       <InfoBox k="Nationality" v={extProfile.nationality||'Nigerian'}/>
       <InfoBox k="State of origin" v={extProfile.state_of_origin||'—'}/>
       <InfoBox k="Local Govt. Area" v={extProfile.local_government||'—'}/>
       <InfoBox k="Home address" v={extProfile.home_address||'—'} wide/>
     </div>}
     {activeTab==='contacts'&&<div className="space-y-4">
       <Section title="Parent / Guardian">
         <div className="grid gap-3 sm:grid-cols-2">
           <InfoBox k="Name" v={extProfile.parent_name||'—'}/>
           <InfoBox k="Phone" v={extProfile.parent_phone||'—'}/>
           <InfoBox k="Email" v={extProfile.parent_email||'—'} wide/>
         </div>
       </Section>
       <Section title="Secondary contact">
         <div className="grid gap-3 sm:grid-cols-2">
           <InfoBox k="Name" v={extProfile.guardian_name||'—'}/>
           <InfoBox k="Phone" v={extProfile.guardian_phone||'—'}/>
           <InfoBox k="Email" v={extProfile.guardian_email||'—'}/>
           <InfoBox k="Relationship" v={extProfile.guardian_relationship||'—'}/>
         </div>
       </Section>
       <Section title="Emergency contact">
         <div className="grid gap-3 sm:grid-cols-2">
           <InfoBox k="Name" v={extProfile.emergency_contact_name||'—'}/>
           <InfoBox k="Phone" v={extProfile.emergency_contact_phone||'—'}/>
         </div>
       </Section>
     </div>}
   </div>
   <div className="flex flex-wrap gap-2 border-t p-4">
     <button onClick={()=>printStudentId(selected)} className="btn bg-amber-50 text-amber-900">Print ID card</button>
     <button onClick={()=>{openEdit(selected);setSelected(null);}} className="btn btn-primary">Edit profile</button>
     <button onClick={()=>{setRemoveTarget(selected);setRemoveStatus('suspended');setRemoveReason('');setRemoveNotes('');setSelected(null);}} className="btn bg-rose-50 text-rose-700">Remove student</button>
     <button onClick={()=>setSelected(null)} className="btn bg-slate-100">Close</button>
   </div>
 </div></div>}

 {/* EDIT MODAL */}
 {edit&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4"><div className="mx-auto mt-6 w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
   <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Edit student</h2><p className="text-sm text-slate-500">{edit.name} · {edit.admissionNo}</p></div><button onClick={()=>setEdit(null)} className="rounded-xl bg-slate-100 p-2">✕</button></div>
   <div className="divide-y overflow-y-auto max-h-[70vh]">
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Basic info</div>
       <label className="text-xs font-bold">Full name<input className="input mt-1 w-full" value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Section<select className="input mt-1 w-full" value={edit.section} onChange={e=>setEdit({...edit,section:e.target.value as any})}><option>Day</option><option>Boarding</option></select></label>
         <label className="text-xs font-bold">Class<select className="input mt-1 w-full" value={edit.className??''} onChange={e=>setEdit({...edit,className:e.target.value||null})}><option value="">Unassigned</option>{classes.filter(c=>c.active).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
       </div>
       <label className="text-xs font-bold">Profile photo<label className="btn mt-1 block w-full bg-slate-100 text-center cursor-pointer">Change photo<input hidden type="file" accept="image/*" onChange={e=>setPhotoFile(e.target.files?.[0]||null)}/></label></label>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Memorization Journey</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Memorization direction<select className="input mt-1 w-full" value={edit.direction==='Baqarah-to-Nas'?'baqarah_to_nas':'nas_to_baqarah'} onChange={e=>setEdit({...edit,direction:e.target.value==='baqarah_to_nas'?'Baqarah-to-Nas':'Nas-to-Baqarah'})}><option value="baqarah_to_nas">Baqarah → Nas (forward)</option><option value="nas_to_baqarah">Nas → Baqarah (reverse)</option></select></label>
         <label className="text-xs font-bold">Program year<select className="input mt-1 w-full" value={edit.year} onChange={e=>setEdit({...edit,year:e.target.value as any})}><option value="Year 1">Year 1</option><option value="Year 2">Year 2</option></select></label>
       </div>
       <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-1">Starting position</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Starting surah<select className="input mt-1 w-full" value={edit.start.surah} onChange={e=>setEdit({...edit,start:{...edit.start,surah:Number(e.target.value),ayah:1}})}>{SURAHS.map(s=><option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}</select></label>
         <label className="text-xs font-bold">Starting ayah<input type="number" min="1" max={SURAHS.find(s=>s.id===edit.start.surah)?.ayahs??286} className="input mt-1 w-full" value={edit.start.ayah} onChange={e=>setEdit({...edit,start:{...edit.start,ayah:Math.max(1,Number(e.target.value))}})}/></label>
       </div>
       <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-1">Current position <span className="normal-case font-normal text-slate-400">(admin can correct this)</span></div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Current surah<select className="input mt-1 w-full" value={edit.current.surah} onChange={e=>setEdit({...edit,current:{...edit.current,surah:Number(e.target.value),ayah:1}})}>{SURAHS.map(s=><option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}</select></label>
         <label className="text-xs font-bold">Current ayah<input type="number" min="1" max={SURAHS.find(s=>s.id===edit.current.surah)?.ayahs??286} className="input mt-1 w-full" value={edit.current.ayah} onChange={e=>setEdit({...edit,current:{...edit.current,ayah:Math.max(1,Number(e.target.value))}})}/></label>
       </div>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Personal & Medical</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Date of birth<input className="input mt-1 w-full" type="date" value={editExt.date_of_birth||''} onChange={e=>setEditExt({...editExt,date_of_birth:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Gender<select className="input mt-1 w-full" value={editExt.gender||''} onChange={e=>setEditExt({...editExt,gender:e.target.value||null})}><option value="">Select</option><option>Male</option><option>Female</option></select></label>
         <label className="text-xs font-bold">Blood group<select className="input mt-1 w-full" value={editExt.blood_group||''} onChange={e=>setEditExt({...editExt,blood_group:e.target.value||null})}><option value="">Select</option>{['A+','A−','B+','B−','AB+','AB−','O+','O−'].map(g=><option key={g}>{g}</option>)}</select></label>
         <label className="text-xs font-bold">Genotype<select className="input mt-1 w-full" value={editExt.genotype||''} onChange={e=>setEditExt({...editExt,genotype:e.target.value||null})}><option value="">Select</option>{['AA','AS','AC','SS','SC','CC'].map(g=><option key={g}>{g}</option>)}</select></label>
         <label className="text-xs font-bold">Nationality<input className="input mt-1 w-full" value={editExt.nationality||''} onChange={e=>setEditExt({...editExt,nationality:e.target.value||null})}/></label>
         <label className="text-xs font-bold">State of origin<input className="input mt-1 w-full" placeholder="e.g. Adamawa" value={editExt.state_of_origin||''} onChange={e=>setEditExt({...editExt,state_of_origin:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Local Govt. Area<input className="input mt-1 w-full" placeholder="e.g. Yola North" value={editExt.local_government||''} onChange={e=>setEditExt({...editExt,local_government:e.target.value||null})}/></label>
       </div>
       <label className="text-xs font-bold">Home address<textarea className="input mt-1 w-full resize-none" rows={2} value={editExt.home_address||''} onChange={e=>setEditExt({...editExt,home_address:e.target.value||null})}/></label>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Parent / Guardian</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Parent name<input className="input mt-1 w-full" value={editExt.parent_name||''} onChange={e=>setEditExt({...editExt,parent_name:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Parent phone<input className="input mt-1 w-full" value={editExt.parent_phone||''} onChange={e=>setEditExt({...editExt,parent_phone:e.target.value||null})}/></label>
         <label className="text-xs font-bold sm:col-span-2">Parent email<input className="input mt-1 w-full" type="email" value={editExt.parent_email||''} onChange={e=>setEditExt({...editExt,parent_email:e.target.value||null})}/></label>
       </div>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Secondary contact</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Name<input className="input mt-1 w-full" value={editExt.guardian_name||''} onChange={e=>setEditExt({...editExt,guardian_name:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Phone<input className="input mt-1 w-full" value={editExt.guardian_phone||''} onChange={e=>setEditExt({...editExt,guardian_phone:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Email<input className="input mt-1 w-full" type="email" value={editExt.guardian_email||''} onChange={e=>setEditExt({...editExt,guardian_email:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Relationship<input className="input mt-1 w-full" value={editExt.guardian_relationship||''} onChange={e=>setEditExt({...editExt,guardian_relationship:e.target.value||null})}/></label>
       </div>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Emergency contact</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Name<input className="input mt-1 w-full" value={editExt.emergency_contact_name||''} onChange={e=>setEditExt({...editExt,emergency_contact_name:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Phone<input className="input mt-1 w-full" value={editExt.emergency_contact_phone||''} onChange={e=>setEditExt({...editExt,emergency_contact_phone:e.target.value||null})}/></label>
       </div>
     </div>
   </div>
   <div className="flex justify-end gap-2 border-t p-4">
     <button className="btn bg-slate-100" onClick={()=>setEdit(null)}>Cancel</button>
     <button className="btn btn-primary" disabled={saving} onClick={saveStudent}>{saving?'Saving...':'Save changes'}</button>
   </div>
 </div></div>}

 {/* REMOVE STUDENT MODAL */}
 {removeTarget&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
   <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
     <div className="flex items-center justify-between border-b p-5">
       <div><h2 className="text-xl font-black text-rose-700">Remove Student</h2><p className="text-sm text-slate-500">{removeTarget.name} · {removeTarget.admissionNo}</p></div>
       <button onClick={()=>setRemoveTarget(null)} className="rounded-xl bg-slate-100 p-2">✕</button>
     </div>
     <div className="space-y-4 p-5">
       <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 font-semibold">The student's full record will be preserved. You can reinstate them at any time from the Removed tab.</div>
       <label className="block text-sm font-semibold">Status
         <select className="input mt-1 w-full" value={removeStatus} onChange={e=>setRemoveStatus(e.target.value as any)}>
           <option value="suspended">Suspended — temporary, pending review</option>
           <option value="expelled">Expelled — permanent dismissal</option>
           <option value="withdrawn">Withdrawn — left voluntarily / family decision</option>
         </select>
       </label>
       <label className="block text-sm font-semibold">Reason <span className="text-rose-600">*</span>
         <input className="input mt-1 w-full" placeholder="e.g. Serious disciplinary violation" value={removeReason} onChange={e=>setRemoveReason(e.target.value)}/>
       </label>
       <label className="block text-sm font-semibold">Additional notes <span className="text-xs font-normal text-slate-400">(optional)</span>
         <textarea className="input mt-1 w-full resize-none" rows={3} placeholder="Any extra context for the record…" value={removeNotes} onChange={e=>setRemoveNotes(e.target.value)}/>
       </label>
     </div>
     <div className="flex justify-end gap-2 border-t p-4">
       <button className="btn bg-slate-100" onClick={()=>setRemoveTarget(null)}>Cancel</button>
       <button className="btn bg-rose-600 text-white hover:bg-rose-700" disabled={removeBusy||!removeReason.trim()} onClick={confirmRemove}>{removeBusy?'Removing…':`Confirm — ${removeStatus}`}</button>
     </div>
   </div>
 </div>}

 {/* CREATE MODAL */}
 {showCreate&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4"><div className="mx-auto mt-6 w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
   <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Create student</h2><p className="text-sm text-slate-500">Admission number is auto-generated as AMQM/Stu/YYYY/###.</p></div><button onClick={()=>setShowCreate(false)}>✕</button></div>
   <div className="p-5 grid gap-3 md:grid-cols-2">
     <input className="input" placeholder="Full name" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/>
     <input className="input" type="date" value={form.dateOfBirth} onChange={e=>setForm({...form,dateOfBirth:e.target.value})}/>
     <select className="input" value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}><option value="">Gender</option><option>Male</option><option>Female</option></select>
     <select className="input" value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="day">Day</option><option value="boarding">Boarding</option></select>
     <select className="input" value={form.programYear} onChange={e=>setForm({...form,programYear:e.target.value})}><option value="year_1">Year 1</option><option value="year_2">Year 2</option></select>
     <select className="input" value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option></select>
     <select className="input" value={form.classId} onChange={e=>setForm({...form,classId:e.target.value})}><option value="">Class (optional)</option>{classes.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
     <select className="input" value={form.startSurah} onChange={e=>setForm({...form,startSurah:e.target.value,startAyah:'1'})}><option value="">Starting Surah</option>{surahs.map(s=><option value={s.id} key={s.id}>{s.id}. {s.name}</option>)}</select>
     <input className="input" type="number" min="1" placeholder="Starting Ayah" value={form.startAyah} onChange={e=>setForm({...form,startAyah:e.target.value})}/>
     <label className="text-xs font-bold md:col-span-2">Profile photo<label className="btn mt-1 block w-full bg-slate-100 text-center cursor-pointer">Upload photo<input hidden type="file" accept="image/*" onChange={e=>setPhotoFile(e.target.files?.[0]||null)}/></label></label>
   </div>
   <div className="flex justify-end gap-2 border-t p-4">
     <button className="btn bg-slate-100" onClick={()=>setShowCreate(false)}>Cancel</button>
     <button className="btn btn-primary" disabled={saving||!form.fullName||!form.startSurah} onClick={create}>{saving?'Creating...':'Create student'}</button>
   </div>
 </div></div>}
 </AdminShell>
}

function InfoBox({k,v,red,wide}:{k:string;v:string;red?:boolean;wide?:boolean}){return <div className={`rounded-xl bg-slate-50 p-3 ${wide?'sm:col-span-2':''}`}><div className="text-xs text-slate-400">{k}</div><div className={`mt-1 text-sm font-semibold ${red?'text-rose-700':''}`}>{v}</div></div>}
function Section({title,children}:{title:string;children:React.ReactNode}){return <div><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{title}</div>{children}</div>}

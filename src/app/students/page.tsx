'use client';
import AdminShell from '@/components/AdminShell';
import QuranProgress from '@/components/QuranProgress';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import { Student } from '@/lib/data';
import { createStudent, loadClasses, loadStudents, loadSurahs, updateStudentBasic, updateStudentClass, updateStudentSection, uploadProfileImage, loadStudentExtended, updateStudentExtended, type LiveClass } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';
import { loadCMSSettings } from '@/lib/cms-live-store';
import { printAcademicIdCard } from '@/lib/id-card';
import { label } from '@/lib/quran';

type ExtProfile = {
  blood_group: string|null; genotype: string|null; home_address: string|null; nationality: string|null;
  parent_name: string|null; parent_phone: string|null; parent_email: string|null;
  guardian_name: string|null; guardian_phone: string|null; guardian_email: string|null; guardian_relationship: string|null;
  emergency_contact_name: string|null; emergency_contact_phone: string|null;
  date_of_birth: string|null; gender: string|null;
};

const blankExt: ExtProfile = {blood_group:null,genotype:null,home_address:null,nationality:'Nigerian',parent_name:null,parent_phone:null,parent_email:null,guardian_name:null,guardian_phone:null,guardian_email:null,guardian_relationship:null,emergency_contact_name:null,emergency_contact_phone:null,date_of_birth:null,gender:null};

export default function Students(){
 const [all,setAll]=useState<Student[]>([]),[classes,setClasses]=useState<LiveClass[]>([]),[surahs,setSurahs]=useState<any[]>([]),[q,setQ]=useState(''),[section,setSection]=useState('All');
 const [logoUrl,setLogoUrl]=useState<string|null>(null);
 const [selected,setSelected]=useState<Student|null>(null);
 const [extProfile,setExtProfile]=useState<ExtProfile>(blankExt);
 const [edit,setEdit]=useState<Student|null>(null);
 const [editExt,setEditExt]=useState<ExtProfile>(blankExt);
 const [showCreate,setShowCreate]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[photoFile,setPhotoFile]=useState<File|null>(null);
 const [activeTab,setActiveTab]=useState<'academic'|'personal'|'contacts'>('academic');
 const [form,setForm]=useState({admissionNo:'',fullName:'',dateOfBirth:'',gender:'',section:'day',programYear:'year_1',direction:'baqarah_to_nas',startSurah:'2',startAyah:'1',classId:'',photoUrl:''});

 async function refresh(){const [students,cls,quran,settings]=await Promise.all([loadStudents(),loadClasses(),loadSurahs(),loadCMSSettings()]);setAll(students);setClasses(cls);setSurahs(quran);setLogoUrl((settings as any).logo_url?.url||(settings as any).logo_url||null)}
 useEffect(()=>{refresh()},[]);

 useEffect(()=>{
   if(!selected) return;
   loadStudentExtended(selected.id).then(d=>setExtProfile(d||blankExt));
   setActiveTab('academic');
 },[selected]);

 const filtered=useMemo(()=>all.filter(s=>(section==='All'||s.section===section)&&s.name.toLowerCase().includes(q.toLowerCase())),[all,q,section]);

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

 async function printStudentId(s:any){await printAcademicIdCard({type:'STUDENT',name:s.name,id:s.admissionNo,admissionNo:s.admissionNo,photoUrl:s.photoUrl,year:s.year,section:s.section,className:s.className,expiry:s.idExpiresOn,logoUrl});}

 function openEdit(s:Student){setEdit(s);loadStudentExtended(s.id).then(d=>setEditExt(d||blankExt));}

 return <AdminShell title="Students"><div className="space-y-4">
  {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}
  <div className="card overflow-hidden">
   <div className="flex flex-col gap-3 border-b p-5 md:flex-row md:items-center md:justify-between">
     <div><h2 className="font-bold">Student Directory</h2><p className="text-xs text-slate-500">Admin can create, edit, place and manage students.</p></div>
     <button className="btn btn-primary" onClick={()=>setShowCreate(true)}>+ Add Student</button>
   </div>
   <div className="flex flex-col gap-3 border-b p-4 md:flex-row">
     <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student..." className="rounded-lg border px-3 py-2 text-sm md:w-72"/>
     <select value={section} onChange={e=>setSection(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option>All</option><option>Day</option><option>Boarding</option></select>
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
     <td className="pr-4"><div className="flex gap-2"><button onClick={()=>setSelected(s)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">Profile</button><button onClick={()=>openEdit(s)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Edit</button></div></td>
   </tr>)}</tbody></table></div>
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
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Personal & Medical</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold">Date of birth<input className="input mt-1 w-full" type="date" value={editExt.date_of_birth||''} onChange={e=>setEditExt({...editExt,date_of_birth:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Gender<select className="input mt-1 w-full" value={editExt.gender||''} onChange={e=>setEditExt({...editExt,gender:e.target.value||null})}><option value="">Select</option><option>Male</option><option>Female</option></select></label>
         <label className="text-xs font-bold">Blood group<select className="input mt-1 w-full" value={editExt.blood_group||''} onChange={e=>setEditExt({...editExt,blood_group:e.target.value||null})}><option value="">Select</option>{['A+','A−','B+','B−','AB+','AB−','O+','O−'].map(g=><option key={g}>{g}</option>)}</select></label>
         <label className="text-xs font-bold">Genotype<select className="input mt-1 w-full" value={editExt.genotype||''} onChange={e=>setEditExt({...editExt,genotype:e.target.value||null})}><option value="">Select</option>{['AA','AS','AC','SS','SC','CC'].map(g=><option key={g}>{g}</option>)}</select></label>
         <label className="text-xs font-bold">Nationality<input className="input mt-1 w-full" value={editExt.nationality||''} onChange={e=>setEditExt({...editExt,nationality:e.target.value||null})}/></label>
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

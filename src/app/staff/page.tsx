'use client';
import AdminShell from '@/components/AdminShell';
import Link from 'next/link';
import { loadStaffProfiles, createStaffAccount, updateStaffProfile, updateStaffCredentials, loadClasses, uploadProfileImage, type LiveClass, loadStaffSignaturesAdmin, adminClearStaffSignature, type StaffSignatureRow } from '@/lib/live-store';
import { loadAdminTeam, saveTeamProfile, deleteTeamProfile, loadCMSSettings } from '@/lib/cms-live-store';
import { printAcademicIdCard } from '@/lib/id-card';
import { useEffect, useState, useMemo } from 'react';

type StaffProfile={id:string;full_name:string;role:string;gender:string|null;email:string|null;phone:string|null;avatar_url:string|null;staff_id:string|null;employment_status:string;job_title:string|null;department:string|null;joined_on:string|null;id_expires_on:string|null;bio:string|null;show_on_website:boolean;username:string|null;qualifications:string|null;experience:string|null;subjects:string|null;preferred_email:string|null};
type TeamProfile={id?:string;full_name:string;role_title:string;category:string;photo_url:string|null;brief_bio:string|null;full_profile:string;display_on_homepage:boolean;published:boolean;sort_order:number;qualifications?:string|null;experience?:string|null;subjects?:string|null};

const ROLE_TITLES=['Director','Assistant Director','School Supervisor','Principal','Vice Principal','Head of Academics','Administrative Officer','Other'];
const STATUS_OPTS=['active','inactive','suspended','left'];
const blankTeam:TeamProfile={full_name:'',role_title:'Director',category:'leadership',photo_url:null,brief_bio:'',full_profile:'',display_on_homepage:false,published:true,sort_order:0,qualifications:'',experience:'',subjects:''};

export default function StaffPage(){
 const [tab,setTab]=useState<'people'|'signatures'>('people');
 const [staff,setStaff]=useState<StaffProfile[]>([]);
 const [classes,setClasses]=useState<LiveClass[]>([]);
 const [team,setTeam]=useState<TeamProfile[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [logoUrl,setLogoUrl]=useState<string|null>(null);

 /* ── teaching edit ── */
 const [editT,setEditT]=useState<StaffProfile|null>(null);
 const [editTOrigEmail,setEditTOrigEmail]=useState('');
 const [photoFile,setPhotoFile]=useState<File|null>(null);
 const [newPassword,setNewPassword]=useState('');
 const [showPwEditT,setShowPwEditT]=useState(false);

 /* ── create teacher ── */
 const [showCreate,setShowCreate]=useState(false);
 const [cf,setCf]=useState({fullName:'',email:'',password:'',phone:'',jobTitle:"Qur'an Teacher",department:"Qur'an Memorization",joinedOn:'',username:''});
 const [showPwCreate,setShowPwCreate]=useState(false);

 /* ── leadership edit ── */
 const [editL,setEditL]=useState<Partial<TeamProfile>|null>(null);
 const [lPhotoFile,setLPhotoFile]=useState<File|null>(null);
 const [lAccEmail,setLAccEmail]=useState('');
 const [lAccPassword,setLAccPassword]=useState('');
 const [lAccRole,setLAccRole]=useState('admin');
 const [lAccUsername,setLAccUsername]=useState('');
 const [showPwLeader,setShowPwLeader]=useState(false);

 /* ── account role edit ── */
 const [editA,setEditA]=useState<StaffProfile|null>(null);
 const [editAOrigEmail,setEditAOrigEmail]=useState('');
 const [showPwEditA,setShowPwEditA]=useState(false);

 /* ── signatures tab ── */
 const [sigRows,setSigRows]=useState<StaffSignatureRow[]>([]);
 const [sigLoading,setSigLoading]=useState(false);
 const [sigBusy,setSigBusy]=useState<string|null>(null); // staff_id being acted on
 const [sigPreview,setSigPreview]=useState<StaffSignatureRow|null>(null);

 const refresh=async()=>{
   const [s,c,t,settings]=await Promise.all([loadStaffProfiles(),loadClasses(),loadAdminTeam(),loadCMSSettings()]);
   setStaff(s as unknown as StaffProfile[]);setClasses(c);setTeam(t as TeamProfile[]);
   setLogoUrl((settings as any).logo_url?.url||(settings as any).logo_url||null);
 };
 useEffect(()=>{refresh()},[]);

 async function printStaffId(a:StaffProfile){const managementRoles=['admin','super_admin','principal','finance','admissions','security','librarian','accountant'];const type=managementRoles.includes(a.role)?'MANAGEMENT':'STAFF';const linkedTeam=team.find(t=>t.full_name.trim().toLowerCase()===a.full_name.trim().toLowerCase());await printAcademicIdCard({type,name:a.full_name,id:a.staff_id||a.id,photoUrl:a.avatar_url||linkedTeam?.photo_url||null,jobTitle:a.job_title??linkedTeam?.role_title??undefined,department:a.department??undefined,phone:a.phone??undefined,expiry:a.id_expires_on??null,logoUrl});}

 const teachers=useMemo(()=>staff.filter(s=>s.role==='teacher'),[staff]);
 const teacherClasses=useMemo(()=>{const m:Record<string,string[]>={};for(const c of classes)for(const t of c.teachers){if(!m[t.id])m[t.id]=[];m[t.id].push(c.name)}return m;},[classes]);

 async function saveTeacher(){
   if(!editT)return; setBusy(true);
   try{
     let avatar_url=editT.avatar_url;
     if(photoFile){avatar_url=await uploadProfileImage(photoFile,'staff');}
     await updateStaffProfile(editT.id,{full_name:editT.full_name,gender:editT.gender,phone:editT.phone,job_title:editT.job_title,department:editT.department,employment_status:editT.employment_status,avatar_url,bio:editT.bio,show_on_website:editT.show_on_website,username:editT.username?.trim().toLowerCase()||null,qualifications:editT.qualifications||null,experience:editT.experience||null,subjects:editT.subjects||null,preferred_email:editT.preferred_email?.trim().toLowerCase()||null});
     const newEmail=(editT.email||'').trim().toLowerCase();
     const emailChanged=newEmail&&newEmail!==editTOrigEmail;
     const pwChanged=newPassword.trim().length>=8;
     if(emailChanged||pwChanged){
       await updateStaffCredentials(editT.id,{email:emailChanged?newEmail:undefined,password:pwChanged?newPassword.trim():undefined});
     }
     await refresh();setEditT(null);setPhotoFile(null);setNewPassword('');setShowPwEditT(false);setMessage('Staff profile updated.');
   }catch(e:any){setMessage(e?.message??'Update failed.')}finally{setBusy(false)}
 }

 async function createTeacher(e:React.FormEvent){
   e.preventDefault();setBusy(true);
   try{
     const r=await createStaffAccount({...cf,role:'teacher'});
     if(cf.username.trim()&&r?.user_id){
       await updateStaffProfile(r.user_id,{username:cf.username.trim().toLowerCase()});
     }
     setShowCreate(false);setCf({fullName:'',email:'',password:'',phone:'',jobTitle:"Qur'an Teacher",department:"Qur'an Memorization",joinedOn:'',username:''});
     await refresh();setMessage(`Teacher created. Staff ID: ${r?.staff_id||'auto-assigned'}.`);
   }catch(e:any){setMessage(e?.message??'Unable to create teacher.')}finally{setBusy(false)}
 }

 async function createLeaderAccount(){
   if(!editL?.full_name||!lAccEmail||lAccPassword.length<8)return;
   setBusy(true);
   try{
     const r=await createStaffAccount({fullName:editL.full_name,email:lAccEmail,password:lAccPassword,role:lAccRole,phone:'',jobTitle:editL.role_title||'',department:'Leadership',joinedOn:''});
     if(r?.user_id){await updateStaffProfile(r.user_id,{username:lAccUsername.trim().toLowerCase()||undefined,avatar_url:editL.photo_url??undefined,job_title:editL.role_title||undefined,department:'Leadership'});}
     await refresh();
     setLAccEmail('');setLAccPassword('');setLAccUsername('');setLAccRole('admin');
     setMessage(`Account created for ${editL.full_name}. They can now log in with ${lAccRole} access. Staff ID: ${r?.staff_id||'auto-assigned'}.`);
   }catch(e:any){setMessage(e?.message??'Unable to create account.')}finally{setBusy(false)}
 }

 async function saveLeader(){
   if(!editL)return; setBusy(true);
   try{
     let photo_url=editL.photo_url??null;
     if(lPhotoFile){photo_url=await uploadProfileImage(lPhotoFile,'staff');}
     await saveTeamProfile({...editL,photo_url});
     const linkedStaff=staff.find(s=>s.full_name.trim().toLowerCase()===(editL.full_name||'').trim().toLowerCase());
     if(linkedStaff) await updateStaffProfile(linkedStaff.id,{avatar_url:photo_url,job_title:editL.role_title||linkedStaff.job_title,department:linkedStaff.department||'Leadership'});
     await refresh();setEditL(null);setLPhotoFile(null);setMessage('Profile saved.');
   }catch(e:any){setMessage(e?.message??'Save failed.')}finally{setBusy(false)}
 }

 async function deleteLeader(id:string){
   if(!confirm('Delete this profile? This cannot be undone.'))return;
   setBusy(true);
   try{await deleteTeamProfile(id);await refresh();setMessage('Profile deleted.');}
   catch(e:any){setMessage(e?.message??'Delete failed.')}finally{setBusy(false)}
 }

 async function toggleWebsite(s:StaffProfile){
   setBusy(true);
   try{await updateStaffProfile(s.id,{show_on_website:!s.show_on_website});await refresh();}
   catch(e:any){setMessage(e?.message??'Update failed.')}finally{setBusy(false)}
 }

 async function saveAccountRole(){
   if(!editA)return; setBusy(true);
   try{
     await updateStaffProfile(editA.id,{full_name:editA.full_name,phone:editA.phone,employment_status:editA.employment_status,role:editA.role,username:editA.username?.trim().toLowerCase()||null,preferred_email:editA.preferred_email?.trim().toLowerCase()||null});
     const newEmail=(editA.email||'').trim().toLowerCase();
     const emailChanged=newEmail&&newEmail!==editAOrigEmail;
     const pwChanged=newPassword.trim().length>=8;
     if(emailChanged||pwChanged){
       await updateStaffCredentials(editA.id,{email:emailChanged?newEmail:undefined,password:pwChanged?newPassword.trim():undefined});
     }
     await refresh();setEditA(null);setNewPassword('');setShowPwEditA(false);setMessage('Account updated.');
   }catch(e:any){setMessage(e?.message??'Update failed.')}finally{setBusy(false)}
 }

 async function toggleHomepage(t:TeamProfile){
   setBusy(true);
   try{await saveTeamProfile({...t,display_on_homepage:!t.display_on_homepage});await refresh();}
   catch(e:any){setMessage(e?.message??'Update failed.')}finally{setBusy(false)}
 }

 return <AdminShell title="Staff">
  <div className="space-y-6">

   <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-indigo-900 p-6 text-white shadow-xl md:p-8">
     <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
       <div>
         <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">People Management</div>
         <h2 className="mt-2 text-3xl font-black">Staff</h2>
         <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Manage teaching staff profiles, bios, website visibility, and school leadership. Class assignments are done in <Link href="/classes" className="underline underline-offset-2">Classes & Teachers</Link>.</p>
       </div>
       <div className="flex flex-wrap gap-2">
         {tab==='people'&&<><button className="btn bg-white text-emerald-950" onClick={()=>setShowCreate(true)}>+ Create teacher</button><button className="btn bg-white text-emerald-950" onClick={()=>setEditL({...blankTeam})}>+ Add leader</button></>}
       </div>

     </div>
   </section>

   {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}<button className="ml-3 text-emerald-600" onClick={()=>setMessage('')}>✕</button></div>}

   {/* Tabs */}
   <div className="flex gap-1 rounded-2xl border bg-slate-50 p-1">
     {(['people','signatures'] as const).map(t=><button key={t} onClick={()=>{setTab(t);if(t==='signatures'){setSigLoading(true);loadStaffSignaturesAdmin().then(r=>{setSigRows(r);setSigLoading(false);});}}} className={`flex-1 rounded-xl py-3 text-sm font-black transition ${tab===t?'bg-white shadow text-slate-900':'text-slate-500 hover:text-slate-700'}`}>{t==='people'?'Staff & Management':'Signatures'}</button>)}
   </div>

   {/* ── STAFF & MANAGEMENT ── */}
   {tab==='people'&&<div className="space-y-8">
     <section>
       <div className="mb-4 flex items-end justify-between gap-3"><div><h3 className="text-xl font-black text-slate-900">Teaching Staff</h3><p className="text-sm text-slate-500">Manage teachers, photos, class assignments and staff ID cards.</p></div><button className="btn bg-emerald-50 text-emerald-900" onClick={()=>setShowCreate(true)}>+ Create teacher</button></div>
       <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
         {teachers.map(t=><article key={t.id} className="card overflow-hidden">
           <div className="p-5"><div className="flex items-start gap-4"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{t.avatar_url?<img src={t.avatar_url} alt={t.full_name} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-2xl font-black text-slate-300">{t.full_name.charAt(0)}</div>}</div><div className="min-w-0 flex-1"><div className="font-black truncate">{t.full_name}</div><div className="text-xs text-emerald-700 font-semibold">{t.staff_id||'Staff ID pending'}</div><div className="text-xs text-slate-500 mt-0.5">{t.job_title||'Teacher'}{t.department?' · '+t.department:''}</div><span className="pill mt-1.5 text-[10px] bg-emerald-50 text-emerald-700">{t.employment_status}</span></div></div>{(teacherClasses[t.id]??[]).length>0&&<div className="mt-3 flex flex-wrap gap-1">{teacherClasses[t.id].map(n=><span key={n} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{n}</span>)}</div>}{(teacherClasses[t.id]??[]).length===0&&<p className="mt-3 text-xs text-slate-400">No class assigned — <Link href="/classes" className="underline">assign a class</Link>.</p>}</div>
           <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3"><button className="btn bg-emerald-900 text-white text-sm py-1.5 font-black" onClick={()=>printStaffId(t)}>Print ID</button><button className="btn bg-slate-100 text-sm py-1.5" onClick={()=>{setEditT(t);setEditTOrigEmail((t.email||'').trim().toLowerCase());setPhotoFile(null);setNewPassword('');setShowPwEditT(false);}}>Edit profile</button></div>
         </article>)}
         {!teachers.length&&<div className="card p-8 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">No teachers yet.</div>}
       </div>
     </section>
     <section>
       <div className="mb-4 flex items-end justify-between gap-3"><div><h3 className="text-xl font-black text-slate-900">Management & Leadership</h3><p className="text-sm text-slate-500">One place for management profiles, photos, system access and management ID cards.</p></div><button className="btn bg-indigo-50 text-indigo-900" onClick={()=>setEditL({...blankTeam})}>+ Add leader</button></div>
       <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
         {team.map((t:any)=>{const account=staff.find(a=>a.full_name.trim().toLowerCase()===t.full_name.trim().toLowerCase());const photo=account?.avatar_url||t.photo_url;return <article key={'team-'+t.id} className="card overflow-hidden">
           <div className="p-5"><div className="flex items-start gap-4"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{photo?<img src={photo} alt={t.full_name} className="h-full w-full object-cover object-top"/>:<div className="grid h-full place-items-center text-2xl font-black text-slate-300">{t.full_name.charAt(0)}</div>}</div><div className="min-w-0 flex-1"><div className="font-black truncate">{t.full_name}</div><div className="text-xs text-emerald-700 font-semibold">{t.role_title}</div>{account?.staff_id&&<div className="text-xs text-slate-500 mt-0.5">{account.staff_id}</div>}<div className="flex flex-wrap gap-1 mt-1.5"><span className="pill text-[10px] bg-indigo-50 text-indigo-700">{account?.role==='admin'?'Administrator':account?.role||'Profile only'}</span>{t.display_on_homepage&&<span className="pill text-[10px] bg-emerald-50 text-emerald-700">On homepage</span>}</div></div></div>{t.brief_bio&&<p className="mt-3 text-xs text-slate-500 line-clamp-2">{t.brief_bio}</p>}</div>
           <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3"><button className="btn bg-indigo-900 text-white text-sm py-1.5 font-black" onClick={()=>account&&printStaffId(account)} disabled={!account}>Print ID</button><button className="btn bg-slate-100 text-sm py-1.5" onClick={()=>{setEditL({...t});setLPhotoFile(null)}}>Edit profile</button>{account&&<button className="btn bg-slate-100 text-xs py-1.5" onClick={()=>{setEditA({...account});setEditAOrigEmail((account.email||'').trim().toLowerCase());setNewPassword('');setShowPwEditA(false);}}>Access</button>}{account&&account.role!=='super_admin'&&<button className="btn bg-indigo-50 text-indigo-700 text-xs py-1.5" onClick={async()=>{setBusy(true);try{await updateStaffProfile(account.id,{role:account.role==='admin'?'principal':'admin'});await refresh();setMessage(account.role==='admin'?'Admin access removed.':account.full_name+' is now an Administrator.')}catch(e:any){setMessage(e?.message??'Failed.')}finally{setBusy(false)}}}>{account.role==='admin'?'Revoke admin':'Grant admin'}</button>}</div>
         </article>})}
         {staff.filter(a=>a.role!=='teacher'&&a.role!=='parent'&&!team.some(t=>t.full_name.trim().toLowerCase()===a.full_name.trim().toLowerCase())).map(a=><article key={'account-'+a.id} className="card overflow-hidden"><div className="p-5"><div className="flex items-start gap-4"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{a.avatar_url?<img src={a.avatar_url} alt={a.full_name} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-2xl font-black text-slate-300">{a.full_name.charAt(0)}</div>}</div><div className="min-w-0 flex-1"><div className="font-black truncate">{a.full_name}</div><div className="text-xs text-emerald-700 font-semibold">{a.job_title||a.role}</div><div className="text-xs text-slate-500 mt-0.5">{a.staff_id||'Staff ID pending'}</div><span className="pill mt-1.5 text-[10px] bg-slate-100 text-slate-700">{a.role}</span></div></div></div><div className="flex flex-wrap gap-2 border-t px-5 py-3"><button className="btn bg-indigo-900 text-white text-sm py-1.5 font-black" onClick={()=>printStaffId(a)}>Print ID</button><button className="btn bg-slate-100 text-sm py-1.5" onClick={()=>{setEditA({...a});setEditAOrigEmail((a.email||'').trim().toLowerCase());setNewPassword('');setShowPwEditA(false);}}>Edit access</button></div></article>)}
       </div>
     </section>
     <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><b>One person, one place:</b> photos, profile information, system access and ID printing are now managed from these two lists. Student IDs remain under Students.</div>
   </div>}
  {/* ── SIGNATURES TAB ── */}
  {tab==='signatures'&&<div className="space-y-4">
    <div className="card overflow-hidden">
      <div className="border-b p-5 flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900">Staff Signature Status</h2>
          <p className="text-xs text-slate-500 mt-0.5">Staff add their own signatures from Edit Profile in their account. Admin can view and clear them here.</p>
        </div>
        <button className="btn bg-slate-100 text-sm" onClick={()=>{setSigLoading(true);loadStaffSignaturesAdmin().then(r=>{setSigRows(r);setSigLoading(false);});}}>Refresh</button>
      </div>
      {sigLoading&&<div className="p-8 text-center text-sm text-slate-400">Loading signatures…</div>}
      {!sigLoading&&sigRows.length===0&&<div className="p-8 text-center text-sm text-slate-400">No staff signatures on record yet.</div>}
      {!sigLoading&&sigRows.length>0&&<div className="divide-y">
        {sigRows.map(r=><div key={r.staff_id} className="flex items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-black text-sm text-slate-900 truncate">{r.full_name}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {r.role.replace('_',' ')}
              {r.job_title?` · ${r.job_title}`:''}
              {r.staff_id_no?` · ${r.staff_id_no}`:''}
            </div>
          </div>
          {r.has_signature
            ?<span className="pill bg-emerald-50 text-emerald-700 text-[11px] font-black shrink-0">✓ Signed</span>
            :<span className="pill bg-amber-50 text-amber-700 text-[11px] font-black shrink-0">⚠ No signature</span>}
          {r.has_signature&&r.signature_data&&<button
            className="btn bg-slate-100 text-xs py-1 px-3 shrink-0"
            onClick={()=>setSigPreview(r)}>Preview</button>}
          {r.has_signature&&<button
            className="btn text-xs py-1 px-3 bg-rose-50 text-rose-700 shrink-0"
            disabled={sigBusy===r.staff_id}
            onClick={async()=>{
              if(!confirm(`Remove ${r.full_name}'s signature? They will need to re-add it.`))return;
              setSigBusy(r.staff_id);
              try{await adminClearStaffSignature(r.staff_id);setSigRows(prev=>prev.map(x=>x.staff_id===r.staff_id?{...x,has_signature:false,signature_data:null,signature_updated_at:null}:x));}
              catch(e:any){setMessage(e?.message||'Failed to remove signature.');}
              finally{setSigBusy(null);}
            }}>{sigBusy===r.staff_id?'Removing…':'Remove'}</button>}
        </div>)}
      </div>}
    </div>
  </div>}

  {/* ── SIGNATURE PREVIEW MODAL ── */}
  {sigPreview&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto my-8 w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
    <div className="flex items-center justify-between gap-2 mb-4"><h3 className="font-black">{sigPreview.full_name}</h3><button className="btn bg-slate-100" onClick={()=>setSigPreview(null)}>Close</button></div>
    <p className="text-xs text-slate-500 mb-3">{sigPreview.role.replace('_',' ')}{sigPreview.job_title?` · ${sigPreview.job_title}`:''}</p>
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 flex items-center justify-center min-h-[100px]">
      {sigPreview.signature_data&&<img src={sigPreview.signature_data} alt="signature" className="max-h-24 max-w-full object-contain"/>}
    </div>
    {sigPreview.signature_updated_at&&<p className="mt-3 text-xs text-slate-400 text-center">Added {new Date(sigPreview.signature_updated_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</p>}
  </div></div>}

  </div>

  {/* ── EDIT TEACHER MODAL ── */}
  {editT&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto mt-6 w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
   <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Edit teacher</h2><p className="text-sm text-slate-500">{editT.full_name} · {editT.staff_id||'Staff ID pending'}</p></div><button onClick={()=>{setEditT(null);setNewPassword('');setShowPwEditT(false);}} className="rounded-xl bg-slate-100 p-2">✕</button></div>
   <div className="divide-y overflow-y-auto max-h-[75vh]">
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Profile</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold sm:col-span-2">Full name<input className="input mt-1 w-full" value={editT.full_name} onChange={e=>setEditT({...editT,full_name:e.target.value})}/></label>
         <label className="text-xs font-bold">Gender<select className="input mt-1 w-full" value={editT.gender||''} onChange={e=>setEditT({...editT,gender:e.target.value||null})}><option value="">Not set</option><option value="male">Male</option><option value="female">Female</option></select></label>
         <label className="text-xs font-bold">Phone<input className="input mt-1 w-full" value={editT.phone||''} onChange={e=>setEditT({...editT,phone:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Employment status<select className="input mt-1 w-full" value={editT.employment_status} onChange={e=>setEditT({...editT,employment_status:e.target.value})}>{STATUS_OPTS.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
         <label className="text-xs font-bold">Job title<input className="input mt-1 w-full" value={editT.job_title||''} onChange={e=>setEditT({...editT,job_title:e.target.value||null})}/></label>
         <label className="text-xs font-bold">Department<input className="input mt-1 w-full" value={editT.department||''} onChange={e=>setEditT({...editT,department:e.target.value||null})}/></label>
         <label className="text-xs font-bold sm:col-span-2">Email address <span className="font-normal text-slate-400">(login email — changing this updates their login)</span><input type="email" className="input mt-1 w-full" placeholder="e.g. teacher@amqm.edu.ng" value={editT.email||''} onChange={e=>setEditT({...editT,email:e.target.value||null})}/>{editT.email&&editT.email.trim().toLowerCase()!==editTOrigEmail&&<p className="mt-1 text-[11px] text-amber-600 font-semibold">⚠ Email will be updated — teacher must use the new address to log in.</p>}</label>
         <label className="text-xs font-bold sm:col-span-2">Preferred email <span className="font-normal text-slate-400">(optional — staff can also login with this address)</span><input type="email" className="input mt-1 w-full" placeholder="e.g. teacher@gmail.com" value={editT.preferred_email||''} onChange={e=>setEditT({...editT,preferred_email:e.target.value||null})}/></label>
         <label className="text-xs font-bold sm:col-span-2">Login username <span className="font-normal text-slate-400">(alternative login — teacher can use email, preferred email, OR username)</span><input className="input mt-1 w-full" placeholder="e.g. ustaz.auwal" value={editT.username||''} onChange={e=>setEditT({...editT,username:e.target.value||null})}/></label>
         <div className="sm:col-span-2"><label className="text-xs font-bold">New password <span className="font-normal text-slate-400">(leave blank to keep current password)</span></label><div className="relative mt-1"><input type={showPwEditT?'text':'password'} className="input w-full pr-10" placeholder="8+ characters" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg" onClick={()=>setShowPwEditT(p=>!p)} tabIndex={-1}>{showPwEditT?'🙈':'👁'}</button></div></div>
       </div>
       <label className="text-xs font-bold">Bio (shown on website)<textarea className="input mt-1 w-full resize-none" rows={3} placeholder="A short bio about this teacher..." value={editT.bio||''} onChange={e=>setEditT({...editT,bio:e.target.value||null})}/></label>
       <label className="text-xs font-bold">Qualifications<textarea className="input mt-1 w-full resize-none" rows={2} placeholder="e.g. B.Ed Islamic Studies, Ijazah in Qur'an" value={editT.qualifications||''} onChange={e=>setEditT({...editT,qualifications:e.target.value||null})}/></label>
       <label className="text-xs font-bold">Experience<textarea className="input mt-1 w-full resize-none" rows={2} placeholder="e.g. 8 years teaching Hifz" value={editT.experience||''} onChange={e=>setEditT({...editT,experience:e.target.value||null})}/></label>
       <label className="text-xs font-bold">Subjects / Responsibilities<textarea className="input mt-1 w-full resize-none" rows={2} placeholder="e.g. Quran Memorization, Tajweed" value={editT.subjects||''} onChange={e=>setEditT({...editT,subjects:e.target.value||null})}/></label>
       <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 hover:bg-slate-50">
         <div className={`h-5 w-9 rounded-full transition-colors ${editT.show_on_website?'bg-emerald-500':'bg-slate-200'}`}><div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editT.show_on_website?'translate-x-4':'translate-x-0.5'}`}/></div>
         <input type="checkbox" hidden checked={editT.show_on_website} onChange={e=>setEditT({...editT,show_on_website:e.target.checked})}/>
         <div><div className="text-sm font-bold">Show on school website</div><div className="text-xs text-slate-500">Display this teacher's profile publicly</div></div>
       </label>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Profile photo</div>
       {editT.avatar_url&&<img src={editT.avatar_url} className="h-20 w-20 rounded-2xl object-cover"/>}
       <label className="btn block w-full bg-slate-100 text-center cursor-pointer">Change photo<input hidden type="file" accept="image/*" onChange={e=>setPhotoFile(e.target.files?.[0]||null)}/></label>
       {photoFile&&<div className="text-xs text-slate-500">Selected: {photoFile.name}</div>}
     </div>
   </div>
   <div className="flex justify-end gap-2 border-t p-4">
     <button className="btn bg-slate-100" onClick={()=>{setEditT(null);setNewPassword('');setShowPwEditT(false);}}>Cancel</button>
     <button className="btn btn-primary" disabled={busy} onClick={saveTeacher}>{busy?'Saving…':'Save changes'}</button>
   </div>
  </div></div>}

  {/* ── CREATE TEACHER MODAL ── */}
  {showCreate&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto mt-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
   <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Create teacher</h2><p className="text-sm text-slate-500">Creates a system account. Teacher will use the Teacher Workspace.</p></div><button className="btn bg-slate-100" onClick={()=>setShowCreate(false)}>Close</button></div>
   <form onSubmit={createTeacher} className="mt-5 grid gap-3 md:grid-cols-2">
     <input required className="input" placeholder="Full name" value={cf.fullName} onChange={e=>setCf({...cf,fullName:e.target.value})}/>
     <input required type="email" className="input" placeholder="Email address" value={cf.email} onChange={e=>setCf({...cf,email:e.target.value})}/>
     <div className="relative"><input required minLength={8} type={showPwCreate?'text':'password'} className="input w-full pr-10" placeholder="Temporary password (8+ chars)" value={cf.password} onChange={e=>setCf({...cf,password:e.target.value})}/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg" onClick={()=>setShowPwCreate(p=>!p)} tabIndex={-1}>{showPwCreate?'🙈':'👁'}</button></div>
     <input className="input" placeholder="Login username (e.g. ustaz.auwal)" value={cf.username} onChange={e=>setCf({...cf,username:e.target.value})}/>
     <input className="input" placeholder="Phone" value={cf.phone} onChange={e=>setCf({...cf,phone:e.target.value})}/>
     <input className="input" placeholder="Job title" value={cf.jobTitle} onChange={e=>setCf({...cf,jobTitle:e.target.value})}/>
     <input className="input" placeholder="Department" value={cf.department} onChange={e=>setCf({...cf,department:e.target.value})}/>
     <input type="date" className="input" value={cf.joinedOn} onChange={e=>setCf({...cf,joinedOn:e.target.value})}/>
     <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn bg-slate-100" onClick={()=>setShowCreate(false)}>Cancel</button><button disabled={busy} className="btn btn-primary">{busy?'Creating…':'Create teacher'}</button></div>
   </form>
  </div></div>}

  {/* ── EDIT LEADERSHIP MODAL ── */}
  {editL&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto mt-6 w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
   <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">{editL.id?'Edit profile':'New leadership profile'}</h2></div><button onClick={()=>setEditL(null)} className="rounded-xl bg-slate-100 p-2">✕</button></div>
   <div className="divide-y overflow-y-auto max-h-[75vh]">
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Identity</div>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs font-bold sm:col-span-2">Full name<input required className="input mt-1 w-full" placeholder="e.g. Dr. Aliyu Musa" value={editL.full_name||''} onChange={e=>setEditL({...editL,full_name:e.target.value})}/></label>
         <label className="text-xs font-bold">Role / title<select className="input mt-1 w-full" value={editL.role_title||'Director'} onChange={e=>setEditL({...editL,role_title:e.target.value})}>{ROLE_TITLES.map(r=><option key={r}>{r}</option>)}</select></label>
         <label className="text-xs font-bold">Category<select className="input mt-1 w-full" value={editL.category||'leadership'} onChange={e=>setEditL({...editL,category:e.target.value})}><option value="leadership">Leadership</option><option value="staff">General Staff</option></select></label>
         <label className="text-xs font-bold">Sort order<input type="number" min="0" className="input mt-1 w-full" value={editL.sort_order??0} onChange={e=>setEditL({...editL,sort_order:Number(e.target.value)})}/></label>
       </div>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Bio</div>
       <label className="text-xs font-bold">Brief bio <span className="font-normal text-slate-400">(shown on homepage card)</span><textarea className="input mt-1 w-full resize-none" rows={3} value={editL.brief_bio||''} onChange={e=>setEditL({...editL,brief_bio:e.target.value})}/></label>
       <label className="text-xs font-bold">Full profile <span className="font-normal text-slate-400">(shown on "Read more" page)</span><textarea className="input mt-1 w-full resize-none" rows={5} placeholder="Detailed biography, qualifications, achievements…" value={editL.full_profile||''} onChange={e=>setEditL({...editL,full_profile:e.target.value})}/></label>
       <label className="text-xs font-bold">Qualifications<textarea className="input mt-1 w-full resize-none" rows={2} placeholder="e.g. M.A Islamic Education, Ijazah" value={editL.qualifications||''} onChange={e=>setEditL({...editL,qualifications:e.target.value||null})}/></label>
       <label className="text-xs font-bold">Experience<textarea className="input mt-1 w-full resize-none" rows={2} placeholder="e.g. 15 years in Islamic education leadership" value={editL.experience||''} onChange={e=>setEditL({...editL,experience:e.target.value||null})}/></label>
       <label className="text-xs font-bold">Subjects / Responsibilities<textarea className="input mt-1 w-full resize-none" rows={2} placeholder="e.g. School administration, curriculum oversight" value={editL.subjects||''} onChange={e=>setEditL({...editL,subjects:e.target.value||null})}/></label>
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Photo</div>
       {editL.photo_url&&<img src={editL.photo_url} className="h-20 w-20 rounded-2xl object-cover"/>}
       <label className="btn block w-full bg-slate-100 text-center cursor-pointer">Upload photo<input hidden type="file" accept="image/*" onChange={e=>setLPhotoFile(e.target.files?.[0]||null)}/></label>
       {lPhotoFile&&<div className="text-xs text-slate-500">Selected: {lPhotoFile.name}</div>}
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-indigo-700">Account & System Access</div>
       {(()=>{
         const existing=staff.find(s=>s.full_name.trim().toLowerCase()===(editL?.full_name||'').trim().toLowerCase());
         if(existing){return(
           <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-2">
             <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-indigo-500"/><span className="text-sm font-bold text-indigo-900">System account exists</span></div>
             <p className="text-xs text-indigo-700">Role: <strong>{existing.role}</strong>{existing.username?` · @${existing.username}`:''}{existing.staff_id?` · ${existing.staff_id}`:''}</p>
             <p className="text-xs text-slate-500">To change role, password, or username — go to the <strong>Accounts &amp; Access</strong> tab and find this person there.</p>
           </div>
         );}
         return(<div className="space-y-3">
           <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">No system account yet. Create login credentials below to let this person sign in and access the system.</div>
           <div className="grid gap-3 sm:grid-cols-2">
             <label className="text-xs font-bold sm:col-span-2">Email address <span className="font-normal text-slate-400">(used for login)</span><input type="email" className="input mt-1 w-full" placeholder="e.g. supervisor@amqm.edu.ng" value={lAccEmail} onChange={e=>setLAccEmail(e.target.value)}/></label>
             <label className="text-xs font-bold">Temporary password<div className="relative mt-1"><input type={showPwLeader?'text':'password'} className="input w-full pr-10" placeholder="8+ characters" value={lAccPassword} onChange={e=>setLAccPassword(e.target.value)}/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg" onClick={()=>setShowPwLeader(p=>!p)} tabIndex={-1}>{showPwLeader?'🙈':'👁'}</button></div></label>
             <label className="text-xs font-bold">System role<select className="input mt-1 w-full" value={lAccRole} onChange={e=>setLAccRole(e.target.value)}><option value="admin">Administrator</option><option value="principal">Principal</option><option value="finance">Finance</option><option value="admissions">Admissions</option><option value="security">Security</option></select></label>
             <label className="text-xs font-bold sm:col-span-2">Login username <span className="font-normal text-slate-400">(optional)</span><input className="input mt-1 w-full" placeholder="e.g. mubarak.supervisor" value={lAccUsername} onChange={e=>setLAccUsername(e.target.value)}/></label>
           </div>
           {lAccEmail&&lAccPassword.length>=8&&(
             <button disabled={busy} onClick={createLeaderAccount} className="btn w-full bg-indigo-600 text-white font-black">
               {busy?'Creating…':`Create account & grant ${lAccRole==='admin'?'Administrator':lAccRole.charAt(0).toUpperCase()+lAccRole.slice(1)} access →`}
             </button>
           )}
         </div>);
       })()}
     </div>
     <div className="p-5 rounded-xl bg-slate-50 mx-5 mb-2 text-xs text-slate-500">
       <span className="font-bold text-slate-700">Signature: </span>
       Staff members add their own signature by logging into their account and opening <strong>Edit Profile</strong>.
       Admin can view and manage all signatures in the <strong>Signatures</strong> tab.
     </div>
     <div className="p-5 space-y-3">
       <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Visibility</div>
       <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 hover:bg-slate-50">
         <div className={`h-5 w-9 rounded-full transition-colors ${editL.display_on_homepage?'bg-emerald-500':'bg-slate-200'}`}><div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editL.display_on_homepage?'translate-x-4':'translate-x-0.5'}`}/></div>
         <input type="checkbox" hidden checked={!!editL.display_on_homepage} onChange={e=>setEditL({...editL,display_on_homepage:e.target.checked})}/>
         <div><div className="text-sm font-bold">Show on homepage</div><div className="text-xs text-slate-500">Display on the public school website homepage</div></div>
       </label>
       <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 hover:bg-slate-50">
         <div className={`h-5 w-9 rounded-full transition-colors ${editL.published?'bg-emerald-500':'bg-slate-200'}`}><div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editL.published?'translate-x-4':'translate-x-0.5'}`}/></div>
         <input type="checkbox" hidden checked={!!editL.published} onChange={e=>setEditL({...editL,published:e.target.checked})}/>
         <div><div className="text-sm font-bold">Published</div><div className="text-xs text-slate-500">Unpublished profiles are hidden from all public views</div></div>
       </label>
     </div>
   </div>
   <div className="flex justify-end gap-2 border-t p-4">
     <button className="btn bg-slate-100" onClick={()=>setEditL(null)}>Cancel</button>
     <button className="btn btn-primary" disabled={busy||!editL.full_name} onClick={saveLeader}>{busy?'Saving…':'Save'}</button>
   </div>
  </div></div>}

  {/* ── GRANT / REVOKE ADMIN MODAL ── */}
  {/* ── EDIT ACCOUNT MODAL ── */}
  {editA&&(()=>{
   const CHANGEABLE_ROLES=['admin','principal','finance','admissions','security'];
   const [aPass,setAPass]=[newPassword,setNewPassword];
   return<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto mt-8 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Account: {editA.full_name}</h2><p className="text-sm text-slate-500">{editA.staff_id||'No staff ID'}</p></div><button onClick={()=>{setEditA(null);setNewPassword('');setShowPwEditA(false);}} className="rounded-xl bg-slate-100 p-2">✕</button></div>
    <div className="p-5 space-y-4">
     <label className="text-xs font-bold block">Access role
      <select className="input mt-1 w-full" value={editA.role} onChange={e=>setEditA({...editA,role:e.target.value})}>
       {CHANGEABLE_ROLES.map(r=><option key={r} value={r}>{r==='admin'?'Administrator':r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
      </select>
      {editA.role==='admin'&&<p className="mt-1 text-xs text-amber-600">Administrator has full system access — only grant to trusted staff.</p>}
     </label>
     <label className="text-xs font-bold block">Email address <span className="font-normal text-slate-400">(login email — changing this updates their login)</span>
      <input type="email" className="input mt-1 w-full" placeholder="e.g. staff@amqm.edu.ng" value={editA.email||''} onChange={e=>setEditA({...editA,email:e.target.value||null})}/>
      {editA.email&&editA.email.trim().toLowerCase()!==editAOrigEmail&&<p className="mt-1 text-[11px] text-amber-600 font-semibold">⚠ Email will be updated — staff must use the new address to log in.</p>}
     </label>
     <label className="text-xs font-bold block">Preferred email <span className="font-normal text-slate-400">(optional — can also login with this address)</span>
      <input type="email" className="input mt-1 w-full" placeholder="e.g. staff@gmail.com" value={editA.preferred_email||''} onChange={e=>setEditA({...editA,preferred_email:e.target.value||null})}/>
     </label>
     <label className="text-xs font-bold block">Login username <span className="font-normal text-slate-400">(alternative to email or preferred email)</span>
      <input className="input mt-1 w-full" placeholder="e.g. admin.mubarak" value={editA.username||''} onChange={e=>setEditA({...editA,username:e.target.value||null})}/>
     </label>
     <label className="text-xs font-bold block">New password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
      <div className="relative mt-1"><input type={showPwEditA?'text':'password'} className="input w-full pr-10" placeholder="8+ characters" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg" onClick={()=>setShowPwEditA(p=>!p)} tabIndex={-1}>{showPwEditA?'🙈':'👁'}</button></div>
     </label>
    </div>
    <div className="flex justify-end gap-2 border-t p-4">
     <button className="btn bg-slate-100" onClick={()=>{setEditA(null);setNewPassword('');setShowPwEditA(false);}}>Cancel</button>
     <button className="btn btn-primary" disabled={busy} onClick={saveAccountRole}>{busy?'Saving…':'Save changes'}</button>
    </div>
   </div></div>;
  })()}

 </AdminShell>;
}

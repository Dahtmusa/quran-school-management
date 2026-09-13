'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCurrentProfile, updateOwnProfile, saveMySignature, getMySignature } from '@/lib/live-store';
import { globalSearch, type GlobalSearchResult } from '@/lib/global-search';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';

const adminLinks=[['/admin','Dashboard'],['/students','Students'],['/classes','Classes & Teachers'],['/staff','Staff'],['/admissions/manage','Admissions'],['/attendance','Attendance'],['/evaluations','Quran Evaluations'],['/fees','Finance & Fees'],['/program-setup','Program & Terms'],['/calendar','School Calendar'],['/reports','Report Cards'],['/alumni','Alumni'],['/cms','Website CMS'],['/admin/users','User Management']];
const teacherLinks=[['/teacher','My Dashboard']];
const parentLinks=[['/parent','My Children'],['/reports','Reports']];
const financeLinks=[['/fees','Finance & Fees']];
const admissionsLinks=[['/admissions/manage','Admissions'],['/students','Students']];
const securityLinks=[['/attendance','Attendance']];
const roleLinks=(role:string)=>role==='teacher'?teacherLinks:role==='parent'?parentLinks:role==='finance'?financeLinks:role==='admissions'?admissionsLinks:role==='security'?securityLinks:adminLinks;
const adminRoles=['super_admin','admin','principal'];

export default function Topbar({title}:{title:string}){
 const [open,setOpen]=useState(false),[profile,setProfile]=useState(false),[me,setMe]=useState<any>(null),[query,setQuery]=useState(''),[results,setResults]=useState<GlobalSearchResult[]>([]),[searching,setSearching]=useState(false);
 const [editProfile,setEditProfile]=useState(false),[phone,setPhone]=useState(''),[profileBusy,setProfileBusy]=useState(false),[profileMsg,setProfileMsg]=useState('');
 const [mySig,setMySig]=useState<any|null>(null),[sigBusy,setSigBusy]=useState(false);
 const sigPadRef=useRef<SignaturePadRef|null>(null);
 const links=roleLinks(me?.role||''); const isAdmin=adminRoles.includes(me?.role);
 const searchBox=useRef<HTMLDivElement>(null); const mobileSearchBox=useRef<HTMLDivElement>(null); const searchInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{getCurrentProfile().then(p=>{setMe(p);setPhone(p?.phone||'');})},[]);
 useEffect(()=>{if(!open)return; const previous=document.body.style.overflow; document.body.style.overflow='hidden'; return()=>{document.body.style.overflow=previous}},[open]);
 useEffect(()=>{if(!open)return; const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)}; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey)},[open]);
 useEffect(()=>{let active=true;const timer=setTimeout(async()=>{if(query.trim().length<2){setResults([]);return}setSearching(true);const data=await globalSearch(query);if(active)setResults(data);setSearching(false)},180);return()=>{active=false;clearTimeout(timer)}},[query]);
 useEffect(()=>{const close=(e:MouseEvent)=>{if((searchBox.current&&!searchBox.current.contains(e.target as Node))&&(mobileSearchBox.current&&!mobileSearchBox.current.contains(e.target as Node)))setResults([])};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(!isAdmin)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchInput.current?.focus()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[isAdmin]);
 async function signOut(){await createClient().auth.signOut();window.location.href='/auth/login'}

 function showSigForRole(role:string|undefined){
   // Teachers manage their signature in their own dashboard profile modal
   return role && role !== 'teacher' && role !== 'parent' && role !== 'security';
 }

 async function openEditProfile(){
   setProfile(false); setEditProfile(true); setProfileMsg('');
   if(showSigForRole(me?.role)){
     const s=await getMySignature();
     setMySig(s.signature_data ? s : null);
   }
 }
 return <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4 md:px-7">
   <button type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-navigation" className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-black text-emerald-950 shadow-sm md:hidden" onPointerDown={()=>setOpen(true)} onClick={()=>setOpen(true)}>☰</button>
   <div className="min-w-0 shrink-0"><div className="hidden text-[10px] font-black uppercase tracking-[.16em] text-teal-700 lg:block">AMQM · Aliyu and Maimuna Center for Qur'anic Memorization</div><h1 className="truncate text-lg font-black text-slate-900 md:text-xl">{title}</h1></div>
   {isAdmin&&<div ref={searchBox} className="relative ml-auto hidden max-w-xl flex-1 md:block"><div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 shadow-sm focus-within:border-emerald-500 focus-within:bg-white"><span className="mr-2 text-slate-400">⌕</span><input ref={searchInput} aria-label="Global search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search students, staff, classes, admissions, media…" className="h-11 w-full bg-transparent text-sm outline-none"/><kbd className="hidden rounded-md border bg-white px-2 py-1 text-[10px] text-slate-400 lg:block">⌘K</kbd></div>{query.trim().length>=2&&<div className="absolute left-0 right-0 top-14 z-[80] max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">{searching&&<div className="p-4 text-sm text-slate-500">Searching…</div>}{!searching&&!results.length&&<div className="p-4 text-sm text-slate-500">No matches for “{query}”.</div>}{!searching&&results.map((r,i)=><Link key={`${r.type}-${i}`} href={r.href} onClick={()=>{setQuery('');setResults([])}} className="flex items-center gap-3 rounded-xl p-3 hover:bg-emerald-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-800">{r.type.slice(0,1)}</span><span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{r.title}</span><span className="block truncate text-xs text-slate-500">{r.type}{r.subtitle?` · ${r.subtitle}`:''}</span></span><span className="ml-auto text-slate-400">→</span></Link>)}</div>}</div>}
   <div className="ml-auto flex items-center gap-2 md:ml-0"><Link className="hidden rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-50 md:block" href="/">View website</Link><button onClick={()=>setProfile(!profile)} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold"><span className="hidden max-w-40 truncate sm:inline">{me?.full_name??'Account'}</span><span className="sm:hidden">{me?.full_name?.charAt(0)??'A'}</span><span>⌄</span></button></div>
 </div>{isAdmin&&<div className="px-3 pb-3 md:hidden"><div ref={mobileSearchBox} className="relative"><div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 shadow-sm focus-within:border-emerald-500 focus-within:bg-white"><span className="mr-2 text-slate-400">⌕</span><input aria-label="Global search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search students, staff, classes…" className="h-11 w-full bg-transparent text-sm outline-none"/></div>{query.trim().length>=2&&<div className="absolute left-0 right-0 top-13 z-[80] max-h-[55vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">{searching&&<div className="p-4 text-sm text-slate-500">Searching…</div>}{!searching&&!results.length&&<div className="p-4 text-sm text-slate-500">No matches for “{query}”.</div>}{!searching&&results.map((r,i)=><Link key={`m-${r.type}-${i}`} href={r.href} onClick={()=>{setQuery('');setResults([])}} className="flex items-center gap-3 rounded-xl p-3 hover:bg-emerald-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-800">{r.type.slice(0,1)}</span><span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{r.title}</span><span className="block truncate text-xs text-slate-500">{r.type}{r.subtitle?` · ${r.subtitle}`:''}</span></span><span className="ml-auto text-slate-400">→</span></Link>)}</div>}</div></div>}
 {open&&<div id="mobile-navigation" className="fixed inset-0 z-[200] md:hidden" role="dialog" aria-modal="true" aria-label="AMQM navigation"><button type="button" aria-label="Close navigation overlay" className="absolute inset-0 touch-manipulation bg-slate-950/60 backdrop-blur-[2px]" onPointerDown={()=>setOpen(false)} onClick={()=>setOpen(false)}/><aside className="absolute inset-y-0 left-0 flex w-[min(86vw,360px)] max-w-[360px] flex-col overflow-hidden bg-[#062d2a] text-white shadow-[12px_0_40px_rgba(0,0,0,.28)]" onClick={e=>e.stopPropagation()}><div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-[max(20px,env(safe-area-inset-top))]"><div className="flex items-center justify-between"><div><div className="text-2xl font-black tracking-tight">AMQM</div><div className="mt-1 text-xs font-semibold capitalize text-emerald-200/70">{me?.role||'Account'} workspace</div></div><button type="button" aria-label="Close navigation" onPointerDown={()=>setOpen(false)} onClick={()=>setOpen(false)} className="h-11 w-11 touch-manipulation rounded-xl bg-white/10 text-2xl leading-none hover:bg-white/15">×</button></div></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"><nav className="space-y-1.5" aria-label="Mobile navigation">{links.map(([href,label])=>{const active=path===href||path.startsWith(href+'/'); return <Link onClick={()=>setOpen(false)} aria-current={active?'page':undefined} className={`flex min-h-12 touch-manipulation items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition ${active?'bg-white text-emerald-950 shadow-sm':'text-emerald-50 hover:bg-white/10'}`} href={href} key={href}><span>{label}</span><span className={active?'text-emerald-700':'text-emerald-300'}>→</span></Link>})}</nav></div><div className="shrink-0 border-t border-white/10 bg-black/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))]"><Link onClick={()=>setOpen(false)} href="/" className="block min-h-12 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-emerald-950">View website</Link><button type="button" onClick={signOut} className="mt-2 block min-h-12 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white">Sign out</button></div></aside></div>}
 {profile&&<div className="absolute right-3 top-16 z-[90] w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:right-4 md:right-7"><div className="px-3 py-3"><div className="text-sm font-black">{me?.full_name??'Account'}</div><div className="text-xs capitalize text-slate-500">{me?.role??'—'}</div>{me?.staff_id&&<div className="mt-1 text-[11px] font-bold text-emerald-700">{me.staff_id}</div>}</div><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={openEditProfile}>Edit profile</button><Link href="/" className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50">View public website</Link><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50" onClick={signOut}>Sign out</button></div>}
 {editProfile&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"><div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
   <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">Edit Profile</h2><button className="btn bg-slate-100" onClick={()=>setEditProfile(false)}>Close</button></div>
   {profileMsg&&<div className="mb-4 rounded-xl bg-teal-50 p-3 text-sm font-semibold text-teal-800">{profileMsg}</div>}
   <div className="text-sm font-black text-slate-700 mb-1">{me?.full_name??'Account'}</div>
   <div className="text-xs capitalize text-slate-400 mb-4">{me?.role??'—'}{me?.staff_id?` · ${me.staff_id}`:''}</div>
   <label className="block text-sm font-semibold">Phone number<input className="input mt-1 w-full" placeholder="+234 xxx xxx xxxx" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
   <button disabled={profileBusy} onClick={async()=>{setProfileBusy(true);try{await updateOwnProfile({phone:phone||null});setProfileMsg('Profile saved.');}catch(e:any){setProfileMsg(e?.message||'Failed.');}finally{setProfileBusy(false);}}} className="btn btn-primary mt-3 w-full">{profileBusy?'Saving…':'Save Profile'}</button>
   {showSigForRole(me?.role)&&<div className="mt-6 border-t pt-5">
     <div className="text-sm font-black text-slate-700">Add Signature</div>
     <p className="mt-1 text-xs text-slate-400">Appears on official documents and report cards.</p>
     {mySig&&<div className="mt-3"><div className="text-xs font-bold text-emerald-700 mb-1">✓ Signature on file</div><img src={(mySig as any).signature_data} alt="signature" className="h-14 w-full rounded-xl border border-slate-200 bg-white object-contain p-1"/><p className="mt-2 text-xs text-slate-400">Draw below to replace:</p></div>}
     {!mySig&&<p className="mt-3 text-xs text-slate-400">No signature yet. Draw below to add one:</p>}
     <div className="mt-2"><SignaturePad ref={el=>{sigPadRef.current=el;}} height={110}/></div>
     <button className="btn btn-primary mt-3 w-full" disabled={sigBusy} onClick={async()=>{
       const pad=sigPadRef.current; if(!pad||pad.isEmpty()){setProfileMsg('Please draw your signature first.');return;}
       const data=pad.getDataURL(); if(!data) return;
       setSigBusy(true);
       try{await saveMySignature(data);const s=await getMySignature();setMySig(s.signature_data?s:null);pad.clear();setProfileMsg('Signature saved.');}
       catch(err:any){setProfileMsg(err?.message||'Failed to save signature.');}
       finally{setSigBusy(false);}
     }}>{sigBusy?'Saving…':'Save Signature'}</button>
   </div>}
 </div></div>}
 </header>
}

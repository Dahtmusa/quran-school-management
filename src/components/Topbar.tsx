'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCurrentProfile, updateOwnProfile, saveMySignature, getMySignature, uploadProfileImage } from '@/lib/live-store';
import { roleLinks } from '@/lib/nav-links';
import { globalSearch, type GlobalSearchResult } from '@/lib/global-search';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';

const adminRoles=['super_admin','admin','principal'];

export default function Topbar({title}:{title:string}){
 const [open,setOpen]=useState(false),[profile,setProfile]=useState(false),[me,setMe]=useState<any>(null),[query,setQuery]=useState(''),[results,setResults]=useState<GlobalSearchResult[]>([]),[searching,setSearching]=useState(false);
 const [editProfile,setEditProfile]=useState(false),[phone,setPhone]=useState(''),[profileBusy,setProfileBusy]=useState(false),[profileMsg,setProfileMsg]=useState('');
 const [mySig,setMySig]=useState<any|null>(null),[sigBusy,setSigBusy]=useState(false);
 const [photoBusy,setPhotoBusy]=useState(false);
 type Notif={id:string;kind:string;title:string;body:string|null;link:string|null;read_at:string|null;created_at:string};
 const [notifOpen,setNotifOpen]=useState(false);
 const [notifs,setNotifs]=useState<Notif[]>([]);
 const [unread,setUnread]=useState(0);
 const loadNotifs=async()=>{
   try{
     const r=await fetch('/api/notifications/mine?limit=15',{cache:'no-store'});
     if(!r.ok)return;
     const b=await r.json();
     setNotifs(b.items||[]);
     setUnread(Number(b.unread||0));
   }catch{}
 };
 useEffect(()=>{if(!me)return;loadNotifs();const id=setInterval(loadNotifs,60_000);return()=>clearInterval(id);},[me?.id]);
 async function markRead(ids:string[]){
   try{await fetch('/api/notifications/mark-read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});}catch{}
   await loadNotifs();
 }
 // Threaded view when a notification is tapped: shows the whole
 // conversation and lets the recipient reply. The reply itself is a
 // notification addressed to the other party.
 type ThreadItem=Notif&{created_by:string|null;parent_id:string|null;sender_name:string|null;recipient_id:string};
 const [threadOpen,setThreadOpen]=useState<Notif|null>(null);
 const [threadItems,setThreadItems]=useState<ThreadItem[]>([]);
 const [threadBusy,setThreadBusy]=useState(false);
 const [replyText,setReplyText]=useState('');
 async function openThread(n:Notif){
   setNotifOpen(false);
   setThreadOpen(n);setThreadItems([]);setReplyText('');
   if(!n.read_at)await markRead([n.id]);
   try{
     const r=await fetch('/api/notifications/thread?id='+encodeURIComponent(n.id),{cache:'no-store'});
     const b=await r.json();
     if(r.ok)setThreadItems(b.items||[]);
   }catch{}
 }
 async function sendReply(){
   if(!threadOpen||!replyText.trim())return;
   setThreadBusy(true);
   try{
     const parent=threadItems[threadItems.length-1]||threadOpen;
     const r=await fetch('/api/notifications/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parentId:parent.id,body:replyText.trim()})});
     const b=await r.json();
     if(!r.ok)throw new Error(b?.error||'Reply failed.');
     setReplyText('');
     // Re-fetch so the UI reflects the new reply immediately.
     const r2=await fetch('/api/notifications/thread?id='+encodeURIComponent(threadOpen.id),{cache:'no-store'});
     if(r2.ok){const b2=await r2.json();setThreadItems(b2.items||[]);}
     await loadNotifs();
   }catch(e:any){alert(e?.message||'Could not send reply.');}
   finally{setThreadBusy(false);}
 }
 async function uploadTopbarPhoto(file:File|null){
   if(!file)return;
   setPhotoBusy(true);setProfileMsg('');
   try{
     const url=await uploadProfileImage(file,'staff');
     await updateOwnProfile({avatar_url:url});
     setMe((x:any)=>({...(x||{}),avatar_url:url}));
     setProfileMsg('Profile photo updated.');
   }catch(e:any){
     setProfileMsg(e?.message||'Photo upload failed. Try a different image (JPG/PNG, under 5MB).');
   }finally{setPhotoBusy(false);}
 }
 const sigPadRef=useRef<SignaturePadRef|null>(null);
 const links=roleLinks(me?.role||''); const isAdmin=adminRoles.includes(me?.role);
 const searchBox=useRef<HTMLDivElement>(null); const mobileSearchBox=useRef<HTMLDivElement>(null); const searchInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{getCurrentProfile().then(p=>{setMe(p);setPhone(p?.phone||'');})},[]);
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
  useEffect(()=>{if(!open&&!editProfile)return;const prev=document.body.style.overflow;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);setEditProfile(false)}};document.body.style.overflow='hidden';document.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=prev;document.removeEventListener('keydown',onKey)}},[open,editProfile]);
 return <>
 <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4 md:px-7">
   <button aria-label="Open navigation" aria-expanded={open} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-black text-emerald-950 md:hidden" onClick={()=>{setProfile(false);setQuery('');setResults([]);setOpen(true)}}>☰</button>
   <div className="min-w-0 flex-1"><div className="hidden text-[10px] font-black uppercase tracking-[.16em] text-teal-700 lg:block">AMQM · Aliyu and Maimuna Center for Qur'anic Memorization</div><h1 className="truncate text-lg font-black text-slate-900 md:text-xl">{title}</h1></div>
   {isAdmin&&<div ref={searchBox} className="relative ml-auto hidden max-w-xl flex-1 md:block"><div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 shadow-sm focus-within:border-emerald-500 focus-within:bg-white"><span className="mr-2 text-slate-400">⌕</span><input ref={searchInput} aria-label="Global search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search students, staff, classes, admissions, media…" className="h-11 w-full bg-transparent text-sm outline-none"/><kbd className="hidden rounded-md border bg-white px-2 py-1 text-[10px] text-slate-400 lg:block">⌘K</kbd></div>{query.trim().length>=2&&<div className="absolute left-0 right-0 top-14 z-[80] max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">{searching&&<div className="p-4 text-sm text-slate-500">Searching…</div>}{!searching&&!results.length&&<div className="p-4 text-sm text-slate-500">No matches for “{query}”.</div>}{!searching&&results.map((r,i)=><Link key={`${r.type}-${i}`} href={r.href} onClick={()=>{setQuery('');setResults([])}} className="flex items-center gap-3 rounded-xl p-3 hover:bg-emerald-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-800">{r.type.slice(0,1)}</span><span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{r.title}</span><span className="block truncate text-xs text-slate-500">{r.type}{r.subtitle?` · ${r.subtitle}`:''}</span></span><span className="ml-auto text-slate-400">→</span></Link>)}</div>}</div>}
   <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0"><Link className="hidden rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-50 md:block" href="/">View website</Link>
     <button onClick={()=>{setProfile(false);setNotifOpen(v=>!v);}} aria-label="Notifications" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-black">
       🔔
       {unread>0&&<span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">{unread>99?'99+':unread}</span>}
     </button>
     <button onClick={()=>{setOpen(false);setQuery('');setResults([]);setNotifOpen(false);setProfile(!profile)}} aria-label="Account menu" className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold"><span className="hidden max-w-40 truncate sm:inline">{me?.full_name??'Account'}</span><span className="sm:hidden">{me?.full_name?.charAt(0)??'A'}</span><span>⌄</span></button>
   </div>
 </div>{isAdmin&&<div className="px-3 pb-3 md:hidden"><div ref={mobileSearchBox} className="relative"><div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 shadow-sm focus-within:border-emerald-500 focus-within:bg-white"><span className="mr-2 text-slate-400">⌕</span><input aria-label="Global search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search students, staff, classes…" className="h-11 w-full bg-transparent text-sm outline-none"/></div>{query.trim().length>=2&&<div className="absolute left-0 right-0 top-13 z-[80] max-h-[55vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">{searching&&<div className="p-4 text-sm text-slate-500">Searching…</div>}{!searching&&!results.length&&<div className="p-4 text-sm text-slate-500">No matches for “{query}”.</div>}{!searching&&results.map((r,i)=><Link key={`m-${r.type}-${i}`} href={r.href} onClick={()=>{setQuery('');setResults([])}} className="flex items-center gap-3 rounded-xl p-3 hover:bg-emerald-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-800">{r.type.slice(0,1)}</span><span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{r.title}</span><span className="block truncate text-xs text-slate-500">{r.type}{r.subtitle?` · ${r.subtitle}`:''}</span></span><span className="ml-auto text-slate-400">→</span></Link>)}</div>}</div></div>}
 {notifOpen&&<div className="absolute right-16 top-16 z-[90] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-20 md:right-24">
   <div className="flex items-center justify-between border-b bg-slate-50 p-3">
     <div className="text-xs font-black uppercase tracking-wide text-slate-600">Notifications{unread>0&&` · ${unread} unread`}</div>
     {unread>0&&<button className="text-[11px] font-bold text-emerald-700 hover:underline" onClick={()=>markRead([])}>Mark all read</button>}
   </div>
   <div className="max-h-[70vh] overflow-y-auto">
     {notifs.length===0?<div className="p-6 text-center text-sm text-slate-400">No notifications yet.</div>:
      notifs.map(n=>{
        const inner=<div className={'flex items-start gap-3 border-b p-3 '+(n.read_at?'bg-white':'bg-emerald-50/60')}>
          <div className={'mt-1 h-2 w-2 flex-none rounded-full '+(n.read_at?'bg-slate-200':'bg-emerald-500')}></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-slate-900">{n.title}</div>
            {n.body&&<div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</div>}
            <div className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString('en-NG',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})}</div>
          </div>
        </div>;
        return <button key={n.id} onClick={()=>openThread(n)} className="block w-full text-left hover:bg-slate-50">{inner}</button>;
      })}
   </div>
 </div>}
 {profile&&<div className="absolute right-3 top-16 z-[90] w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:right-4 md:right-7"><div className="px-3 py-3"><div className="text-sm font-black">{me?.full_name??'Account'}</div><div className="text-xs capitalize text-slate-500">{me?.role??'—'}</div>{me?.staff_id&&<div className="mt-1 text-[11px] font-bold text-emerald-700">{me.staff_id}</div>}</div><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={openEditProfile}>Edit profile</button><Link href="/" className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50">View public website</Link><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50" onClick={signOut}>Sign out</button></div>}
 </header>
 {open&&<div className="fixed inset-0 z-[100] md:hidden"><button aria-label="Close navigation overlay" className="absolute inset-0 bg-slate-950/55" onClick={()=>setOpen(false)}/><aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col bg-[#062d2a] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-white shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 pb-5"><div><div className="text-2xl font-black">AMQM</div><div className="mt-1 text-xs capitalize text-emerald-200/70">{me?.role||'Account'} workspace</div></div><button aria-label="Close navigation" onClick={()=>setOpen(false)} className="h-10 w-10 rounded-xl bg-white/10 text-xl">×</button></div><div className="mt-6 flex-1 overflow-y-auto overscroll-contain"><nav className="space-y-1.5">{links.map(([href,label])=><Link onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-bold text-emerald-50 hover:bg-white/10" href={href} key={href}>{label}<span className="text-emerald-300">→</span></Link>)}</nav></div><Link onClick={()=>setOpen(false)} href="/" className="mt-5 block rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-emerald-950">View website</Link><button onClick={signOut} className="mt-2 block w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white">Sign out</button></aside></div>}
 {editProfile&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"><div className="max-h-[90vh] w-full max-w-md overflow-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-3xl">
   <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">Edit Profile</h2><button className="btn bg-slate-100" onClick={()=>setEditProfile(false)}>Close</button></div>
   {profileMsg&&<div className={'mb-4 rounded-xl p-3 text-sm font-semibold '+(profileMsg.toLowerCase().includes('fail')||profileMsg.toLowerCase().includes('unable')||profileMsg.toLowerCase().includes('error')?'bg-rose-50 text-rose-800':'bg-teal-50 text-teal-800')}>{profileMsg}</div>}
   <div className="mb-4 flex items-center gap-4">
     <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border bg-slate-100">
       {me?.avatar_url
         ? <img src={me.avatar_url} alt="Profile photo" className="h-full w-full object-cover"/>
         : <div className="grid h-full w-full place-items-center text-2xl font-black text-slate-300">{me?.full_name?.charAt(0)||'?'}</div>}
     </div>
     <div>
       <div className="text-sm font-black text-slate-700">{me?.full_name??'Account'}</div>
       <div className="text-xs capitalize text-slate-400 mb-2">{me?.role??'—'}{me?.staff_id?` · ${me.staff_id}`:''}</div>
       <label className={'btn cursor-pointer '+(photoBusy?'bg-slate-200 text-slate-500':'bg-slate-100 hover:bg-slate-200 text-slate-800')}>
         {photoBusy?'Uploading…':'Change photo'}
         <input hidden type="file" accept="image/*" disabled={photoBusy} onChange={e=>{uploadTopbarPhoto(e.target.files?.[0]||null);e.currentTarget.value='';}}/>
       </label>
     </div>
   </div>
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

 {threadOpen&&<div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5" onClick={()=>setThreadOpen(null)}>
   <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl" onClick={e=>e.stopPropagation()}>
     <div className="flex items-start justify-between gap-3 border-b bg-slate-50 p-4">
       <div className="min-w-0">
         <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Notification thread</div>
         <h2 className="mt-1 truncate text-lg font-black">{threadOpen.title}</h2>
       </div>
       <button className="btn bg-slate-100" onClick={()=>setThreadOpen(null)}>Close</button>
     </div>
     <div className="flex-1 space-y-3 overflow-y-auto p-4">
       {threadItems.length===0?<div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">Loading conversation…</div>:
        threadItems.map(t=>{
          const mine=t.recipient_id!==me?.id; // if I'm not the recipient, I sent it
          return <div key={t.id} className={'rounded-2xl p-3 '+(mine?'ml-6 bg-emerald-50 border border-emerald-100':'mr-6 bg-slate-50 border border-slate-100')}>
            <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
              <span className={mine?'text-emerald-800':'text-slate-700'}>{mine?'You':(t.sender_name||'Admin')}</span>
              <span className="text-slate-400">{new Date(t.created_at).toLocaleString('en-NG',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})}</span>
            </div>
            <div className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{t.body||<i className="text-slate-400">(no body)</i>}</div>
            {t.link&&!t.parent_id&&<Link href={t.link} onClick={()=>setThreadOpen(null)} className="mt-2 inline-block rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-black text-white">Open link →</Link>}
          </div>;
        })}
     </div>
     <div className="border-t bg-white p-4">
       <textarea rows={3} className="input w-full" placeholder="Reply to this message…" value={replyText} onChange={e=>setReplyText(e.target.value)} />
       <div className="mt-2 flex justify-end gap-2">
         <button className="btn bg-slate-100 text-slate-700" onClick={()=>setThreadOpen(null)}>Close</button>
         <button disabled={threadBusy||!replyText.trim()} onClick={sendReply} className="btn btn-primary">{threadBusy?'Sending…':'Send reply'}</button>
       </div>
     </div>
   </div>
 </div>}
 </>
}

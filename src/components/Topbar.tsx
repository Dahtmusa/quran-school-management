'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {getCurrentProfile} from '@/lib/live-store';

const adminLinks=[['/admin','Dashboard'],['/students','Students'],['/classes','Classes & Teachers'],['/admissions/manage','Admissions'],['/attendance','Attendance'],['/evaluations','Quran Evaluations'],['/fees','Finance & Fees'],['/programs','Program & Terms'],['/calendar','School Calendar'],['/reports','Report Cards'],['/alumni','Alumni'],['/cms','Website CMS']];
const teacherLinks=[['/teacher','My Dashboard']];
const parentLinks=[['/parent','My Children'],['/reports','Reports']];
const financeLinks=[['/fees','Finance & Fees']];
const admissionsLinks=[['/admissions/manage','Admissions'],['/students','Students']];
const securityLinks=[['/attendance','Attendance']];
const roleLinks=(role:string)=>role==='teacher'?teacherLinks:role==='parent'?parentLinks:role==='finance'?financeLinks:role==='admissions'?admissionsLinks:role==='security'?securityLinks:adminLinks;
export default function Topbar({title}:{title:string}){
 const [open,setOpen]=useState(false);const [profile,setProfile]=useState(false);const [me,setMe]=useState<any>(null);
 useEffect(()=>{getCurrentProfile().then(setMe)},[]); const links=roleLinks(me?.role||'');
 return <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="flex min-h-16 items-center justify-between gap-3 px-3 py-2 sm:px-4 md:px-7"><div className="flex min-w-0 items-center gap-3"><button aria-label="Open navigation" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg md:hidden" onClick={()=>setOpen(true)}>☰</button><div className="min-w-0"><div className="hidden text-[10px] font-semibold uppercase tracking-wider text-teal-700 sm:block">AMQM · Aliyu and Maimuna Center for Qur'anic Memorization</div><h1 className="truncate text-lg font-black text-slate-900 md:text-xl">{title}</h1></div></div><div className="flex items-center gap-2"><Link className="hidden rounded-xl border px-3 py-2 text-sm font-semibold md:block" href="/">View website</Link><button onClick={()=>setProfile(!profile)} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold"><span className="hidden sm:inline">{me?.full_name??'Account'}</span><span className="sm:hidden">{me?.full_name?.charAt(0)??'A'}</span><span>▾</span></button></div></div>
 {open&&<><div className="fixed inset-0 z-50 bg-slate-950/40 md:hidden" onClick={()=>setOpen(false)}/><aside className="fixed inset-y-0 left-0 z-[60] w-[86vw] max-w-sm overflow-y-auto bg-[#062d2a] p-5 text-white shadow-2xl md:hidden"><div className="flex items-center justify-between"><div><div className="text-2xl font-black">AMQM</div><div className="text-xs text-emerald-200/70">{me?.role||'Account'} workspace</div></div><button onClick={()=>setOpen(false)} className="h-10 w-10 rounded-xl bg-white/10">×</button></div><nav className="mt-8 space-y-2">{links.map(([href,label])=><Link onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3.5 text-sm font-bold hover:bg-white/10" href={href} key={href}>{label}<span>→</span></Link>)}</nav><Link onClick={()=>setOpen(false)} href="/" className="mt-6 block rounded-2xl bg-amber-400 px-4 py-3 text-center text-sm font-black text-slate-950">View website</Link></aside></>}
 {profile&&<div className="absolute right-3 top-16 z-50 w-56 rounded-2xl border bg-white p-2 shadow-xl sm:right-4 md:right-7"><div className="px-3 py-3"><div className="text-sm font-black">{me?.full_name??'Account'}</div><div className="text-xs capitalize text-slate-500">{me?.role??'—'}</div>{me?.staff_id&&<div className="mt-1 text-[11px] text-slate-400">{me.staff_id}</div>}</div><Link href="/" className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50">View website</Link><button className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={async()=>{await createClient().auth.signOut();window.location.href='/auth/login'}}>Sign out</button></div>}
 </header>
}

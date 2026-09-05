'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentProfile, loadCurrentAcademicTerm } from '@/lib/live-store';
import { createClient } from '@/lib/supabase/client';
const adminLinks=[['/admin','Dashboard','⌂'],['/students','Students','◉'],['/classes','Classes & Teachers','▦'],['/staff','Staff','♧'],['/admissions/manage','Admissions','▣'],['/attendance','Attendance','✓'],['/evaluations','Quran Evaluations','☾'],['/fees','Finance & Fees','₦'],['/calendar','School Calendar','◷'],['/reports','Report Cards','▤'],['/alumni','Alumni','★'],['/cms','Website CMS','✦']];
const teacherLinks=[['/teacher','My Dashboard','⌂']]; const parentLinks=[['/parent','My Children','⌂'],['/reports','Reports','▤']]; const financeLinks=[['/fees','Finance & Fees','₦']]; const admissionsLinks=[['/admissions/manage','Admissions','▣'],['/students','Students','◉']]; const securityLinks=[['/attendance','Attendance','✓']];
export default function Sidebar(){
  const path=usePathname();
  const [role,setRole]=useState('');
  const [returnedCount,setReturnedCount]=useState(0);
  const [currentTerm,setCurrentTerm]=useState<any>(null);
  useEffect(()=>{
    getCurrentProfile().then((p:any)=>{
      const r=p?.role||'';setRole(r);
      if(r==='teacher'){createClient().from('evaluations').select('id',{count:'exact',head:true}).eq('status','returned').then(({count})=>setReturnedCount(count||0))}
    });
    loadCurrentAcademicTerm().then(setCurrentTerm).catch(()=>{});
  },[]);
  const links=role==='teacher'?teacherLinks:role==='parent'?parentLinks:role==='finance'?financeLinks:role==='admissions'?admissionsLinks:role==='security'?securityLinks:adminLinks;
  const isAdmin=role!=='teacher'&&role!=='parent'&&role!=='';
  const termLabel=currentTerm?.term?.name||currentTerm?.term_name||null;
  const yearLabel=currentTerm?.academic_year?.name||currentTerm?.academic_year_name||null;
  return <aside className="hidden min-h-screen w-64 shrink-0 bg-[#062d2a] p-4 text-white md:block">
    <div className="mb-7 px-2"><div className="text-xl font-black tracking-tight">AMQM</div><div className="text-xs text-emerald-200/70">{role==='teacher'?'Teacher Workspace':role==='parent'?'Parent Portal':'School Management'}</div></div>
    <nav className="space-y-1">{links.map(([href,label,icon])=><Link className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${path===href||path.startsWith(href+'/')?'bg-white/15 text-white shadow-sm':'text-emerald-50/70 hover:bg-white/10 hover:text-white'}`} href={href} key={href}>
      <span className="w-5 shrink-0 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {role==='teacher'&&href==='/teacher'&&returnedCount>0&&<span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{returnedCount}</span>}
    </Link>)}</nav>
    {isAdmin&&<div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5 text-emerald-50/70">
      <div className="flex items-center justify-between"><b className="text-white">Active term</b><Link href="/calendar" className="text-emerald-300 hover:text-white font-bold">Change →</Link></div>
      {yearLabel&&termLabel?<div className="mt-1.5 font-semibold text-emerald-100">{yearLabel} · {termLabel}</div>:<div className="mt-1.5 italic text-white/40">Not set — <Link href="/calendar" className="underline text-emerald-300">set now</Link></div>}
    </div>}
  </aside>;
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadCMSSettings, loadPublicNewsPosts } from '@/lib/cms-live-store';

export default function NewsPage(){
  const [posts,setPosts]=useState<any[]>([]); const [settings,setSettings]=useState<any>({});
  useEffect(()=>{Promise.all([loadPublicNewsPosts(),loadCMSSettings()]).then(([p,s])=>{setPosts(p);setSettings(s)});},[]);
  const name=settings.short_name?.value||'AMQM';
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><Link href="/" className="font-black text-emerald-950">{name}</Link><Link href="/" className="text-sm font-bold text-emerald-800">← Home</Link></div></header>
    <section className="mx-auto max-w-6xl px-5 py-12"><div className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">School news & events</div><h1 className="mt-2 text-4xl font-black text-slate-950">Latest from {name}</h1><p className="mt-3 max-w-2xl text-slate-500">Official announcements, school activities and important updates.</p>
    <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{posts.map(p=><article key={p.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">{p.image_url&&<img src={p.image_url} alt="" className="h-48 w-full object-cover"/>}<div className="p-6"><div className="text-[11px] font-black uppercase tracking-wider text-emerald-700">{p.category} · {p.published_on}</div><h2 className="mt-2 text-xl font-black">{p.title}</h2>{p.excerpt&&<p className="mt-3 text-sm leading-6 text-slate-600">{p.excerpt}</p>}</div></article>)}</div>{!posts.length&&<div className="mt-10 rounded-3xl border bg-white p-8 text-sm text-slate-500">No published news yet.</div>}</section></main>
}

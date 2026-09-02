'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export default function Topbar({title}:{title:string}){const router=useRouter();async function signOut(){await createClient().auth.signOut();router.replace('/login');router.refresh();}return <header className="flex items-center justify-between border-b bg-white px-4 py-4 md:px-7"><div><h1 className="text-xl font-black text-slate-900">{title}</h1><p className="text-xs text-slate-500">Al Huda Quran Memorization School</p></div><button onClick={signOut} className="btn bg-slate-100 text-slate-700">Sign out</button></header>}

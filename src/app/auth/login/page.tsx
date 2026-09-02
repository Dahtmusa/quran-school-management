'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {createClient} from '@/lib/supabase/client';

function dashboardFor(role?:string){
 if(role==='teacher') return '/teacher';
 if(role==='parent') return '/parent';
 if(role==='security') return '/attendance';
 if(role==='finance') return '/fees';
 if(role==='admissions') return '/admissions/manage';
 return '/admin';
}
export default function Login(){const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');const supabase=createClient();const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){setError(error.message);setBusy(false);return}const {data:profile}=await supabase.from('profiles').select('role').eq('id',data.user.id).maybeSingle();window.location.href=dashboardFor(profile?.role);};
 return <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-5"><form onSubmit={submit} className="card w-full max-w-md p-7"><div className="text-xs font-bold uppercase tracking-[.25em] text-emerald-700">Aliyu and Maimuna Center for Qur'anic Memorization</div><h1 className="mt-2 text-3xl font-black">Portal sign in</h1><p className="mt-2 text-sm text-slate-500">One secure login for Admin, Teachers, Parents, Finance, Admissions and Security. Each account is sent to its own dashboard.</p><label className="mt-6 block text-sm font-semibold">Email<input className="input mt-1" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label className="mt-4 block text-sm font-semibold">Password<input className="input mt-1" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}<button disabled={busy} className="btn btn-primary mt-5 w-full disabled:opacity-50">{busy?'Signing in…':'Sign in'}</button><Link className="mt-4 block text-center text-sm font-semibold text-emerald-700" href="/">← Back to website</Link></form></main>}

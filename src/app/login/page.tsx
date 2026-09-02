'use client';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function Login(){
 const router=useRouter(); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');const {error}=await createClient().auth.signInWithPassword({email,password});if(error){setError(error.message);setBusy(false);return;}router.replace('/admin');router.refresh();}
 return <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-5"><form onSubmit={submit} className="card w-full max-w-md p-7"><div className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Al Huda School</div><h1 className="mt-2 text-3xl font-black">Secure portal login</h1><p className="mt-2 text-sm text-slate-500">Use the school account created in Supabase Authentication.</p><label className="mt-6 block text-sm font-bold">Email<input className="input mt-2 w-full" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label className="mt-4 block text-sm font-bold">Password<input className="input mt-2 w-full" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>{error&&<div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}<button disabled={busy} className="btn btn-primary mt-6 w-full disabled:opacity-50">{busy?'Signing in…':'Sign in'}</button></form></main>
}

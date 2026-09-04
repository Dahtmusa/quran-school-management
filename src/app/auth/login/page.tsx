'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {createClient} from '@/lib/supabase/client';

type Tab='staff'|'teacher'|'parent';

function dashboardFor(role?:string){
 if(role==='teacher') return '/teacher';
 if(role==='parent') return '/parent';
 if(role==='security') return '/attendance';
 if(role==='finance') return '/fees';
 if(role==='admissions') return '/admissions/manage';
 return '/admin';
}

function EyeIcon({open}:{open:boolean}){
 return open
  ?<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  :<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}

function PasswordInput({value,onChange,placeholder,autoComplete}:{value:string;onChange:(v:string)=>void;placeholder?:string;autoComplete?:string}){
 const [show,setShow]=useState(false);
 return(
  <div className="relative mt-1">
   <input
    className="input w-full pr-10"
    type={show?'text':'password'}
    autoComplete={autoComplete||'current-password'}
    placeholder={placeholder||''}
    value={value}
    onChange={e=>onChange(e.target.value)}
    required
   />
   <button type="button" tabIndex={-1} onClick={()=>setShow(s=>!s)}
    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700">
    <EyeIcon open={show}/>
   </button>
  </div>
 );
}

export default function Login(){
 const [tab,setTab]=useState<Tab>('staff');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 // Staff / Admin fields
 const [credential,setCredential]=useState('');
 const [password,setPassword]=useState('');

 // Teacher fields
 const [username,setUsername]=useState('');
 const [tPassword,setTPassword]=useState('');

 // Parent fields
 const [phone,setPhone]=useState('');
 const [admissionNo,setAdmissionNo]=useState('');

 async function submitStaff(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  const supabase=createClient();
  const isEmail=credential.includes('@');
  if(isEmail){
   // Standard email login
   const{data,error:err}=await supabase.auth.signInWithPassword({email:credential.trim(),password});
   if(err){setError(err.message);setBusy(false);return}
   const{data:profile}=await supabase.from('profiles').select('role').eq('id',data.user.id).maybeSingle();
   window.location.href=dashboardFor(profile?.role);
  }else{
   // Username login — goes through edge function
   const{data,error:err}=await supabase.functions.invoke('username-login',{
    body:{username:credential.trim().toLowerCase(),password},
   });
   if(err||data?.error){setError(data?.error||err?.message||'Invalid username or password');setBusy(false);return}
   const sess=data?.session;
   if(!sess){setError('No session returned');setBusy(false);return}
   await supabase.auth.setSession({access_token:sess.access_token,refresh_token:sess.refresh_token});
   const{data:profile}=await supabase.from('profiles').select('role').eq('id',sess.user.id).maybeSingle();
   window.location.href=dashboardFor(profile?.role);
  }
 }

 async function submitTeacher(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  const supabase=createClient();
  const{data,error:err}=await supabase.functions.invoke('username-login',{
   body:{username:username.trim().toLowerCase(),password:tPassword},
  });
  if(err||data?.error){setError(data?.error||err?.message||'Login failed');setBusy(false);return}
  const sess=data?.session;
  if(!sess){setError('No session returned');setBusy(false);return}
  await supabase.auth.setSession({access_token:sess.access_token,refresh_token:sess.refresh_token});
  window.location.href='/teacher';
 }

 async function submitParent(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  const supabase=createClient();
  const{data,error:err}=await supabase.functions.invoke('parent-login',{
   body:{phone:phone.trim(),admission_no:admissionNo.trim()},
  });
  if(err||data?.error){setError(data?.error||err?.message||'Login failed');setBusy(false);return}
  const sess=data?.session;
  if(!sess){setError('No session returned');setBusy(false);return}
  await supabase.auth.setSession({access_token:sess.access_token,refresh_token:sess.refresh_token});
  window.location.href='/parent';
 }

 return(
  <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-5">
   <div className="card w-full max-w-md p-7">
    <div className="text-xs font-bold uppercase tracking-[.25em] text-emerald-700">Aliyu and Maimuna Center for Qur'anic Memorization</div>
    <h1 className="mt-2 text-3xl font-black">Portal sign in</h1>

    {/* Tab switcher */}
    <div className="mt-5 flex gap-1 rounded-2xl border bg-slate-50 p-1">
     {(['staff','teacher','parent'] as Tab[]).map(t=>(
      <button key={t} onClick={()=>{setTab(t);setError('')}} className={`flex-1 rounded-xl py-2.5 text-xs font-black uppercase tracking-wide transition ${tab===t?'bg-white shadow text-slate-900':'text-slate-400 hover:text-slate-600'}`}>
       {t==='staff'?'Admin / Staff':t==='teacher'?'Teacher':'Parent'}
      </button>
     ))}
    </div>

    {/* Staff / Admin */}
    {tab==='staff'&&(
     <form onSubmit={submitStaff} className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">For admin, principal, finance, admissions and security accounts.</p>
      <label className="block text-sm font-semibold">Email or username
       <input className="input mt-1 w-full" type="text" autoComplete="username" value={credential} onChange={e=>setCredential(e.target.value)} required/>
      </label>
      <label className="block text-sm font-semibold">Password
       <PasswordInput value={password} onChange={setPassword} autoComplete="current-password"/>
      </label>
      {error&&<div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50">{busy?'Signing in...':'Sign in'}</button>
     </form>
    )}

    {/* Teacher */}
    {tab==='teacher'&&(
     <form onSubmit={submitTeacher} className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">Use the username and password set by the school administrator.</p>
      <label className="block text-sm font-semibold">Username
       <input className="input mt-1 w-full" type="text" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/>
      </label>
      <label className="block text-sm font-semibold">Password
       <PasswordInput value={tPassword} onChange={setTPassword} autoComplete="current-password"/>
      </label>
      {error&&<div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50">{busy?'Signing in...':'Sign in as teacher'}</button>
     </form>
    )}

    {/* Parent */}
    {tab==='parent'&&(
     <form onSubmit={submitParent} className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">Use your phone number registered with the school and your child's admission number.</p>
      <label className="block text-sm font-semibold">Parent phone number<input className="input mt-1 w-full" type="tel" placeholder="e.g. 08012345678" value={phone} onChange={e=>setPhone(e.target.value)} required/></label>
      <label className="block text-sm font-semibold">Child's admission number<input className="input mt-1 w-full" type="text" placeholder="e.g. AMQM-2024-001" value={admissionNo} onChange={e=>setAdmissionNo(e.target.value)} required/></label>
      {error&&<div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50">{busy?'Verifying...':'Sign in as parent'}</button>
      <p className="text-xs text-slate-400 leading-5">If you have multiple children enrolled, log in with any one admission number — all your children will appear in your dashboard.</p>
     </form>
    )}

    <Link className="mt-5 block text-center text-sm font-semibold text-emerald-700" href="/">Back to website</Link>
   </div>
  </main>
 );
}

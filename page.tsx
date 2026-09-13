'use client';

import AdminShell from '@/components/AdminShell';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';
import { getCurrentProfile, getMySignature, saveMySignature, updateMyProfile, uploadProfileImage } from '@/lib/live-store';
import { useEffect, useRef, useState } from 'react';

const field = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const label = 'text-[11px] font-black uppercase tracking-[.09em] text-slate-500';

export default function ProfilePage() {
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState<any>({ full_name:'', phone:'', avatar_url:'', employment_status:'active', job_title:'', department:'', joined_on:'', id_expires_on:'', bio:'', show_on_website:false, username:'', qualifications:'', experience:'', subjects:'', email:'', preferred_email:'' });
  const [signature, setSignature] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const sigRef = useRef<SignaturePadRef|null>(null);
  const fileRef = useRef<HTMLInputElement|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [profile, sig] = await Promise.all([getCurrentProfile(), getMySignature()]);
        if (!profile || !['super_admin','admin','principal'].includes(profile.role)) throw new Error('Administrator access required.');
        setMe(profile);
        setForm({
          full_name: profile.full_name || '', phone: profile.phone || '', avatar_url: profile.avatar_url || '',
          employment_status: profile.employment_status || 'active', job_title: profile.job_title || '', department: profile.department || '',
          joined_on: profile.joined_on || '', id_expires_on: profile.id_expires_on || '', bio: profile.bio || '',
          show_on_website: !!profile.show_on_website, username: profile.username || '', qualifications: profile.qualifications || '',
          experience: profile.experience || '', subjects: profile.subjects || '', email: profile.email || '', preferred_email: profile.preferred_email || '',
        });
        setSignature(sig.signature_data || null);
      } catch (e:any) { setError(e?.message || 'Unable to load your profile.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const set = (key:string, value:any) => setForm((current:any) => ({ ...current, [key]: value }));
  const clearNotice = () => { setMessage(''); setError(''); };

  async function saveProfile() {
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    clearNotice(); setSaving(true);
    try { const updated = await updateMyProfile(form); setMe(updated); setMessage('Profile saved successfully.'); }
    catch (e:any) { setError(e?.message || 'Unable to save profile.'); }
    finally { setSaving(false); }
  }

  async function uploadAvatar(file:File) {
    clearNotice(); setUploading(true);
    try { const url = await uploadProfileImage(file, 'staff'); set('avatar_url', url); setMessage('Photo uploaded. Save the profile to apply the new photo.'); }
    catch (e:any) { setError(e?.message || 'Unable to upload photo.'); }
    finally { setUploading(false); }
  }

  async function saveSignature() {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) { setError('Please draw your signature first.'); return; }
    const data = pad.getDataURL(); if (!data) return;
    clearNotice(); setSavingSignature(true);
    try { await saveMySignature(data); setSignature(data); pad.clear(); setMessage('Official signature saved and ready for reports.'); }
    catch (e:any) { setError(e?.message || 'Unable to save signature.'); }
    finally { setSavingSignature(false); }
  }

  if (loading) return <AdminShell title="My Profile"><div className="grid min-h-[60vh] place-items-center"><div className="text-sm font-bold text-slate-500">Loading your profile…</div></div></AdminShell>;

  return <AdminShell title="My Profile">
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
        <div className="h-2 bg-gradient-to-r from-[#006b50] via-[#00866a] to-[#d4a72c]" />
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">AMQM · Administrator Profile</div><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Your complete profile</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">One place to maintain your personal details, professional information, profile photo and official signature.</p></div>
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white text-xl font-black text-emerald-800 ring-1 ring-emerald-100">{form.avatar_url?<img src={form.avatar_url} alt="Profile" className="h-full w-full object-cover"/>:form.full_name?.charAt(0)||'A'}</div><div><div className="font-black text-slate-900">{form.full_name || 'Administrator'}</div><div className="text-xs font-semibold capitalize text-emerald-700">{String(me?.role||'admin').replaceAll('_',' ')}</div>{me?.staff_id&&<div className="mt-1 text-[11px] font-bold text-slate-400">{me.staff_id}</div>}</div></div>
        </div>
      </header>

      {(message||error) && <div className={`rounded-2xl border p-4 text-sm font-semibold ${error?'border-rose-200 bg-rose-50 text-rose-800':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <SectionTitle title="Personal information" text="Your identity and contact details." />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Input label="Full name" required value={form.full_name} onChange={v=>set('full_name',v)} />
          <Input label="Phone number" value={form.phone} onChange={v=>set('phone',v)} placeholder="+234 …" />
          <Input label="Profile email" value={form.email} onChange={v=>set('email',v)} placeholder="name@school.org" />
          <Input label="Preferred email" value={form.preferred_email} onChange={v=>set('preferred_email',v)} placeholder="name@school.org" />
          <Input label="Username" value={form.username} onChange={v=>set('username',v)} />
          <ReadOnly label="Account role" value={String(me?.role||'—').replaceAll('_',' ')} />
          <ReadOnly label="Scan code" value={me?.scan_code || 'Not assigned'} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <SectionTitle title="Staff information" text="Professional and employment information used by AMQM." />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <ReadOnly label="Staff ID" value={me?.staff_id || 'Not assigned'} />
          <ReadOnly label="Profile created" value={me?.created_at ? new Date(me.created_at).toLocaleDateString() : '—'} />
          <Input label="Job title" value={form.job_title} onChange={v=>set('job_title',v)} placeholder="School Director / Administrator / …" />
          <Input label="Department" value={form.department} onChange={v=>set('department',v)} placeholder="Administration" />
          <Input label="Joined date" type="date" value={form.joined_on} onChange={v=>set('joined_on',v)} />
          <Input label="ID expiry date" type="date" value={form.id_expires_on} onChange={v=>set('id_expires_on',v)} />
          <label><span className={label}>Employment status</span><select className={field} value={form.employment_status||'active'} onChange={e=>set('employment_status',e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option><option value="left">Left</option></select></label>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <SectionTitle title="Professional profile" text="Information used for the staff directory and public website profile." />
        <div className="mt-6 space-y-5"><Area label="Biography" value={form.bio} onChange={v=>set('bio',v)} placeholder="Brief professional biography…"/><div className="grid gap-5 md:grid-cols-3"><Area label="Qualifications" value={form.qualifications} onChange={v=>set('qualifications',v)}/><Area label="Experience" value={form.experience} onChange={v=>set('experience',v)}/><Area label="Subjects / responsibilities" value={form.subjects} onChange={v=>set('subjects',v)}/></div><label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={!!form.show_on_website} onChange={e=>set('show_on_website',e.target.checked)}/><span><span className="block text-sm font-black text-slate-800">Show my professional profile on the public website</span><span className="mt-1 block text-xs text-slate-500">Only enable this when the profile is complete and approved for public display.</span></span></label></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <SectionTitle title="Profile photo" text="Used in your staff identity and staff directory." />
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-3xl bg-emerald-50 text-3xl font-black text-emerald-800 ring-1 ring-emerald-100">{form.avatar_url?<img src={form.avatar_url} alt="Profile photo" className="h-full w-full object-cover"/>:form.full_name?.charAt(0)||'A'}</div><div><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)uploadAvatar(file)}}/><button type="button" disabled={uploading} onClick={()=>fileRef.current?.click()} className="rounded-xl bg-[#006b50] px-4 py-2.5 text-sm font-black text-white hover:bg-[#005a43]">{uploading?'Uploading…':'Choose profile photo'}</button><p className="mt-2 text-xs text-slate-400">PNG, JPG or WebP. A clear professional headshot works best.</p></div></div>
      </section>

      <section className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-5 shadow-sm md:p-7">
        <SectionTitle title="Official signature" text="Used on official documents and report cards. Your signature has its own audit trail." />
        <div className="mt-6 grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className={label}>Current signature</div>{signature?<img src={signature} alt="Current official signature" className="mt-3 h-36 w-full rounded-xl border border-slate-100 bg-white object-contain p-3"/>:<div className="mt-3 grid h-36 place-items-center rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-slate-400">No signature saved</div>}<p className="mt-3 text-xs text-slate-500">Drawing and saving a new signature replaces the current official signature.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className={label}>Draw replacement signature</div><div className="mt-3"><SignaturePad ref={el=>{sigRef.current=el}} height={160}/></div><button type="button" disabled={savingSignature} onClick={saveSignature} className="mt-3 rounded-xl bg-[#006b50] px-4 py-2.5 text-sm font-black text-white hover:bg-[#005a43]">{savingSignature?'Saving signature…':'Save official signature'}</button></div></div>
      </section>

      <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between"><div className="px-2"><div className="text-sm font-black text-slate-800">Keep your profile current</div><div className="text-xs text-slate-500">Profile changes are recorded in the administrative audit trail.</div></div><button type="button" disabled={saving} onClick={saveProfile} className="rounded-xl bg-[#006b50] px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-[#005a43]">{saving?'Saving profile…':'Save profile changes'}</button></div>
    </div>
  </AdminShell>;
}

function SectionTitle({title,text}:{title:string;text:string}){return <div className="border-b border-slate-100 pb-5"><h3 className="text-xl font-black text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>}
function Input({label:labelText,value,onChange,placeholder,type='text',required=false}:{label:string;value:any;onChange:(v:string)=>void;placeholder?:string;type?:string;required?:boolean}){return <label><span className={label}>{labelText}{required?' *':''}</span><input required={required} type={type} value={value||''} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className={field}/></label>}
function Area({label:labelText,value,onChange,placeholder}:{label:string;value:any;onChange:(v:string)=>void;placeholder?:string}){return <label><span className={label}>{labelText}</span><textarea rows={5} value={value||''} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className={`${field} min-h-28 resize-y`}/></label>}
function ReadOnly({label:labelText,value}:{label:string;value:string}){return <div><span className={label}>{labelText}</span><div className={`${field} flex items-center justify-between bg-slate-50 font-bold capitalize text-slate-700`}><span>{value}</span><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">System managed</span></div></div>}

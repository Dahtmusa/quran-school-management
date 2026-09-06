'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {loadCMSSettings} from '@/lib/cms-live-store';
import {createClient} from '@/lib/supabase/client';

type Tab='staff'|'teacher'|'parent';

function dashboardFor(role?:string){
  if(role==='teacher')return'/teacher';
  if(role==='parent')return'/parent';
  if(role==='security')return'/security';
  if(role==='finance')return'/fees';
  if(role==='admissions')return'/admissions/manage';
  return'/admin';
}

function EyeOpen(){return<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
function EyeOff(){return<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}

function PasswordField({value,onChange,label,autoComplete}:{value:string;onChange:(v:string)=>void;label:string;autoComplete?:string}){
  const[show,setShow]=useState(false);
  return(
    <div>
      <label style={{display:'block',fontSize:12,fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',color:'#4A6259',marginBottom:6}}>{label}</label>
      <div style={{position:'relative'}}>
        <input
          type={show?'text':'password'}
          autoComplete={autoComplete||'current-password'}
          value={value}
          onChange={e=>onChange(e.target.value)}
          required
          style={{width:'100%',border:'1.5px solid #D6DDD9',borderRadius:10,padding:'11px 44px 11px 14px',fontSize:15,background:'#fff',outline:'none',fontFamily:'inherit',color:'#1E2D28',boxSizing:'border-box',transition:'border-color .15s,box-shadow .15s'}}
          onFocus={e=>{e.target.style.borderColor='#062d2a';e.target.style.boxShadow='0 0 0 3px rgba(6,45,40,.08)'}}
          onBlur={e=>{e.target.style.borderColor='#D6DDD9';e.target.style.boxShadow='none'}}
        />
        <button type="button" tabIndex={-1} onClick={()=>setShow(s=>!s)}
          style={{position:'absolute',right:0,top:0,bottom:0,width:44,display:'flex',alignItems:'center',justifyContent:'center',color:'#7A9188',background:'none',border:'none',cursor:'pointer',borderRadius:'0 10px 10px 0'}}>
          {show?<EyeOpen/>:<EyeOff/>}
        </button>
      </div>
    </div>
  );
}

function TextField({value,onChange,label,type='text',placeholder,autoComplete}:{value:string;onChange:(v:string)=>void;label:string;type?:string;placeholder?:string;autoComplete?:string}){
  return(
    <div>
      <label style={{display:'block',fontSize:12,fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',color:'#4A6259',marginBottom:6}}>{label}</label>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={{width:'100%',border:'1.5px solid #D6DDD9',borderRadius:10,padding:'11px 14px',fontSize:15,background:'#fff',outline:'none',fontFamily:'inherit',color:'#1E2D28',boxSizing:'border-box',transition:'border-color .15s,box-shadow .15s'}}
        onFocus={e=>{e.target.style.borderColor='#062d2a';e.target.style.boxShadow='0 0 0 3px rgba(6,45,40,.08)'}}
        onBlur={e=>{e.target.style.borderColor='#D6DDD9';e.target.style.boxShadow='none'}}
      />
    </div>
  );
}

// Minimal 8-pointed Islamic star, drawn as SVG paths
function IslamicStar({size=260,opacity=0.07}:{size?:number;opacity?:number}){
  const c=size/2,r=size*0.42,r2=size*0.22,pts=8;
  const points:string[]=[];
  for(let i=0;i<pts;i++){
    const a0=(i*Math.PI*2/pts)-Math.PI/2;
    const a1=((i+.5)*Math.PI*2/pts)-Math.PI/2;
    points.push(`${c+r*Math.cos(a0)},${c+r*Math.sin(a0)}`);
    points.push(`${c+r2*Math.cos(a1)},${c+r2*Math.sin(a1)}`);
  }
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{opacity,pointerEvents:'none'}}>
      <polygon points={points.join(' ')} fill="#C9A84C"/>
      <circle cx={c} cy={c} r={r*.18} fill="none" stroke="#C9A84C" strokeWidth={size*.015}/>
      {Array.from({length:8},(_,i)=>{
        const a=(i*Math.PI*2/8)-Math.PI/2;
        const x1=c+r*.28*Math.cos(a),y1=c+r*.28*Math.sin(a);
        const x2=c+r*.92*Math.cos(a),y2=c+r*.92*Math.sin(a);
        return<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#C9A84C" strokeWidth={size*.012}/>;
      })}
    </svg>
  );
}

export default function Login(){
  const[tab,setTab]=useState<Tab>('staff');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[schoolAddress,setSchoolAddress]=useState('Adamawa State, Nigeria');

  useEffect(()=>{
    loadCMSSettings().then(s=>{
      const addr=s?.contact?.address;
      if(addr) setSchoolAddress(addr);
    }).catch(()=>{});
  },[]);

  const[credential,setCredential]=useState('');
  const[password,setPassword]=useState('');
  const[username,setUsername]=useState('');
  const[tPassword,setTPassword]=useState('');
  const[phone,setPhone]=useState('');
  const[admissionNo,setAdmissionNo]=useState('');

  async function submitStaff(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    const supabase=createClient();
    if(credential.includes('@')){
      // Try direct auth email first; if that fails, try preferred_email lookup
      let authResult=await supabase.auth.signInWithPassword({email:credential.trim(),password});
      if(authResult.error){
        const{data:realEmail}=await supabase.rpc('get_auth_email_by_preferred_email',{p_preferred_email:credential.trim()});
        if(realEmail){
          authResult=await supabase.auth.signInWithPassword({email:realEmail,password});
        }
      }
      if(authResult.error){setError('Invalid email or password');setBusy(false);return}
      const{data:profile}=await supabase.from('profiles').select('role').eq('id',authResult.data.user.id).maybeSingle();
      window.location.href=dashboardFor(profile?.role);
    }else{
      const{data:emailData,error:rpcErr}=await supabase.rpc('get_email_by_username',{p_username:credential.trim().toLowerCase()});
      if(rpcErr||!emailData){setError('Invalid username or password');setBusy(false);return}
      const{data,error:err}=await supabase.auth.signInWithPassword({email:emailData,password});
      if(err){setError('Invalid username or password');setBusy(false);return}
      const{data:profile}=await supabase.from('profiles').select('role').eq('id',data.user.id).maybeSingle();
      window.location.href=dashboardFor(profile?.role);
    }
  }

  async function submitTeacher(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    const supabase=createClient();
    const{data:emailData,error:rpcErr}=await supabase.rpc('get_email_by_username',{p_username:username.trim().toLowerCase()});
    if(rpcErr||!emailData){setError('Invalid username or password');setBusy(false);return}
    const{data,error:err}=await supabase.auth.signInWithPassword({email:emailData,password:tPassword});
    if(err){setError('Invalid username or password');setBusy(false);return}
    window.location.href='/teacher';
  }

  async function submitParent(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    const supabase=createClient();
    const{data,error:err}=await supabase.functions.invoke('parent-login',{body:{phone:phone.trim(),admission_no:admissionNo.trim()}});
    if(err||data?.error){setError(data?.error||err?.message||'Login failed');setBusy(false);return}
    const sess=data?.session;
    if(!sess){setError('No session returned');setBusy(false);return}
    await supabase.auth.setSession({access_token:sess.access_token,refresh_token:sess.refresh_token});
    window.location.href='/parent';
  }

  const tabs:{key:Tab;label:string}[]=[
    {key:'staff',label:'Admin / Staff'},
    {key:'teacher',label:'Teacher'},
    {key:'parent',label:'Parent'},
  ];

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{margin:0}
        .login-root{min-height:100svh;display:flex;font-family:'DM Sans',system-ui,sans-serif;background:#062d2a}
        /* Left branding panel */
        .brand-panel{
          width:42%;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between;padding:48px 44px;
          background:linear-gradient(160deg,#062d2a 0%,#0c4a3d 60%,#093d32 100%);
          position:relative;overflow:hidden;
        }
        .brand-star{position:absolute;top:50%;left:50%;transform:translate(-50%,-52%);pointer-events:none}
        .brand-badge{
          width:60px;height:60px;border-radius:16px;
          background:rgba(201,168,76,.15);border:1.5px solid rgba(201,168,76,.3);
          display:flex;align-items:center;justify-content:center;
          font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;
          color:#C9A84C;letter-spacing:.04em;
        }
        .brand-name{
          margin-top:28px;
          font-family:'Cormorant Garamond',Georgia,serif;
          font-size:clamp(22px,2.4vw,30px);font-weight:700;
          color:#fff;line-height:1.25;text-wrap:balance;
        }
        .brand-sub{
          margin-top:10px;font-size:13px;font-weight:400;
          color:rgba(255,255,255,.5);line-height:1.65;max-width:280px;
        }
        .brand-divider{width:36px;height:2px;background:#C9A84C;border-radius:2px;margin:24px 0}
        .brand-quote{
          font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;
          font-size:15px;color:rgba(255,255,255,.55);line-height:1.7;max-width:280px;
        }
        .brand-footer{font-size:11.5px;color:rgba(255,255,255,.28);letter-spacing:.04em}
        /* Right form panel */
        .form-panel{
          flex:1;background:#FDFCF8;display:flex;align-items:center;justify-content:center;
          padding:40px 32px;
        }
        .form-inner{width:100%;max-width:400px}
        .form-heading{
          font-family:'Cormorant Garamond',Georgia,serif;
          font-size:32px;font-weight:700;color:#062d2a;line-height:1.1;
        }
        .form-sub{margin-top:6px;font-size:14px;color:#6B8278;line-height:1.5}
        /* Tab bar */
        .tab-bar{display:flex;margin-top:32px;border-bottom:2px solid #E4EAE7;gap:0}
        .tab-btn{
          padding:0 20px 12px;font-size:13px;font-weight:600;color:#7A9188;
          background:none;border:none;cursor:pointer;border-bottom:2.5px solid transparent;
          margin-bottom:-2px;transition:color .15s,border-color .15s;letter-spacing:.01em;white-space:nowrap;
        }
        .tab-btn:first-child{padding-left:0}
        .tab-btn.active{color:#062d2a;border-bottom-color:#C9A84C}
        /* Form body */
        .form-body{margin-top:28px;display:flex;flex-direction:column;gap:18px}
        .form-hint{font-size:12.5px;color:#7A9188;line-height:1.55;padding:10px 12px;background:#F0F4F2;border-radius:8px;border-left:3px solid #C9A84C}
        .submit-btn{
          width:100%;padding:13px;border:none;border-radius:10px;
          background:#062d2a;color:#C9A84C;font-size:15px;font-weight:600;
          cursor:pointer;font-family:inherit;letter-spacing:.02em;
          transition:background .15s,opacity .15s;
          display:flex;align-items:center;justify-content:center;gap:8px;
        }
        .submit-btn:hover:not(:disabled){background:#0a3d33}
        .submit-btn:disabled{opacity:.55;cursor:not-allowed}
        .submit-arrow{font-size:18px;transition:transform .15s}
        .submit-btn:hover:not(:disabled) .submit-arrow{transform:translateX(3px)}
        .error-box{
          font-size:13px;color:#B91C1C;background:#FEF2F2;border:1px solid #FECACA;
          border-radius:8px;padding:10px 12px;line-height:1.5;
        }
        .back-link{margin-top:28px;text-align:center;font-size:13px;color:#7A9188}
        .back-link a{color:#062d2a;font-weight:600;text-decoration:none}
        .back-link a:hover{color:#C9A84C}
        /* Mobile */
        @media(max-width:720px){
          .login-root{flex-direction:column;background:#FDFCF8}
          .brand-panel{
            width:100%;padding:28px 24px 30px;
            background:linear-gradient(135deg,#062d2a 0%,#0c4a3d 100%);
            border-radius:0 0 28px 28px;
          }
          .brand-star{display:none}
          .brand-name{font-size:20px;margin-top:16px}
          .brand-divider,.brand-quote{display:none}
          .brand-footer{margin-top:8px}
          .form-panel{align-items:flex-start;padding:32px 24px 48px}
          .form-heading{font-size:26px}
          .tab-btn{padding:0 14px 12px;font-size:12.5px}
        }
      `}</style>

      <div className="login-root">

        {/* ── Branding panel ── */}
        <div className="brand-panel">
          <div className="brand-star"><IslamicStar size={320} opacity={0.09}/></div>

          <div style={{position:'relative'}}>
            <div className="brand-badge">آم</div>
            <div className="brand-name">Aliyu and Maimuna Center for Qur'anic Memorization</div>
            <div className="brand-sub">{schoolAddress} · Est. 2019</div>
            <div className="brand-divider"/>
            <div className="brand-quote">"The best among you are those who learn the Qur'ān and teach it."</div>
          </div>

          <div className="brand-footer">AMQM Staff & Parent Portal · Secure Access</div>
        </div>

        {/* ── Form panel ── */}
        <div className="form-panel">
          <div className="form-inner">
            <div className="form-heading">Sign in</div>
            <div className="form-sub">Access the AMQM management portal</div>

            {/* Tabs */}
            <div className="tab-bar">
              {tabs.map(t=>(
                <button key={t.key} className={`tab-btn${tab===t.key?' active':''}`}
                  onClick={()=>{setTab(t.key);setError('')}}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Staff / Admin */}
            {tab==='staff'&&(
              <form onSubmit={submitStaff} className="form-body">
                <div className="form-hint">For administrators, principal, finance, admissions and security staff.</div>
                <TextField label="Email or username" value={credential} onChange={setCredential} autoComplete="username"/>
                <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password"/>
                {error&&<div className="error-box">{error}</div>}
                <button type="submit" className="submit-btn" disabled={busy}>
                  {busy?'Signing in…':'Sign in'}<span className="submit-arrow">→</span>
                </button>
              </form>
            )}

            {/* Teacher */}
            {tab==='teacher'&&(
              <form onSubmit={submitTeacher} className="form-body">
                <div className="form-hint">Use the username and password assigned by the school administrator.</div>
                <TextField label="Username" value={username} onChange={setUsername} autoComplete="username"/>
                <PasswordField label="Password" value={tPassword} onChange={setTPassword} autoComplete="current-password"/>
                {error&&<div className="error-box">{error}</div>}
                <button type="submit" className="submit-btn" disabled={busy}>
                  {busy?'Signing in…':'Sign in as Teacher'}<span className="submit-arrow">→</span>
                </button>
              </form>
            )}

            {/* Parent */}
            {tab==='parent'&&(
              <form onSubmit={submitParent} className="form-body">
                <div className="form-hint">Use your registered phone number and your child's admission number.</div>
                <TextField label="Parent phone number" value={phone} onChange={setPhone} type="tel" placeholder="e.g. 08012345678"/>
                <TextField label="Child's admission number" value={admissionNo} onChange={setAdmissionNo} placeholder="e.g. AMQM-2024-001"/>
                {error&&<div className="error-box">{error}</div>}
                <button type="submit" className="submit-btn" disabled={busy}>
                  {busy?'Verifying…':'Sign in as Parent'}<span className="submit-arrow">→</span>
                </button>
                <p style={{fontSize:12,color:'#7A9188',lineHeight:1.6}}>Multiple children? Log in with any one admission number — all children appear in your dashboard.</p>
              </form>
            )}

            <div className="back-link"><Link href="/">← Back to website</Link></div>
          </div>
        </div>
      </div>
    </>
  );
}

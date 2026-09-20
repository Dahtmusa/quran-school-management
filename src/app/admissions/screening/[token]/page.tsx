'use client';

import {useEffect,useRef,useState} from 'react';
import {useParams,useSearchParams} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {loadAdmissionScreening} from '@/lib/live-store';

type Screening=any;

export default function ScreeningRoom(){
  const params=useParams<{token:string}>();
  const search=useSearchParams();
  const role=search.get('role')==='interviewer'?'interviewer':'applicant';
  const [screening,setScreening]=useState<Screening|null>(null);
  const [status,setStatus]=useState('Loading secure screening room…');
  const [connected,setConnected]=useState(false);
  const localVideo=useRef<HTMLVideoElement>(null);
  const remoteVideo=useRef<HTMLVideoElement>(null);
  const pc=useRef<RTCPeerConnection|null>(null);
  const client=useRef(createClient());
  const localStream=useRef<MediaStream|null>(null);
  const peerId=useRef(crypto.randomUUID());

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const row=await loadAdmissionScreening(params.token);
        if(!alive)return;
        if(!row){setStatus('This screening link is invalid or has expired.');return;}
        setScreening(row);
      }catch(e:any){setStatus(e?.message||'Unable to load the screening room.');}
    })();
    return()=>{alive=false};
  },[params.token]);

  useEffect(()=>{
    if(!screening)return;
    let disposed=false;
    const supabase=client.current;
    const topic='amqm-screening:'+params.token;
    const ch=supabase.channel(topic,{config:{broadcast:{ack:true}}});

    const send=async(payload:any)=>{
      try{await ch.send({type:'broadcast',event:'signal',payload:{...payload,sender:peerId.current}})}catch(e){console.error(e);}
    };

    const start=async()=>{
      try{
        localStream.current=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
        if(localVideo.current){localVideo.current.srcObject=localStream.current;await localVideo.current.play().catch(()=>{});}
        const connection=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
        pc.current=connection;
        localStream.current.getTracks().forEach(track=>connection.addTrack(track,localStream.current!));
        connection.ontrack=e=>{if(remoteVideo.current){remoteVideo.current.srcObject=e.streams[0];remoteVideo.current.play().catch(()=>{});}};
        connection.onicecandidate=e=>{if(e.candidate)send({kind:'ice',candidate:e.candidate.toJSON()});};
        connection.onconnectionstatechange=()=>{setConnected(connection.connectionState==='connected');setStatus(connection.connectionState==='connected'?'Connected — screening in progress':'Connection: '+connection.connectionState);};
        if(role==='applicant'){
          const offer=await connection.createOffer();
          await connection.setLocalDescription(offer);
          await send({kind:'offer',description:offer});
          setStatus('Waiting for the interviewer to join…');
        }else{
          setStatus('Waiting for the applicant to join…');
        }
      }catch(e:any){
        setStatus(e?.name==='NotAllowedError'?'Camera/microphone permission was denied. Please allow access and reload.':e?.message||'Unable to start camera and microphone.');
      }
    };

    ch.on('broadcast',{event:'signal'},async({payload}:any)=>{
      if(disposed||payload?.sender===peerId.current)return;
      try{
        if(payload.kind==='offer' && role==='interviewer'){
          const connection=pc.current;
          if(!connection)return;
          await connection.setRemoteDescription(payload.description);
          const answer=await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await send({kind:'answer',description:answer});
        }else if(payload.kind==='answer' && role==='applicant'){
          if(pc.current?.signalingState!=='have-local-offer')return;
          await pc.current.setRemoteDescription(payload.description);
        }else if(payload.kind==='ice' && pc.current){
          await pc.current.addIceCandidate(payload.candidate).catch(()=>{});
        }
      }catch(e){console.error('screening signal error',e);}
    }).subscribe(async state=>{
      if(state==='SUBSCRIBED'){
        setStatus('Room connected. Starting camera…');
        await start();
      }else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){
        setStatus('The screening room connection failed. Please reload.');
      }
    });

    return()=>{
      disposed=true;
      localStream.current?.getTracks().forEach(t=>t.stop());
      pc.current?.close();
      supabase.removeChannel(ch);
      pc.current=null;
    };
  },[screening,params.token,role]);

  if(!screening)return <main className="min-h-screen bg-slate-950 p-5 text-white"><div className="mx-auto max-w-3xl pt-16 text-center"><div className="text-xs font-black uppercase tracking-[.25em] text-amber-300">AMQM Virtual Screening</div><h1 className="mt-3 text-3xl font-black">{status}</h1><p className="mt-3 text-sm text-slate-400">If you were given a new screening link, use that link exactly as provided.</p></div></main>;

  const interview=role==='interviewer';
  return <main className="min-h-screen bg-slate-100">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4"><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">AMQM Virtual Screening</div><h1 className="text-xl font-black">{interview?'Interview: '+screening.applicant_name:'Your AMQM screening room'}</h1></div><div className={connected?'rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800':'rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800'}>{connected?'Live':'Connecting'}</div></div></header>
    <div className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[1fr_360px]">
      <section className="rounded-3xl bg-slate-950 p-4 shadow-xl">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 aspect-video"><video ref={localVideo} muted playsInline className="h-full w-full object-cover"/><span className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white">{interview?'Interviewer':'Applicant'} · You</span></div>
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 aspect-video"><video ref={remoteVideo} playsInline className="h-full w-full object-cover"/><span className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white">{interview?'Applicant':'Interviewer'}</span></div>
        </div>
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-slate-300">{status}</div>
      </section>
      <aside className="space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Applicant information</div>
          <div className="mt-3 space-y-3 text-sm">
            {[
              ['Application',screening.application_no],
              ['Name',screening.applicant_name],
              ['Date of birth',screening.date_of_birth||'—'],
              ['Gender',screening.gender||'—'],
              ['State / LGA',(screening.state||'—')+' / '+(screening.lga||'—')],
              ['Parent',screening.parent_name||'—'],
              ['Phone',screening.parent_phone||screening.guardian_phone||'—'],
              ['Quran level',screening.quran_level||'—'],
              ['Starting point',screening.starting_surah?'Surah '+screening.starting_surah+' : Ayah '+(screening.starting_ayah||1):'Not assigned yet'],
            ].map(([k,v])=><div key={k}><div className="text-[11px] text-slate-400">{k}</div><div className="font-bold text-slate-900">{v}</div></div>)}
          </div>
        </section>
        {interview&&<section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="font-black text-amber-950">Screening decision</div><p className="mt-1 text-xs leading-5 text-amber-900/70">Return to Admissions Management to record Successful, Unsuccessful, or Further Assessment Required after the interview.</p></section>}
      </aside>
    </div>
  </main>;
}

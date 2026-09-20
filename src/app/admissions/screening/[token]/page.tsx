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
  const [muted,setMuted]=useState(false);
  const [cameraOff,setCameraOff]=useState(false);
  const [started,setStarted]=useState(false);
  const localVideo=useRef<HTMLVideoElement>(null);
  const remoteVideo=useRef<HTMLVideoElement>(null);
  const pc=useRef<RTCPeerConnection|null>(null);
  const client=useRef(createClient());
  const localStream=useRef<MediaStream|null>(null);
  const peerId=useRef(crypto.randomUUID());
  const channel=useRef<any>(null);
  const disposed=useRef(false);
  const pendingIce=useRef<RTCIceCandidateInit[]>([]);

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
    disposed.current=false;
    const supabase=client.current;
    const topic='amqm-screening:'+params.token;
    const ch=supabase.channel(topic,{config:{broadcast:{ack:true}}});
    channel.current=ch;

    const send=async(payload:any)=>{
      if(disposed.current)return;
      try{await ch.send({type:'broadcast',event:'signal',payload:{...payload,sender:peerId.current}})}catch(e){console.error('screening signal send error',e);}
    };

    const createOffer=async()=>{
      const connection=pc.current;
      if(!connection||role!=='applicant')return;
      try{
        const offer=await connection.createOffer();
        await connection.setLocalDescription(offer);
        await send({kind:'offer',description:offer});
        setStatus('Waiting for the interviewer to connect…');
      }catch(e){console.error('offer error',e);}
    };

    const start=async()=>{
      if(started)return;
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera and microphone access requires HTTPS and a supported browser.');
        localStream.current=await navigator.mediaDevices.getUserMedia({
          video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},
          audio:true
        });
        if(localVideo.current){
          localVideo.current.srcObject=localStream.current;
          await localVideo.current.play().catch(()=>{});
        }
        const turnUrl=process.env.NEXT_PUBLIC_WEBRTC_TURN_URL;
        const iceServers:any[]=[{urls:'stun:stun.l.google.com:19302'}];
        if(turnUrl){
          iceServers.push({
            urls:turnUrl,
            username:process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME,
            credential:process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL
          });
        }
        const connection=new RTCPeerConnection({iceServers});
        pc.current=connection;
        localStream.current.getTracks().forEach(track=>connection.addTrack(track,localStream.current!));
        connection.ontrack=e=>{
          if(remoteVideo.current){
            remoteVideo.current.srcObject=e.streams[0];
            remoteVideo.current.play().catch(()=>{});
          }
        };
        connection.onicecandidate=e=>{if(e.candidate)send({kind:'ice',candidate:e.candidate.toJSON()});};
        connection.onconnectionstatechange=()=>{
          const state=connection.connectionState;
          setConnected(state==='connected');
          setStatus(state==='connected'?'Connected — screening in progress':state==='failed'?'Connection failed. If this repeats, AMQM needs TURN connectivity configured.':'Connection: '+state);
        };
        setStarted(true);
        await send({kind:'hello'});
        if(role==='applicant')setStatus('Waiting for the interviewer to join…');
      }catch(e:any){
        setStatus(e?.name==='NotAllowedError'?'Camera/microphone permission was denied. Please allow access and reload.':e?.message||'Unable to start camera and microphone.');
      }
    };

    ch.on('broadcast',{event:'signal'},async({payload}:any)=>{
      if(disposed.current||payload?.sender===peerId.current)return;
      try{
        if(payload.kind==='hello'){
          if(role==='applicant')await createOffer();
          return;
        }
        if(payload.kind==='offer' && role==='interviewer'){
          const connection=pc.current;
          if(!connection)return;
          await connection.setRemoteDescription(payload.description);
          for(const candidate of pendingIce.current.splice(0)){await connection.addIceCandidate(candidate).catch(()=>{});}
          const answer=await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await send({kind:'answer',description:answer});
          return;
        }
        if(payload.kind==='answer' && role==='applicant'){
          if(pc.current?.signalingState!=='have-local-offer')return;
          await pc.current.setRemoteDescription(payload.description);
          return;
        }
        if(payload.kind==='ice' && pc.current){
          if(pc.current.remoteDescription) await pc.current.addIceCandidate(payload.candidate).catch(()=>{});
          else pendingIce.current.push(payload.candidate);
        }
      }catch(e){console.error('screening signal error',e);}
    }).subscribe(async state=>{
      if(state==='SUBSCRIBED'){
        setStatus('Room connected. Start your camera when ready.');
        await start();
      }else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){
        setStatus('The screening room connection failed. Please reload.');
      }
    });

    return()=>{
      disposed.current=true;
      localStream.current?.getTracks().forEach(t=>t.stop());
      pc.current?.close();
      supabase.removeChannel(ch);
      pc.current=null;channel.current=null;
    };
  },[screening,params.token,role]);

  const toggleMute=()=>{
    const tracks=localStream.current?.getAudioTracks()||[];
    const next=!muted; tracks.forEach(t=>{t.enabled=!next}); setMuted(next);
  };
  const toggleCamera=()=>{
    const tracks=localStream.current?.getVideoTracks()||[];
    const next=!cameraOff; tracks.forEach(t=>{t.enabled=!next}); setCameraOff(next);
  };
  const leave=()=>{
    localStream.current?.getTracks().forEach(t=>t.stop());
    pc.current?.close();
    setConnected(false);
    setStatus('You left the screening room. You can reload to join again.');
  };

  if(!screening)return <main className="min-h-screen bg-slate-950 p-5 text-white"><div className="mx-auto max-w-3xl pt-16 text-center"><div className="text-xs font-black uppercase tracking-[.25em] text-amber-300">AMQM Virtual Screening</div><h1 className="mt-3 text-2xl sm:text-3xl font-black">{status}</h1><p className="mt-3 text-sm text-slate-400">If you were given a new screening link, use that link exactly as provided.</p></div></main>;

  const interview=role==='interviewer';
  return <main className="min-h-screen bg-slate-100">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-4"><div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-[.2em] text-emerald-700">AMQM Virtual Screening</div><h1 className="truncate text-lg sm:text-xl font-black">{interview?'Interview: '+screening.applicant_name:'Your AMQM screening room'}</h1></div><div className={connected?'shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800':'shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800'}>{connected?'Live':'Connecting'}</div></div></header>
    <div className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-5 lg:grid-cols-[1fr_360px]">
      <section className="rounded-2xl bg-slate-950 p-2.5 sm:rounded-3xl sm:p-4 shadow-xl">
        <div className="grid gap-2.5 md:grid-cols-2">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900 sm:rounded-2xl"><video ref={localVideo} muted playsInline className="h-full w-full object-cover"/><span className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-bold text-white">{interview?'Interviewer':'Applicant'} · You</span></div>
          <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900 sm:rounded-2xl"><video ref={remoteVideo} playsInline className="h-full w-full object-cover"/><span className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-bold text-white">{interview?'Applicant':'Interviewer'}</span></div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 sm:mt-4">
          <button onClick={toggleMute} disabled={!started} className="min-h-11 rounded-xl bg-white px-4 text-sm font-black text-slate-900">{muted?'Unmute':'Mute'}</button>
          <button onClick={toggleCamera} disabled={!started} className="min-h-11 rounded-xl bg-white px-4 text-sm font-black text-slate-900">{cameraOff?'Camera on':'Camera off'}</button>
          <button onClick={leave} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-black text-white">Leave</button>
        </div>
        <div className="mt-2.5 rounded-xl bg-white/5 p-3 text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm">{status}</div>
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Applicant information</div>
          <div className="mt-3 space-y-2.5 text-sm">
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
            ].map(([k,v])=><div key={k}><div className="text-[11px] text-slate-400">{k}</div><div className="break-words font-bold text-slate-900">{v}</div></div>)}
          </div>
        </section>
        {interview&&<section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl sm:p-5"><div className="font-black text-amber-950">Screening decision</div><p className="mt-1 text-xs leading-5 text-amber-900/70">Record the final decision in Admissions Management after the interview.</p></section>}
      </aside>
    </div>
  </main>;
}

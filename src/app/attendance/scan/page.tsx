'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type ScanResult={success?:boolean;error?:string;recordId?:string;scannedAt?:string;statusCode?:string;firstScanTime?:string};

function parsePayload(raw:string){
 try{
  const p=JSON.parse(raw);
  if(p?.institution!=='AMQM'||!p?.id||!['STUDENT','STAFF','MANAGEMENT'].includes(String(p.type).toUpperCase()))return null;
  return {personId:String(p.id),personType:String(p.type).toUpperCase()==='STUDENT'?'student':'staff' as 'student'|'staff'};
 }catch{return null}
}

export default function AttendanceScannerPage(){
 const videoRef=useRef<HTMLVideoElement|null>(null);
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const streamRef=useRef<MediaStream|null>(null);
 const scanningRef=useRef(false);
 const lastRawRef=useRef('');
 const [cameraOn,setCameraOn]=useState(false);
 const [supported,setSupported]=useState<boolean|null>(null);
 const [message,setMessage]=useState('Ready to scan');
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<ScanResult|null>(null);
 const [manual,setManual]=useState('');
 const [mainGateId,setMainGateId]=useState<string>('');
 useEffect(()=>{fetch('/api/attendance/scan-points').then(r=>r.json()).then(d=>{const p=(d.scanPoints||[]).find((x:any)=>String(x.name).toLowerCase()==='main gate');if(p)setMainGateId(p.id)}).catch(()=>{})},[]);

 useEffect(()=>{setSupported(typeof window!=='undefined' && 'BarcodeDetector' in window);return()=>stopCamera()},[]);
 const stopCamera=()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;scanningRef.current=false;setCameraOn(false)};
 const scanValue=async(raw:string)=>{
  if(busy||raw===lastRawRef.current)return;
  lastRawRef.current=raw;setBusy(true);setResult(null);setMessage('Finding ID…');
  try{
   let payload=parsePayload(raw);
   if(!payload){
    const lookupRes=await fetch('/api/attendance/lookup?q='+encodeURIComponent(raw.trim()));
    const found=await lookupRes.json();
    if(!lookupRes.ok||!found?.id||!found?.type){setMessage('ID not found. Check the card/ID number and try again.');return}
    payload={personId:String(found.id),personType:found.type==='student'?'student':'staff'};
   }
   setMessage('Recording attendance…');
   const res=await fetch('/api/attendance/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,period:'morning',scanPointId:mainGateId||undefined})});
   const d=await res.json();setResult(d);
   if(d.success){
    const t=new Date(d.scannedAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
    setMessage((d.statusCode==='late'?'LATE ARRIVAL':'ATTENDANCE RECORDED')+' · '+t);
   }else if(d.error==='duplicate'){
    setMessage('Already scanned. First scan: '+new Date(d.firstScanTime).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}));
   }else setMessage(d.error||'Scan failed');
  }catch{setMessage('Could not reach the attendance server. Check the gate internet connection.')}
  finally{setBusy(false);setTimeout(()=>{lastRawRef.current=''},2500)}
 };
 const startCamera=async()=>{
  if(!('BarcodeDetector' in window)){setMessage('Camera QR scanning is not supported by this browser. Use a USB QR scanner or enter the QR payload manually.');return}
  try{
   const detector=new (window as any).BarcodeDetector({formats:['qr_code']});
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play()}
   scanningRef.current=true;setCameraOn(true);setMessage('Point the camera at the QR code');
   const loop=async()=>{
    if(!scanningRef.current||!videoRef.current)return;
    try{const codes=await detector.detect(videoRef.current);if(codes.length&&codes[0].rawValue)await scanValue(codes[0].rawValue)}catch{}
    requestAnimationFrame(loop);
   };
   requestAnimationFrame(loop);
  }catch{setMessage('Camera access was blocked. Allow camera permission and try again.')}
 };
 return <main className="min-h-screen bg-[#f3f6f4] text-[#062d2a]">
  <header className="bg-[#062d2a] px-5 py-4 text-white"><div className="mx-auto flex max-w-5xl items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM Main Gate</div><div className="text-lg font-black">Attendance Scanner</div></div><Link href="/attendance" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">Admin Attendance</Link></div></header>
  <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_360px]">
   <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5">
    <div className="bg-[#0a4b40] p-6 text-white"><div className="text-xs font-black uppercase tracking-[.18em] text-[#e3c36b]">Gate rule</div><h1 className="mt-2 text-2xl font-black">Scan every day student and staff member</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/75">The server records the exact gate time. Arrivals after the configured morning cutoff are automatically marked Late.</p></div>
    <div className="p-5">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">{cameraOn?<video ref={videoRef} className="h-full w-full object-cover" playsInline muted/>:<div className="grid h-full place-items-center p-8 text-center text-slate-400"><div><div className="text-5xl">▣</div><div className="mt-3 text-sm font-bold">Camera scanner ready</div></div></div>}<div className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-[#e3c36b] shadow-[0_0_0_999px_rgba(0,0,0,.18)]"/></div>
      <div className="mt-4 flex flex-wrap gap-3"><button onClick={cameraOn?stopCamera:startCamera} className="rounded-xl bg-[#062d2a] px-5 py-3 text-sm font-black text-white">{cameraOn?'Stop camera':'Start camera scanner'}</button><button onClick={()=>{setResult(null);setMessage('Ready to scan')}} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">Clear</button></div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold">{message}</div>
      {!supported&&<div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><b>Camera QR scanning unavailable in this browser.</b> A USB QR scanner is recommended at the main gate; it behaves like a keyboard and can be used with the field on the right.</div>}
    </div>
   </section>
   <aside className="space-y-4">
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"><div className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">USB scanner fallback</div><h2 className="mt-1 text-lg font-black">Scan QR into this box</h2><p className="mt-2 text-xs leading-5 text-slate-500">Scan the QR/barcode or enter the printed Student/Staff ID number. The system resolves it to the correct school record before recording attendance.</p><input autoFocus value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){scanValue(manual);setManual('')}}} placeholder='Scan QR code…' className="mt-4 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600"/><button onClick={()=>{scanValue(manual);setManual('')}} disabled={!manual||busy} className="mt-3 w-full rounded-xl bg-[#062d2a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">Record scan</button></section>
    {result?.success&&<section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Recorded</div><div className="mt-2 text-2xl font-black">{result.statusCode==='late'?'LATE':'PRESENT'}</div><div className="mt-1 text-sm text-emerald-900">{result.scannedAt&&new Date(result.scannedAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}</div></section>}
    <section className="rounded-2xl bg-[#fffaf0] p-5 ring-1 ring-amber-100"><div className="text-xs font-black uppercase tracking-[.18em] text-amber-700">Attendance flow</div><ol className="mt-3 space-y-3 text-xs leading-5 text-slate-700"><li><b>1.</b> Scan the AMQM ID QR.</li><li><b>2.</b> Server verifies the person is active.</li><li><b>3.</b> Day students and staff are recorded at the main gate.</li><li><b>4.</b> Cutoff time determines Present or Late.</li><li><b>5.</b> After cutoff, missing day students/staff can be automatically marked Absent.</li></ol></section>
   </aside>
  </div>
  <canvas ref={canvasRef} className="hidden"/>
 </main>
}

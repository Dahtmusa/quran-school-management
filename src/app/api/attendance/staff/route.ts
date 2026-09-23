import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function adminClient(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser(); if(!user)return null;
 const {data:p}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(!['admin','super_admin','principal'].includes(p?.role||''))return null;
 return supabase;
}
const label=(s:string)=>({present:'Present',late:'Late',absent:'Absent',excused:'Excused',sick:'Sick'} as Record<string,string>)[s]||s;

export async function GET(req:NextRequest){
 const supabase=await adminClient(); if(!supabase)return NextResponse.json({error:'Forbidden'},{status:403});
 const url=new URL(req.url); const date=url.searchParams.get('date')||new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});
 const [staffRes,recordsRes,finesRes,statusRes,settingsRes]=await Promise.all([
  supabase.from('profiles').select('id,full_name,staff_id,role,employment_status').in('role',['teacher','admin','super_admin','principal','finance','security','admissions','accountant']).eq('employment_status','active').order('full_name'),
  supabase.from('attendance_records').select('id,person_id,scanned_at,status_code,note,review_status').eq('person_type','staff').eq('attendance_date',date).eq('period','morning'),
  supabase.from('staff_attendance_fines').select('id,staff_id,attendance_record_id,amount,status,reason').order('created_at',{ascending:false}).limit(1000),
  supabase.from('attendance_statuses').select('code,label'),
  supabase.from('attendance_settings').select('key,value').in('key',['staff_late_fine_enabled','staff_late_fine_amount','staff_absent_fine_enabled','staff_absent_fine_amount','staff_fine_payment_account_name','staff_fine_payment_account_number','staff_fine_payment_bank'])
 ]);
 if(staffRes.error||recordsRes.error||finesRes.error||statusRes.error||settingsRes.error)return NextResponse.json({error:staffRes.error?.message||recordsRes.error?.message||finesRes.error?.message||settingsRes.error?.message},{status:500});
 const settings:Object=Object.fromEntries((settingsRes.data||[]).map((x:any)=>[x.key,typeof x.value==='string'?x.value:JSON.stringify(x.value)]));
 const clean=(v:any)=>String(v??'').replace(/^"|"$/g,'');
 const lateEnabled=clean((settings as any).staff_late_fine_enabled)==='true'; const lateAmount=Number(clean((settings as any).staff_late_fine_amount)||0);
 const absentEnabled=clean((settings as any).staff_absent_fine_enabled)==='true'; const absentAmount=Number(clean((settings as any).staff_absent_fine_amount)||0);
 const recs=recordsRes.data||[]; const byPerson=new Map(recs.map((r:any)=>[r.person_id,r]));
 const fineByRecord=new Map((finesRes.data||[]).filter((f:any)=>f.attendance_record_id).map((f:any)=>[f.attendance_record_id,f]));
 const rows=(staffRes.data||[]).map((s:any)=>{
   const r=byPerson.get(s.id); const status=r?.status_code||'absent'; const fine=r?fineByRecord.get(r.id):undefined;
   const expectedFine=status==='late'&&lateEnabled?lateAmount:status==='absent'&&absentEnabled?absentAmount:0;
   return {id:r?.id||`absent-${s.id}`,full_name:s.full_name,staff_id:s.staff_id,status_code:status,status_label:label(status),scanned_at:r?.scanned_at||null,note:r?.note||null,fine_id:fine?.id||null,fine_amount:Number(fine?.amount||0),fine_status:fine?.status||null,expected_fine:expectedFine,fine_reason:fine?.reason||null};
 });
 const pendingFines=(finesRes.data||[]).filter((f:any)=>f.status==='pending');
 const summary={total:rows.length,present:rows.filter(r=>r.status_code==='present').length,late:rows.filter(r=>r.status_code==='late').length,absent:rows.filter(r=>r.status_code==='absent').length,excused:rows.filter(r=>r.status_code==='excused').length,sick:rows.filter(r=>r.status_code==='sick').length,pendingFines:pendingFines.length,pendingAmount:pendingFines.reduce((a:number,f:any)=>a+Number(f.amount||0),0)};
 return NextResponse.json({date,rows,summary,paymentAccount:{name:clean((settings as any).staff_fine_payment_account_name)||'AMQM School Account',number:clean((settings as any).staff_fine_payment_account_number),bank:clean((settings as any).staff_fine_payment_bank)}});
}

export async function POST(req:NextRequest){
 const supabase=await adminClient(); if(!supabase)return NextResponse.json({error:'Forbidden'},{status:403});
 const body=await req.json();
 if(body.action==='add_fine'){
  const n=Number(body.amount); if(!body.staffId||!Number.isFinite(n)||n<0||!String(body.reason||'').trim())return NextResponse.json({error:'Staff, amount and reason are required'},{status:400});
  const {error}=await supabase.from('staff_attendance_fines').insert({staff_id:body.staffId,attendance_record_id:body.attendanceRecordId||null,amount:n,reason:String(body.reason).trim(),notes:body.notes||null});
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({success:true});
 }
 if(body.action==='fine_status'){
  if(!body.id||!['pending','paid','waived'].includes(body.status))return NextResponse.json({error:'Invalid fine update'},{status:400});
  const {error}=await supabase.from('staff_attendance_fines').update({status:body.status,paid_at:body.status==='paid'?new Date().toISOString():null}).eq('id',body.id);
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({success:true});
 }
 return NextResponse.json({error:'Use attendance review for reasons/status changes'},{status:400});
}
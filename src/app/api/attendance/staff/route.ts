import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function adminClient(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) return null;
 const {data:p}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(!['admin','super_admin','principal'].includes(p?.role||'')) return null;
 return supabase;
}

export async function GET(req:NextRequest){
 const supabase=await adminClient(); if(!supabase) return NextResponse.json({error:'Forbidden'},{status:403});
 const url=new URL(req.url);
 const from=url.searchParams.get('from') || new Date(Date.now()-30*86400000).toISOString().slice(0,10);
 const to=url.searchParams.get('to') || new Date().toISOString().slice(0,10);
 const [{data:fines,error:fineError},{data:records,error:recordError},{data:staff,error:staffError},{data:warnings,error:warningError}]=await Promise.all([
  supabase.from('staff_attendance_fines').select('id,staff_id,attendance_record_id,amount,reason,status,created_at,paid_at,notes').order('created_at',{ascending:false}).limit(500),
  supabase.from('attendance_records').select('id,person_id,scanned_at,attendance_date,status_code,period,review_status').eq('person_type','staff').gte('attendance_date',from).lte('attendance_date',to).order('scanned_at',{ascending:false}).limit(2000),
  supabase.from('profiles').select('id,full_name,phone,role,employment_status,staff_id').not('role','is',null).order('full_name'),
  supabase.from('staff_attendance_warnings').select('id,staff_id,warning_type,reason,notes,issued_at,issued_by,status').order('issued_at',{ascending:false}).limit(500)
 ]);
 if(fineError||recordError||staffError||warningError) return NextResponse.json({error:fineError?.message||recordError?.message||staffError?.message||warningError?.message},{status:500});
 return NextResponse.json({fines:fines||[],records:records||[],staff:staff||[],warnings:warnings||[],from,to});
}

export async function POST(req:NextRequest){
 const supabase=await adminClient(); if(!supabase) return NextResponse.json({error:'Forbidden'},{status:403});
 const body=await req.json();
 if(body.action==='add_fine'){
  const {staffId,amount,reason,attendanceRecordId,notes}=body;
  const n=Number(amount);
  if(!staffId||!Number.isFinite(n)||n<0||!String(reason||'').trim()) return NextResponse.json({error:'Staff, amount and reason are required'},{status:400});
  const {error}=await supabase.from('staff_attendance_fines').insert({staff_id:staffId,attendance_record_id:attendanceRecordId||null,amount:n,reason:String(reason).trim(),notes:notes||null});
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({success:true});
 }
 if(body.action==='add_warning'){
  const {staffId,reason,notes,warningType='attendance'}=body;
  if(!staffId||!String(reason||'').trim()) return NextResponse.json({error:'Staff and warning reason are required'},{status:400});
  const {data:{user}}=await supabase.auth.getUser();
  const {error}=await supabase.from('staff_attendance_warnings').insert({staff_id:staffId,reason:String(reason).trim(),notes:notes||null,warning_type:String(warningType),issued_by:user?.id||null});
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({success:true});
 }
 if(body.action==='warning_status'){
  const {id,status}=body;
  if(!id||!['active','resolved','withdrawn'].includes(status)) return NextResponse.json({error:'Invalid warning update'},{status:400});
  const {error}=await supabase.from('staff_attendance_warnings').update({status}).eq('id',id);
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({success:true});
 }
 if(body.action==='fine_status'){
  const {id,status}=body;
  if(!id||!['pending','paid','waived'].includes(status)) return NextResponse.json({error:'Invalid fine update'},{status:400});
  const {error}=await supabase.from('staff_attendance_fines').update({status,paid_at:status==='paid'?new Date().toISOString():null}).eq('id',id);
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({success:true});
 }
 return NextResponse.json({error:'Unsupported action'},{status:400});
}
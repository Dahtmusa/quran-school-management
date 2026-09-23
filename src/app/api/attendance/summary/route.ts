import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});}
function cutoffReached(){return new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())>='09:00';}

export async function GET(req:NextRequest){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:viewer}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(!['admin','super_admin','principal'].includes(viewer?.role||''))return NextResponse.json({error:'Admin access required'},{status:403});

 const admin=createAdminClient();
 const date=req.nextUrl.searchParams.get('date')||today();
 const [studentsRes,staffRes,recordsRes]=await Promise.all([
  admin.from('students').select('id,full_name,admission_no,section,class_id').eq('status','active').order('full_name'),
  admin.from('profiles').select('id,full_name,staff_id,role,job_title,department,avatar_url').eq('employment_status','active').not('role','in','(admin,super_admin,principal,finance,admissions,librarian,accountant)').order('full_name'),
  admin.from('attendance_records').select('person_id,person_type,status_code,scanned_at,recorded_by').eq('attendance_date',date).eq('period','morning')
 ]);
 const err=studentsRes.error||staffRes.error||recordsRes.error;
 if(err)return NextResponse.json({error:err.message},{status:500});

 const records=new Map((recordsRes.data||[]).map((r:any)=>[r.person_type+':'+r.person_id,r]));
 const inferAbsent=date<today()||(date===today()&&cutoffReached());
 const build=(people:any[],type:'student'|'staff')=>people.map(p=>{
  const r=records.get(type+':'+p.id);
  const section=type==='student'?String(p.section||'').toLowerCase():'staff';
  const isGate=type==='staff'||section==='day';
  const status=r?.status_code||(isGate&&inferAbsent?'absent':null);
  return {...p,status,scanned_at:r?.scanned_at||null,source:r?'record':(isGate?'awaiting_gate_scan':'teacher')};
 });
 const students=build(studentsRes.data||[],'student');
 const staff=build(staffRes.data||[],'staff');
 const count=(rows:any[])=>({total:rows.length,present:rows.filter(r=>r.status==='present').length,late:rows.filter(r=>r.status==='late').length,absent:rows.filter(r=>r.status==='absent').length,not_marked:rows.filter(r=>!r.status).length});
 return NextResponse.json({
  date,cutoff:'09:00',students:{day:students.filter(r=>String(r.section).toLowerCase()==='day'),boarding:students.filter(r=>String(r.section).toLowerCase()==='boarding')},
  staff,counts:{day:count(students.filter(r=>String(r.section).toLowerCase()==='day')),boarding:count(students.filter(r=>String(r.section).toLowerCase()==='boarding')),staff:count(staff)}
 });
}
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function nigeriaDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function clean(v:unknown){return String(v??'').replace(/^"|"$/g,'');}

export async function GET(req:NextRequest){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const {data:viewer}=await supabase.from('profiles').select('role').eq('id',user.id).single();
  if(!['security','admin','super_admin','principal'].includes(viewer?.role||''))return NextResponse.json({error:'Forbidden'},{status:403});

  const admin=createAdminClient();
  const date=req.nextUrl.searchParams.get('date')||nigeriaDate();
  const requested=req.nextUrl.searchParams.get('type')||'students';
  const type=requested==='staff'?'staff':'student';

  const [peopleRes,recordsRes,statusRes,settingsRes]=await Promise.all([
    type==='student'
      ? admin.from('students').select('id,full_name,admission_no,section,status').eq('status','active').order('full_name')
      : admin.from('profiles').select('id,full_name,staff_id,role,job_title,department,employment_status').eq('employment_status','active').in('role',['teacher','admin','super_admin','principal','finance','security','admissions','librarian','accountant']).order('full_name'),
    admin.from('attendance_records').select('id,person_id,person_type,scanned_at,status_code,review_status,note').eq('person_type',type).eq('attendance_date',date).eq('period','morning'),
    admin.from('attendance_statuses').select('code,label,color').eq('is_active',true).order('sort_order'),
    admin.from('attendance_settings').select('key,value').eq('key','morning_cutoff_time').maybeSingle(),
  ]);

  const firstError=peopleRes.error||recordsRes.error||statusRes.error||settingsRes.error;
  if(firstError)return NextResponse.json({error:firstError.message},{status:500});

  const cutoff=clean(settingsRes.data?.value)||'09:00';
  const nowTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  const afterCutoff=nowTime>=cutoff;
  const today=nigeriaDate();
  const shouldDefaultAbsent=date<today || (date===today&&afterCutoff);

  const records=new Map((recordsRes.data||[]).map((r:any)=>[r.person_id,r]));
  const labels=new Map((statusRes.data||[]).map((s:any)=>[s.code,{label:s.label,color:s.color}]));

  const rows=(peopleRes.data||[]).map((p:any)=>{
    const record=records.get(p.id);
    const status=record?.status_code || (shouldDefaultAbsent?'absent':'not_recorded');
    const meta=labels.get(status);
    return {
      id:p.id,
      name:p.full_name,
      personId:p.id,
      identifier:type==='student'?p.admission_no:p.staff_id,
      section:type==='student'?p.section:null,
      role:type==='staff'?p.job_title||p.role:null,
      department:type==='staff'?p.department:null,
      status,
      statusLabel:meta?.label || (status==='not_recorded'?'Not recorded':status),
      statusColor:meta?.color || '#64748b',
      scannedAt:record?.scanned_at||null,
      reviewStatus:record?.review_status||null,
      attendanceRecordId:record?.id||null,
      note:record?.note||null,
    };
  });

  const counts={total:rows.length,present:0,late:0,excused:0,sick:0,absent:0,not_recorded:0};
  for(const row of rows) if(row.status in counts) counts[row.status as keyof typeof counts]++;

  return NextResponse.json({date,type,cutoff,afterCutoff,rows,counts});
}

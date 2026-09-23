import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function nigeriaDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function nigeriaTime(){return new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}

export async function POST(_req:NextRequest){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(!['security','admin','super_admin','principal'].includes(profile?.role||''))return NextResponse.json({error:'Forbidden'},{status:403});

 const admin=createAdminClient();
 const {data:settingRows}=await admin.from('attendance_settings').select('key,value').in('key',['morning_cutoff_time','staff_absent_fine_enabled','staff_absent_fine_amount']);
 const settingMap=Object.fromEntries((settingRows||[]).map((x:any)=>[x.key,typeof x.value==='string'?x.value:JSON.stringify(x.value)]));
 const cutoff=String(settingMap.morning_cutoff_time??'07:00').replace(/^"|"$/g,'');
 const absentFineEnabled=String(settingMap.staff_absent_fine_enabled??'false').replace(/^"|"$/g,'')==='true';
 const absentFineAmount=Number(String(settingMap.staff_absent_fine_amount??'0').replace(/^"|"$/g,''))||0;
 const now=nigeriaTime();
 if(now < cutoff)return NextResponse.json({success:false,error:'Morning attendance cannot be finalized before the cutoff time',cutoff,now},{status:400});

 const date=nigeriaDate();
 const {data:students}=await admin.from('students').select('id').eq('status','active').eq('section','day');
 const staffRoles=['teacher','admin','super_admin','principal','finance','security','admissions','librarian','accountant'];
 const {data:staff}=await admin.from('profiles').select('id').in('role',staffRoles);
 const ids=[...(students||[]).map(x=>({person_id:x.id,person_type:'student'})),...(staff||[]).map(x=>({person_id:x.id,person_type:'staff'}))];

 const {data:existing}=await admin.from('attendance_records').select('person_id,person_type').eq('attendance_date',date).eq('period','morning');
 const seen=new Set((existing||[]).map(x=>x.person_type+':'+x.person_id));
 const missing=ids.filter(x=>!seen.has(x.person_type+':'+x.person_id));
 if(missing.length){
   const rows=missing.map(x=>({person_id:x.person_id,person_type:x.person_type,attendance_date:date,status_code:'absent',period:'morning',review_status:'approved',recorded_by:user.id,note:'Automatically marked absent after the morning gate attendance cutoff.'}));
   const {error}=await admin.from('attendance_records').upsert(rows,{onConflict:'person_id,attendance_date,period',ignoreDuplicates:true});
   if(error)return NextResponse.json({error:error.message},{status:500});
   if(absentFineEnabled && absentFineAmount>0){
     const staffMissing=missing.filter(x=>x.person_type==='staff');
     const {data:inserted}=await admin.from('attendance_records').select('id,person_id').eq('attendance_date',date).eq('period','morning').eq('status_code','absent').in('person_id',staffMissing.map(x=>x.person_id));
     if(inserted?.length){
       await admin.from('staff_attendance_fines').upsert(inserted.map((x:any)=>({staff_id:x.person_id,attendance_record_id:x.id,amount:absentFineAmount,reason:'Unexcused staff absence',status:'pending'})),{onConflict:'attendance_record_id',ignoreDuplicates:true});
     }
   }
 }
 return NextResponse.json({success:true,date,cutoff,absentCreated:missing.length,eligibleCount:ids.length});
}

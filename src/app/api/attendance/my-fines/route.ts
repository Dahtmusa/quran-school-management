import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('id,role,full_name').eq('id',user.id).single();
 if(!profile || !['teacher','admin','super_admin','principal','finance','security','admissions','librarian','accountant'].includes(profile.role||''))return NextResponse.json({error:'Forbidden'},{status:403});
 const [{data:fines,error:fineError},{data:settings}]=await Promise.all([
  supabase.from('staff_attendance_fines').select('id,amount,reason,status,created_at,paid_at,notes,attendance_record_id').eq('staff_id',user.id).order('created_at',{ascending:false}).limit(100),
  supabase.from('attendance_settings').select('key,value').in('key',['staff_fine_payment_account_name','staff_fine_payment_account_number','staff_fine_payment_bank'])
 ]);
 if(fineError)return NextResponse.json({error:fineError.message},{status:500});
 const s:any=Object.fromEntries((settings||[]).map((x:any)=>[x.key,typeof x.value==='string'?x.value:JSON.stringify(x.value)]));
 const clean=(v:any)=>String(v??'').replace(/^"|"$/g,'');
 return NextResponse.json({
  fines:fines||[],
  pendingAmount:(fines||[]).filter((f:any)=>f.status==='pending').reduce((a:number,f:any)=>a+Number(f.amount||0),0),
  paymentAccount:{name:clean(s.staff_fine_payment_account_name)||'AMQM School Account',number:clean(s.staff_fine_payment_account_number),bank:clean(s.staff_fine_payment_bank)}
 });
}
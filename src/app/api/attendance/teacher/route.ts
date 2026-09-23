import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});}

export async function GET(req:NextRequest){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(profile?.role!=='teacher')return NextResponse.json({error:'Teacher access required'},{status:403});
 const date=req.nextUrl.searchParams.get('date')||today();
 const {data,error}=await supabase.rpc('teacher_amqm_boarding_roster',{p_date:date});
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({date,rows:data||[]});
}

export async function POST(req:NextRequest){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(profile?.role!=='teacher')return NextResponse.json({error:'Teacher access required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const studentId=String(body?.studentId||'');
 const status=String(body?.status||'');
 const date=String(body?.date||today());
 if(!studentId||!status)return NextResponse.json({error:'Student and status are required'},{status:400});
 if(date>today())return NextResponse.json({error:'Future attendance is not allowed.'},{status:400});
 const {data,error}=await supabase.rpc('teacher_amqm_record_boarding_attendance',{p_student_id:studentId,p_status:status,p_date:date});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({success:true,recordId:data});
}
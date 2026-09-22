import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();
 if(!['security','admin','super_admin','principal'].includes(profile?.role||''))return NextResponse.json({error:'Forbidden'},{status:403});
 const {data,error}=await supabase.from('attendance_scan_points').select('id,name,description').eq('is_active',true).order('name');
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({scanPoints:data||[]});
}

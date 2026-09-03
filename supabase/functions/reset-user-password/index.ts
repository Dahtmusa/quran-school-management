import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const authHeader=req.headers.get('Authorization');
    if(!authHeader)throw new Error('Missing authorization');

    const url=Deno.env.get('SUPABASE_URL')!;
    const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller is admin
    const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
    const{data:u,error:ue}=await caller.auth.getUser();
    if(ue||!u.user)throw new Error('Not authenticated');

    const admin=createClient(url,service);
    const{data:p}=await admin.from('profiles').select('role').eq('id',u.user.id).maybeSingle();
    if(!p||!['super_admin','admin','principal'].includes(p.role))throw new Error('Not authorised');

    const{user_id,new_password}=await req.json();
    if(!user_id||!new_password)throw new Error('user_id and new_password are required');
    if(String(new_password).length<8)throw new Error('Password must be at least 8 characters');

    const{error:ue2}=await admin.auth.admin.updateUserById(user_id,{password:String(new_password)});
    if(ue2)throw new Error(ue2.message);

    return new Response(JSON.stringify({success:true}),{
      headers:{...cors,'Content-Type':'application/json'},
    });
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:'Request failed'}),{
      status:400,headers:{...cors,'Content-Type':'application/json'},
    });
  }
});

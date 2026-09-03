import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const url=Deno.env.get('SUPABASE_URL')!;
    const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const{username,password}=await req.json();
    if(!username||!password)throw new Error('Username and password are required');

    const admin=createClient(url,service);

    // Look up profile by username (case-insensitive)
    const{data:profile,error:pe}=await admin
      .from('profiles')
      .select('id,role')
      .eq('username',String(username).trim().toLowerCase())
      .in('role',['teacher'])
      .maybeSingle();

    if(pe||!profile)throw new Error('Invalid username or password');

    // Get their email from auth.users
    const{data:authData,error:ae}=await admin.auth.admin.getUserById(profile.id);
    if(ae||!authData.user?.email)throw new Error('Invalid username or password');

    // Sign in with email + password
    const anonClient=createClient(url,anon);
    const{data:session,error:se}=await anonClient.auth.signInWithPassword({
      email:authData.user.email,
      password:String(password),
    });
    if(se||!session.session)throw new Error('Invalid username or password');

    return new Response(JSON.stringify({session:session.session}),{
      headers:{...cors,'Content-Type':'application/json'},
    });
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:'Login failed'}),{
      status:400,headers:{...cors,'Content-Type':'application/json'},
    });
  }
});

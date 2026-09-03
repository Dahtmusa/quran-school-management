import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const url=Deno.env.get('SUPABASE_URL')!;
    const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const{phone,admission_no}=await req.json();
    if(!phone||!admission_no)throw new Error('Phone number and admission number are required');

    // Normalise: keep last 11 digits of phone, uppercase admission
    const cleanPhone=String(phone).replace(/\D/g,'').slice(-11);
    const cleanAdmission=String(admission_no).trim().toUpperCase();
    if(cleanPhone.length<7)throw new Error('Phone number too short');

    const admin=createClient(url,service);

    // Find the student with this admission number
    const{data:student,error:se}=await admin
      .from('students')
      .select('id,full_name,admission_no,parent_phone,parent_name')
      .eq('admission_no',cleanAdmission)
      .eq('status','active')
      .maybeSingle();

    if(se||!student)throw new Error('No active student found with that admission number');

    // Validate phone: compare last 8 digits to tolerate local vs international formats
    const storedDigits=String(student.parent_phone||'').replace(/\D/g,'').slice(-8);
    const inputDigits=cleanPhone.slice(-8);
    if(!storedDigits||storedDigits!==inputDigits){
      throw new Error('Phone number does not match our records for this student');
    }

    // Find all siblings with the same stored parent_phone (exact match)
    const{data:siblings}=await admin
      .from('students')
      .select('id')
      .eq('parent_phone',student.parent_phone)
      .eq('status','active');

    const studentsToLink=(siblings||[{id:student.id}]);

    // Derive system email and password for this parent account
    const email=`parent_${cleanPhone}@amqm.ng`;
    const password=`PAR3NT_${cleanPhone}`;

    // Check if parent account already exists by looking for a profile with this phone and role
    const{data:existing}=await admin
      .from('profiles')
      .select('id')
      .eq('role','parent')
      .eq('phone',cleanPhone)
      .limit(1);

    let parentId:string;

    if(existing&&existing.length>0){
      parentId=existing[0].id;
    }else{
      // Create auth account for this parent
      const displayName=student.parent_name||`Parent of ${student.full_name}`;
      const{data:created,error:ce}=await admin.auth.admin.createUser({
        email,
        password,
        email_confirm:true,
        user_metadata:{full_name:displayName,role:'parent'},
      });
      if(ce||!created.user)throw new Error(ce?.message||'Failed to create parent account');
      parentId=created.user.id;

      // Create profile
      const{error:prErr}=await admin.from('profiles').upsert({
        id:parentId,
        full_name:displayName,
        role:'parent',
        phone:cleanPhone,
      },{onConflict:'id'});
      if(prErr){
        await admin.auth.admin.deleteUser(parentId);
        throw new Error(prErr.message);
      }
    }

    // Link all siblings to this parent account
    const links=studentsToLink.map((s:any)=>({
      parent_id:parentId,
      student_id:s.id,
      relationship:'parent',
    }));
    await admin.from('parent_students').upsert(links,{onConflict:'parent_id,student_id'});

    // Sign in and return session
    const anonClient=createClient(url,anon);
    const{data:session,error:loginErr}=await anonClient.auth.signInWithPassword({email,password});
    if(loginErr||!session.session)throw new Error('Login failed — please contact the school office');

    return new Response(JSON.stringify({session:session.session}),{
      headers:{...cors,'Content-Type':'application/json'},
    });
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:'Login failed'}),{
      status:400,headers:{...cors,'Content-Type':'application/json'},
    });
  }
});

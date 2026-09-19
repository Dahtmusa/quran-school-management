import type { SupabaseClient } from '@supabase/supabase-js';

export function stripAttendanceSetting(v: unknown){ return String(v ?? '').replace(/^"|"$/g,''); }

export function normalizeNigeriaPhone(raw: string){
  const digits=String(raw||'').replace(/\D/g,'');
  if(digits.startsWith('234')) return digits;
  if(digits.startsWith('0')) return '234'+digits.slice(1);
  if(digits.length===10) return '234'+digits;
  return digits;
}

async function sendTermii(apiKey:string,senderId:string,channel:string,to:string,message:string){
 const payload:Record<string,unknown>={api_key:apiKey,to,sms:message,type:'plain',channel};
 if(senderId && senderId!=='default') payload.from=senderId;
 const res=await fetch('https://api.ng.termii.com/api/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const json=await res.json(); if(!res.ok) throw new Error(json?.message||'Termii error'); return json;
}
async function sendAfricasTalking(apiKey:string,username:string,senderId:string,to:string,message:string){
 const params:Record<string,string>={username,to,message}; if(senderId) params.from=senderId;
 const res=await fetch('https://api.africastalking.com/version1/messaging',{method:'POST',headers:{apiKey,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
 const text=await res.text(); let json:any={}; try{json=JSON.parse(text)}catch{throw new Error(`Africa's Talking error: ${text.slice(0,160)}`)}
 if(!res.ok) throw new Error(String(json?.message||text.slice(0,160)));
 const recipients=json?.SMSMessageData?.Recipients||[]; if(!recipients.length) throw new Error('Africa\'s Talking returned no recipients');
 const failed=recipients.filter((x:any)=>x.status!=='Success'); if(failed.length) throw new Error(failed.map((x:any)=>`${x.number}: ${x.status}`).join(', '));
 return json;
}
async function sendBestBulkSMS(apiKey:string,senderId:string,to:string,message:string,route:string){
 const res=await fetch('https://www.bestbulksms.com.ng/api/sms/send',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({sender_id:senderId||'BESTBULKSMS',to:[to],message,route})});
 const text=await res.text(); let json:any={}; try{json=JSON.parse(text)}catch{}
 if(!res.ok) throw new Error(String(json?.message||json?.error||text.slice(0,160)||'BestBulkSMS error')); return json;
}
async function sendSmartSMS(apiKey:string,senderId:string,to:string,message:string){
 const res=await fetch('https://www.smartsmssolutions.com/api/json.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:apiKey,sender:senderId,to,message,type:0,routing:3})});
 const text=await res.text(); let json:any={}; try{json=JSON.parse(text)}catch{throw new Error(`SmartSMS error: ${text.slice(0,160)}`)}
 if(json.code!=='1000') throw new Error(String(json.description||json.message||'SmartSMS error')); return json;
}
async function sendTwilio(accountSid:string,authToken:string,from:string,to:string,message:string,apiKeySid?:string,apiKeySecret?:string){
 const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${apiKeySid||accountSid}:${apiKeySecret||authToken}`).toString('base64')`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,From:from,Body:message})});
 const json=await res.json(); if(!res.ok) throw new Error(json?.message||json?.code||'Twilio error'); return json;
}

export async function dispatchAttendanceSms(settings:Record<string,unknown>,rawTo:string,message:string){
 const to=normalizeNigeriaPhone(rawTo);
 if(!to) throw new Error('Invalid phone number');
 const provider=stripAttendanceSetting(settings.sms_provider)||'termii';
 const apiKey=stripAttendanceSetting(settings.sms_api_key);
 const senderId=stripAttendanceSetting(settings.sms_sender_id);
 if(!apiKey) throw new Error('SMS API key not configured');
 if(provider==='termii') await sendTermii(apiKey,senderId,stripAttendanceSetting(settings.sms_channel)||'generic',to,message);
 else if(provider==='africas_talking') await sendAfricasTalking(apiKey,stripAttendanceSetting(settings.sms_username),senderId,to,message);
 else if(provider==='bestbulksms') await sendBestBulkSMS(apiKey,senderId,to,message,stripAttendanceSetting(settings.sms_route)||'dnd');
 else if(provider==='smartsms') await sendSmartSMS(apiKey,senderId,to,message);
 else if(provider==='twilio') await sendTwilio(stripAttendanceSetting(settings.sms_account_sid),stripAttendanceSetting(settings.sms_auth_token),senderId,to,message,stripAttendanceSetting(settings.sms_api_key_sid)||undefined,stripAttendanceSetting(settings.sms_api_key_secret)||undefined);
 else throw new Error(`Unknown SMS provider: ${provider}`);
 return to;
}

import {sendAlert} from './delivery.mjs';
const config=Deno.env.toObject();
const rest=config.SUPABASE_URL+'/rest/v1/';
const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
async function db(path,method='GET',body=undefined){
 const response=await fetch(rest+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Database request failed: '+response.status);
 return response.status===204?null:response.json();
}
Deno.serve(async(req)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=req.headers.get('x-alert-token');
 if(!token||token.length>200)return new Response('Unauthorized',{status:401});
 try{
  // Only the database dispatcher knows this random token. Anonymous JWTs are insufficient.
  if(!await db('rpc/verify_alert_webhook','POST',{p_token:token}))return new Response('Unauthorized',{status:401});
  const channels=[];
  if(config.RESEND_API_KEY&&config.ALERT_FROM_EMAIL)channels.push('email');
  if(config.TWILIO_ACCOUNT_SID&&config.TWILIO_AUTH_TOKEN&&config.TWILIO_FROM_NUMBER)channels.push('sms');
  if(!channels.length)return Response.json({status:'awaiting_provider_setup',processed:0});
  const alerts=await db('rpc/claim_lead_alerts','POST',{p_channels:channels});
  let processed=0;
  for(const alert of alerts){
   try{
    const [lead]=await db('leads?id=eq.'+alert.lead_id+'&select=*');
    const result=lead?await sendAlert(alert.channel,lead,config):{status:'failed',last_error:'Submission no longer exists'};
    await db('lead_notifications?id=eq.'+alert.id,'PATCH',{...result,updated_at:new Date().toISOString()});
    processed++;
   }catch{
    // A worker failure leaves processing rows for reconciliation; never blindly resend an SMS.
    console.error('Alert processing interrupted',alert.id);
   }
  }
  return Response.json({processed});
 }catch{return Response.json({error:'Notification processing unavailable'},{status:503});}
});

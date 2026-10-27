const dashboard='https://colesautodetailingtexas.com/dashboard.html';
export async function sendAlert(channel,lead,config,request=fetch){
 let url,options;
 if(channel==='email'){
  if(!config.RESEND_API_KEY||!config.ALERT_FROM_EMAIL)return {status:'pending',last_error:'Email service not connected'};
  url='https://api.resend.com/emails';
  options={method:'POST',headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'coles-lead-'+lead.id},body:JSON.stringify({
   from:config.ALERT_FROM_EMAIL,to:['colesautodetailingtx@gmail.com'],subject:"New website inquiry — Cole's Auto Detailing",
   text:['New website form submission','Name: '+lead.name,'Phone: '+lead.phone,'Email: '+(lead.email||'Not provided'),'Service: '+lead.service_text,'Preferred date: '+(lead.preferred_date||'Flexible'),'Message: '+(lead.details||'None'),'View and manage: '+dashboard].join('\n'),
  })};
 }else if(channel==='sms'){
  if(!config.TWILIO_ACCOUNT_SID||!config.TWILIO_AUTH_TOKEN||!config.TWILIO_FROM_NUMBER)return {status:'pending',last_error:'Text service not connected'};
  url='https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(config.TWILIO_ACCOUNT_SID)+'/Messages.json';
  options={method:'POST',headers:{Authorization:'Basic '+btoa(config.TWILIO_ACCOUNT_SID+':'+config.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
   From:config.TWILIO_FROM_NUMBER,To:'+18328775556',Body:"Cole's: New website inquiry. Sign in to view the customer and message: "+dashboard,
  }).toString()};
 }else{return {status:'failed',last_error:'Unsupported channel'};}
 try{
  const response=await request(url,{...options,signal:AbortSignal.timeout(15000)});
  if(!response.ok)return {status:response.status>=500?'unknown':'failed',last_error:'Provider HTTP '+response.status};
  const data=await response.json();
  const id=channel==='email'?data.id:data.sid;
  if(!id)return {status:'unknown',last_error:'Provider response did not include a message identifier'};
  return {status:'accepted',provider_id:id,last_error:null};
 }catch{return {status:'unknown',last_error:'Delivery result uncertain; check provider logs before retrying'};}
}

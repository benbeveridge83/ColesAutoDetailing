import test from 'node:test';
import assert from 'node:assert/strict';
import {sendAlert} from '../supabase/functions/lead-alerts/delivery.mjs';
const lead={id:'lead-1',name:'Sample Customer',phone:'555-0100',email:'test@example.com',service_text:'Car wash',details:'Full details',preferred_date:null};
test('missing provider configuration never reports a sent alert',async()=>{
 const result=await sendAlert('email',lead,{},()=>{throw new Error('must not call network')});
 assert.equal(result.status,'pending');
});
test('email uses fixed owner recipient and stable idempotency key',async()=>{
 const result=await sendAlert('email',lead,{RESEND_API_KEY:'test-key',ALERT_FROM_EMAIL:'Cole <alerts@example.com>'},async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  const body=JSON.parse(options.body);assert.deepEqual(body.to,['colesautodetailingtx@gmail.com']);assert.match(body.text,/Full details/);
  assert.equal(options.headers['Idempotency-Key'],'coles-lead-lead-1');return new Response(JSON.stringify({id:'mail-1'}),{status:200});
 });assert.equal(result.status,'accepted');assert.equal(result.provider_id,'mail-1');
});
test('text uses owner phone and a dashboard link, never the submitting customer as recipient',async()=>{
 const result=await sendAlert('sms',lead,{TWILIO_ACCOUNT_SID:'AC123',TWILIO_AUTH_TOKEN:'test',TWILIO_FROM_NUMBER:'+15555555555'},async(url,options)=>{
  const body=new URLSearchParams(options.body);assert.equal(body.get('To'),'+18328775556');assert.match(body.get('Body'),/dashboard.html/);
  return new Response(JSON.stringify({sid:'SM123'}),{status:201});
 });assert.equal(result.status,'accepted');
});
test('timeouts are uncertain, not safe to retry automatically',async()=>{
 const result=await sendAlert('sms',lead,{TWILIO_ACCOUNT_SID:'AC123',TWILIO_AUTH_TOKEN:'test',TWILIO_FROM_NUMBER:'+15555555555'},async()=>{throw new Error('timeout')});
 assert.equal(result.status,'unknown');
});
test('provider rejection is recorded without claiming delivery',async()=>{
 const result=await sendAlert('email',lead,{RESEND_API_KEY:'test',ALERT_FROM_EMAIL:'alerts@example.com'},async()=>new Response('{}',{status:403}));
 assert.equal(result.status,'failed');assert.match(result.last_error,/403/);
});

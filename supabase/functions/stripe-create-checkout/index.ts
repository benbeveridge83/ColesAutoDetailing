// Supabase Edge Function: stripe-create-checkout
// Deployed with verify_jwt=false; explicitly verifies Supabase user JWT and staff membership.
// Stripe keys remain Supabase Edge Function secrets, never in browser code.
import Stripe from 'npm:stripe@^22';
import { createClient } from 'npm:@supabase/supabase-js@^2';

const json = (data:unknown,status=200,origin?:string|null) =>
  new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json',
    'cache-control':'no-store',
    ...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})
  }});

Deno.serve(async req=>{
 const base=Deno.env.get('APP_BASE_URL')?.replace(/\/+$/,'');
 const secret=Deno.env.get('STRIPE_SECRET_KEY');
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const supabaseUrl=Deno.env.get('SUPABASE_URL');
 if(!base || !secret || !serviceKey || !supabaseUrl)
   return json({error:'Stripe checkout is not configured yet. Ask the website administrator to complete the Stripe setup.'},503);
 let allowedOrigin:string;
 try {const u=new URL(base);if(u.protocol!=='https:')throw new Error('HTTPS required');allowedOrigin=u.origin}
 catch{return json({error:'APP_BASE_URL must be a valid HTTPS URL'},503)}
 const origin=req.headers.get('origin');
 if(origin && origin!==allowedOrigin)return json({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'access-control-allow-origin':allowedOrigin,'access-control-allow-methods':'POST, OPTIONS',
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-max-age':'600','vary':'Origin'
 }});
 if(req.method!=='POST')return json({error:'Method not allowed'},405,allowedOrigin);
 const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return json({error:'Sign in first'},401,allowedOrigin);
 const supabase=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:userData,error:authError}=await supabase.auth.getUser(token);
 if(authError||!userData.user)return json({error:'Invalid login'},401,allowedOrigin);
 const {data:staff,error:staffError}=await supabase.from('staff_users').select('user_id').eq('user_id',userData.user.id).maybeSingle();
 if(staffError||!staff)return json({error:'Not authorized'},403,allowedOrigin);
 let payload: {job_id?:unknown};
 try{payload=await req.json()}catch{return json({error:'Invalid JSON'},400,allowedOrigin)}
 const jobId=payload?.job_id;
 if(typeof jobId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(jobId))
   return json({error:'Invalid job ID'},400,allowedOrigin);
 const {data:job,error:jobError}=await supabase.from('jobs')
   .select('id,customer_id,price,amount_paid,stripe_paid_cents,status,service_description,customers(name,email)')
   .eq('id',jobId).maybeSingle();
 if(jobError||!job)return json({error:'Job not found'},404,allowedOrigin);
 if(job.status==='cancelled')return json({error:'Cancelled jobs cannot be billed'},409,allowedOrigin);
 if(job.price===null)return json({error:'Enter a quoted job price first'},409,allowedOrigin);
 const priceCents=Math.round(Number(job.price)*100);
 const cashCents=Math.round(Number(job.amount_paid||0)*100);
 const stripePaid=Number(job.stripe_paid_cents||0);
 const outstanding=priceCents-cashCents-stripePaid;
 if(!Number.isSafeInteger(outstanding)||outstanding<50||outstanding>99999999)
   return json({error:outstanding<=0?'This job has no unpaid balance.':'Invalid checkout amount.'},409,allowedOrigin);
 const now=new Date();
 const {data:active,error:activeError}=await supabase.from('payment_requests')
   .select('*').eq('job_id',job.id).in('status',['creating','open']).order('created_at',{ascending:false}).limit(1);
 if(activeError)return json({error:'Unable to check previous payments'},500,allowedOrigin);
 if(active?.length){
   const p=active[0];
   if(p.status==='open' && p.checkout_url && p.expires_at && new Date(p.expires_at)>now)
     return json({checkout_url:p.checkout_url,payment_request_id:p.id,amount_cents:p.amount_cents,existing:true},200,allowedOrigin);
   if(p.status==='creating' && now.getTime()-new Date(p.created_at).getTime()<10*60*1000)
     return json({error:'A checkout is already being prepared. Try again shortly.'},409,allowedOrigin);
   // Expired hosted sessions can no longer collect payment; release the active slot.
   const {error:expireError}=await supabase.from('payment_requests').update({status:p.status==='creating'?'failed':'expired'}).eq('id',p.id).eq('status',p.status);
   if(expireError)return json({error:'Unable to clear previous checkout'},500,allowedOrigin);
 }
 const {data:reservation,error:reserveError}=await supabase.from('payment_requests')
   .insert({job_id:job.id,amount_cents:outstanding,currency:'usd',status:'creating',created_by:userData.user.id})
   .select('id').single();
 if(reserveError)return json({error:'Another checkout may already exist for this job. Refresh and retry.'},409,allowedOrigin);
 const stripe=new Stripe(secret);
 try{
   const customer=Array.isArray(job.customers)?job.customers[0]:job.customers;
   const description=String(job.service_description||'Detailing or window cleaning service').slice(0,150);
   const session=await stripe.checkout.sessions.create({
     mode:'payment',
     payment_method_types:['card'],
     customer_email:customer?.email||undefined,
     line_items:[{price_data:{currency:'usd',unit_amount:outstanding,product_data:{
       name:"Cole's Auto Detailing — "+description,
     }},quantity:1}],
     client_reference_id:job.id,
     metadata:{payment_request_id:reservation.id,job_id:job.id},
     payment_intent_data:{metadata:{payment_request_id:reservation.id,job_id:job.id}},
     success_url:base+'/payment-success.html?session_id={CHECKOUT_SESSION_ID}',
     cancel_url:base+'/payment-cancelled.html',
     expires_at:Math.floor(Date.now()/1000)+(23*60*60),
   },{idempotencyKey:'coles-checkout-'+reservation.id});
   if(!session.url)throw new Error('Stripe did not provide a hosted checkout URL.');
   const {error:saveError}=await supabase.from('payment_requests')
     .update({status:'open',stripe_session_id:session.id,checkout_url:session.url,
       expires_at:new Date(session.expires_at*1000).toISOString()})
     .eq('id',reservation.id).eq('status','creating');
   if(saveError){
     // Do not return an untracked link.
     try{await stripe.checkout.sessions.expire(session.id)}catch{/* no link was shared */}
     throw new Error('Could not save the Stripe checkout.');
   }
   return json({checkout_url:session.url,payment_request_id:reservation.id,
     amount_cents:outstanding,existing:false},200,allowedOrigin);
 }catch(e){
   console.error('Stripe checkout error:',e instanceof Error?e.message:String(e));
   await supabase.from('payment_requests').update({status:'failed'}).eq('id',reservation.id).eq('status','creating');
   return json({error:'Could not create checkout. Check Stripe setup and try again.'},502,allowedOrigin);
 }
});
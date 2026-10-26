// Supabase Edge Function: stripe-webhook
// IMPORTANT: verify_jwt=false, but Stripe-Signature MUST validate using the raw request.
import Stripe from 'npm:stripe@^22';
import { createClient } from 'npm:@supabase/supabase-js@^2';

Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const stripeSecret=Deno.env.get('STRIPE_SECRET_KEY');
 const signingSecret=Deno.env.get('STRIPE_WEBHOOK_SECRET');
 const supabaseUrl=Deno.env.get('SUPABASE_URL');
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!stripeSecret||!signingSecret||!supabaseUrl||!serviceKey)
   return new Response('Stripe webhook is not configured',{status:503});
 const signature=req.headers.get('stripe-signature');
 if(!signature)return new Response('Missing Stripe signature',{status:400});
 const stripe=new Stripe(stripeSecret);
 const cryptoProvider=Stripe.createSubtleCryptoProvider();
 let event:Stripe.Event;
 try{
   // Stripe signatures require the exact raw body, NOT JSON.stringify(await req.json()).
   const rawBody=await req.text();
   event=await stripe.webhooks.constructEventAsync(rawBody,signature,signingSecret,undefined,cryptoProvider);
 }catch(err){
   console.error('Rejected Stripe signature:',err instanceof Error?err.message:'invalid');
   return new Response('Invalid Stripe signature',{status:400});
 }
 const db=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
   if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
     const session=event.data.object as Stripe.Checkout.Session;
     if(session.mode!=='payment'||session.payment_status!=='paid')
       return Response.json({received:true,deferred:true});
     const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
     if(!intent||typeof session.amount_total!=='number'||session.currency!=='usd')
       throw new Error('Paid checkout has missing settlement fields.');
     const {error}=await db.rpc('record_stripe_checkout',{
       p_session_id:session.id,p_intent_id:intent,p_amount_cents:session.amount_total,p_currency:session.currency
     });
     if(error)throw new Error('Settlement database error: '+error.message);
   }else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
     const session=event.data.object as Stripe.Checkout.Session;
     const {error}=await db.from('payment_requests')
       .update({status:event.type==='checkout.session.expired'?'expired':'failed'})
       .eq('stripe_session_id',session.id).eq('status','open');
     if(error)throw new Error('Checkout state database error: '+error.message);
   }else if(event.type==='charge.refunded'){
     const charge=event.data.object as Stripe.Charge;
     const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
     if(!intent)throw new Error('Refund is missing payment intent');
     const {error}=await db.rpc('record_stripe_refund',{
       p_intent_id:intent,p_total_refunded_cents:charge.amount_refunded
     });
     if(error)throw new Error('Refund database error: '+error.message);
   }
   // Unhandled event types are acknowledged to avoid unnecessary Stripe retries.
   return Response.json({received:true});
 }catch(err){
   // Do not acknowledge a failed settlement: Stripe retries non-2xx webhooks.
   console.error('Stripe webhook processing failed:',event.id,event.type,err instanceof Error?err.message:'unknown');
   return new Response('Temporary webhook processing failure',{status:500});
 }
});
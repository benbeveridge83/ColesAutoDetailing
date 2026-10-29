import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {supabaseUrl,supabasePublishableKey} from './supabase-config.js';
import {optimizePhoto,displayBytes} from './photo-tools.js';
import {initCalendar} from './calendar.js?v=optional-calendar-20261027';
import {initMessaging} from './messaging.js';
const db=createClient(supabaseUrl,supabasePublishableKey);
const $=id=>document.getElementById(id);
let services=[],customers=[],jobs=[],calendarEvents=[],leads=[],photos=[],paymentRequests=[],settings=null,staff=false,pendingCommand=null;
let calendar,messaging;
const say=message=>{$('status').textContent=message};
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
function el(tag,txt,cls){const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e;}
function listRow(parent,title,details,actions=[]){
 const r=el('div',null,'item');r.append(el('strong',title),el('small',details));
 for(const [label,handler,style] of actions){const b=el('button',label,style||'secondary');b.type='button';b.onclick=handler;r.append(b);}
 parent.append(r);
}
function opts(select,items,placeholder='Choose…'){select.replaceChildren();const p=el('option',placeholder);p.value='';select.append(p);for(const item of items){const o=el('option',item.title??item.name);o.value=item.id;select.append(o)}}
function showTab(tab){document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('hidden',x.dataset.panel!==tab))}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

async function authorized(){
 const {data:{user}}=await db.auth.getUser();
 if(!user)return false;
 const {data,error}=await db.from('staff_users').select('user_id').eq('user_id',user.id).maybeSingle();
 if(error)console.error('Staff verification:',error.code);
 return Boolean(data);
}
async function refreshSession(){
 staff=await authorized();$('login').classList.toggle('hidden',staff);$('office').classList.toggle('hidden',!staff);$('signout').style.display=staff?'inline-block':'none';
 if(staff)await refreshAll();
}
$('loginForm').onsubmit=async ev=>{
 ev.preventDefault();
 const email=ev.target.elements.email.value,password=ev.target.elements.password.value;
 const {error}=await db.auth.signInWithPassword({email,password});
 ev.target.elements.password.value='';
 if(error){alert('Sign-in failed: '+error.message);return}
 await refreshSession();
 if(!staff){await db.auth.signOut();alert('This user is not authorized to manage the business. Ask the administrator to add it to staff_users.')}
};
$('refreshRequests').onclick=()=>refreshAll().catch(()=>say('Could not refresh submissions. Please try again.'));
$('forgotPassword').onclick=async()=>{
 const email=String($('loginForm').elements.email.value||'').trim();
 const status=$('recoveryStatus');
 if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
   status.textContent="Enter the email address for your account above, then click Forgot password.";
   $('loginForm').elements.email.focus();
   return;
 }
 $('forgotPassword').disabled=true;
 status.textContent='Requesting a reset email…';
 try{
   const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:'https://colesautodetailingtexas.com/reset-password.html'});
   status.textContent=error?'Could not request reset: '+error.message:
     'If this email belongs to a login, a password-reset email has been requested. Check Inbox and Spam.';
 }catch(err){console.error(err);status.textContent='Could not request a reset. Please try again later.';}
 finally{$('forgotPassword').disabled=false;}
};
$('signout').onclick=async()=>{await db.auth.signOut();staff=false;await refreshSession()};
async function refreshAll(){
 if(!staff)return;
 const [l,c,j,s,p,b,q,v]=await Promise.all([
 db.from('leads').select('*').order('created_at',{ascending:false}).limit(200),
 db.from('customers').select('*').order('created_at',{ascending:false}).limit(300),
 db.from('jobs').select('*').order('created_at',{ascending:false}).limit(300),
 db.from('services').select('*').order('sort_order').limit(100),
 db.from('gallery').select('*').order('sort_order').limit(100),
 db.from('business_settings').select('*').eq('id',true).maybeSingle(),
 db.from('payment_requests').select('*').order('created_at',{ascending:false}).limit(300),
 db.from('calendar_events').select('*').order('event_date',{ascending:true}).limit(1000),
 ]);
 if(l.error){$('requestList').textContent='Could not load submissions. Use Refresh submissions to try again.';}else{leads=l.data||[];$('newLeads').textContent=leads.filter(x=>x.status==='new').length;renderSubmissions();}
 for(const x of [l,c,j,s,p,b,q,v])if(x.error){say('Some data could not load: '+x.error.message);console.error(x.error.code);return;}
 [leads,customers,jobs,services,photos,settings,paymentRequests,calendarEvents]=[l.data,c.data,j.data,s.data,p.data,b.data,q.data,v.data];
 $('newLeads').textContent=leads.filter(x=>x.status==='new').length;
 $('openJobs').textContent=jobs.filter(x=>!['completed','paid','cancelled'].includes(x.status)).length;
 $('totalPaid').textContent=money(jobs.reduce((sum,x)=>sum+Number(x.amount_paid||0)+Number(x.stripe_paid_cents||0)/100,0));
 opts($('jobCustomer'),customers);
 opts($('jobService'),services,'Custom service');
 renderSubmissions();

 const jobsEl=$('jobList');jobsEl.replaceChildren();
 if(!jobs.length)jobsEl.append(el('p','No jobs yet. Add one above to create a custom payment request.'));
 for(const j of jobs){
   const customer=customers.find(x=>x.id===j.customer_id);
   const paid=Number(j.amount_paid||0)+Number(j.stripe_paid_cents||0)/100;
   const outstanding=Math.max(0,Number(j.price||0)-paid);
   const actions=[
     ['Mark completed',()=>update('jobs',j.id,{status:'completed'}),'secondary'],
     ['Edit quote',()=>editJobPrice(j),'secondary'],
     ['Record cash / offline',()=>editJob(j),'secondary'],
     ...(customer?[['Send Text',()=>messaging?.openForJob(j),'secondary']]:[]),
    ['Calendar',()=>{showTab('calendar');calendar?.editJob(j);},'secondary'],
   ];
   if(customer&&j.price!==null&&outstanding>=0.50&&j.status!=='cancelled')
     actions.push(['Create Stripe link',()=>createStripeCheckout(j),'secondary']);
   if(j.price!==null&&paid>=Number(j.price)&&j.status!=='paid')
     actions.push(['Mark paid (offline)',()=>update('jobs',j.id,{status:'paid'}),'secondary']);
   listRow(jobsEl,(customer?.name||'No customer')+' — '+(j.service_description||services.find(x=>x.id===j.service_id)?.title||'Job'),
    'Status: '+j.status+' · Quote: '+(j.price==null?'Not set':money(j.price))+
    ' · Offline: '+money(j.amount_paid)+' · Stripe: '+money(Number(j.stripe_paid_cents||0)/100)+
    ' · Unpaid: '+(j.price==null?'Quote needed':money(outstanding))+
    ' · '+(j.scheduled_for?new Date(j.scheduled_for).toLocaleString():j.calendar_date?'All day '+j.calendar_date:'Unscheduled')+
    (j.recurring_interval_days?' · every '+j.recurring_interval_days+' days':''),
    actions);
 }
 const paymentsEl=$('paymentHistory');paymentsEl.replaceChildren();
 if(!paymentRequests.length)paymentsEl.append(el('p','No Stripe checkouts created yet.'));
 for(const payment of paymentRequests){
   const j=jobs.find(x=>x.id===payment.job_id);
   const c=customers.find(x=>x.id===j?.customer_id);
   const status=(payment.status==='open' && payment.expires_at && new Date(payment.expires_at)<new Date())
     ? 'expired (awaiting update)' :payment.status;
   const actions=[];
   if(payment.status==='open' && payment.checkout_url && (!payment.expires_at||new Date(payment.expires_at)>new Date())){
     actions.push(['Copy link',()=>copyLink(payment.checkout_url),'secondary']);
     if(j)actions.push(['Text link',()=>messaging?.openForJob(j,['payment']),'secondary']);
     actions.push(['Email link',()=>emailPaymentLink(c,payment.checkout_url,payment.amount_cents),'secondary']);
   }
   listRow(paymentsEl,(c?.name||'Customer')+' · '+money(payment.amount_cents/100),
      status+' · Created '+new Date(payment.created_at).toLocaleString()+
      (payment.paid_at?' · Paid '+new Date(payment.paid_at).toLocaleString():'')+
      (Number(payment.refunded_cents)>0?' · Refunded '+money(payment.refunded_cents/100):''),
      actions);
 }
 const customerEl=$('customerList');customerEl.replaceChildren();
 for(const c of customers)listRow(customerEl,c.name,
   (c.phone||'')+' · '+(c.email||'')+' · '+(c.address||'')+
   ' · Service texts: '+(c.sms_opt_out_at?'STOP':c.sms_service_opt_in_at?'Allowed':'No consent')+
   ' · Review invitations: '+(c.sms_opt_out_at?'STOP':c.sms_review_opt_in_at?'Allowed':'No consent'),
   [['Edit',()=>editCustomer(c),'secondary'],['Text preferences',()=>messaging?.openConsent(c),'secondary']]);
 const serviceEl=$('serviceList');serviceEl.replaceChildren();
 for(const s of services)listRow(serviceEl,s.title,s.description+' · '+(s.price_from==null?'Custom quote':'From '+money(s.price_from))+' · '+(s.visible?'Published':'Hidden'),
 [['Edit',()=>editService(s),'secondary'],[s.visible?'Hide':'Publish',()=>update('services',s.id,{visible:!s.visible}),'secondary']]);
 const photoEl=$('photoList');photoEl.replaceChildren();
 for(const photo of photos){const url=db.storage.from('coles-gallery').getPublicUrl(photo.image_path).data.publicUrl;const row=el('div',null,'item'),img=el('img');img.src=url;img.alt=photo.caption||'Detailing photograph';img.className='thumbnail';row.append(img,el('strong',photo.caption||'Photo'));const b=el('button',photo.visible?'Hide photo':'Publish photo','secondary');b.onclick=()=>update('gallery',photo.id,{visible:!photo.visible});row.append(b);photoEl.append(row);}
 if(settings){const f=$('settingsForm');for(const [k,v] of Object.entries(settings)){if(f.elements[k])f.elements[k].value=v??'';}}
 calendar?.render();
 messaging?.refresh();
}
function renderSubmissions(){
 const req=$('requestList');req.replaceChildren();
 $('requestSummary').textContent=leads.length+' submission'+(leads.length===1?'':'s')+' shown'+(leads.length===200?' (latest 200)':'')+'.';
 if(!leads.length){req.append(el('p','No form submissions yet. New inquiries will appear here.'));return;}
 for(const lead of leads){
  const row=el('article',null,'item');
  row.append(el('strong',lead.name+' · '+lead.service_text));
  const meta=el('p',null,'submission-meta');
  const submitted=new Date(lead.created_at).toLocaleString('en-US',{timeZone:'America/Chicago'});
  meta.append(el('span','Submitted: '+submitted+' (Central) · Status: '+lead.status),el('br'));
  const phone=el('a',lead.phone);phone.href='tel:'+lead.phone.replace(/[^+\d]/g,'');meta.append(phone);
  if(lead.email){const email=el('a',lead.email);email.href='mailto:'+encodeURIComponent(lead.email);meta.append(document.createTextNode(' · '),email);}
  meta.append(el('br'),el('span','Preferred date: '+(lead.preferred_date||'Flexible')),
    el('br'),el('span','Service text permission: '+(lead.sms_service_opt_in?'Yes':'Not recorded')+
    ' · Review invitation permission: '+(lead.sms_review_opt_in?'Yes':'Not recorded')));
  row.append(meta,el('p',lead.details||'No additional message.','submission-message'));
  for(const [label,handler] of [
   ['Mark contacted',()=>update('leads',lead.id,{status:'contacted'})],
   ['Mark quoted',()=>update('leads',lead.id,{status:'quoted'})],
   ['Create customer',async()=>{
     const consent=lead.sms_service_opt_in||lead.sms_review_opt_in;
     const record={
       name:lead.name,phone:lead.phone,email:lead.email,
       sms_service_opt_in_at:lead.sms_service_opt_in?lead.created_at:null,
       sms_review_opt_in_at:lead.sms_review_opt_in?lead.created_at:null,
       sms_consent_note:consent?'Website inquiry checkbox submitted on '+new Date(lead.created_at).toLocaleString('en-US',{timeZone:'America/Chicago'}):null
     };
     if(await insert('customers',record))showTab('customers');
   }],
  ]){const button=el('button',label,'secondary');button.type='button';button.onclick=handler;row.append(button);}
  const delivery=el('p','Email and text alerts: checking status…','muted');delivery.id='alerts-'+lead.id;row.append(delivery);
  req.append(row);
 }
 loadAlertStatus().catch(()=>{});
}
async function loadAlertStatus(){
 const {data,error}=await db.from('lead_notifications').select('lead_id,channel,status').in('lead_id',leads.map(x=>x.id));
 const labels={pending:'queued (service setup may be pending)',processing:'sending',accepted:'accepted by provider',failed:'not sent — needs attention',unknown:'delivery uncertain — check provider'};
 for(const lead of leads){const target=$('alerts-'+lead.id);if(!target)continue;
  if(error){target.textContent='Alert status unavailable. The submission is saved.';continue;}
  const rows=(data||[]).filter(x=>x.lead_id===lead.id);
  target.textContent=rows.length?rows.map(x=>(x.channel==='email'?'Email':'Text')+': '+(labels[x.status]||x.status)).join(' · '):'Email/text alerts are not queued for this older submission.';
 }
}
async function insert(table,payload){
 const {error}=await db.from(table).insert(payload);
 if(error){say('Could not save: '+error.message);return false}
 say('Saved successfully.');await refreshAll();return true;
}
async function update(table,id,payload){const {error}=await db.from(table).update(payload).eq('id',id);if(error){say('Could not update: '+error.message);return false}say('Updated.');await refreshAll();return true;}
const fields=form=>Object.fromEntries(new FormData(form));
$('customerForm').onsubmit=async e=>{
  e.preventDefault();
  const d=fields(e.target);
  const service=Boolean(d.sms_service_opt_in),review=Boolean(d.sms_review_opt_in);
  const note=String(d.sms_consent_note||'').trim();
  if((service||review)&&!note){say('Record how the customer explicitly consented to receive text messages.');return;}
  const time=new Date().toISOString();
  const payload={
    name:d.name.trim(),phone:d.phone||null,email:d.email||null,
    address:d.address||null,notes:d.notes||null,
    sms_service_opt_in_at:service?time:null,
    sms_review_opt_in_at:review?time:null,
    sms_consent_note:note||null
  };
  if(await insert('customers',payload))e.target.reset();
};
$('jobForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);if(!d.customer_id){say('Select a customer first.');return}
 const payload={customer_id:d.customer_id,service_id:d.service_id||null,service_description:d.service_description||null,scheduled_for:d.scheduled_for?new Date(d.scheduled_for).toISOString():null,price:d.price||null,amount_paid:d.amount_paid||0,payment_method:d.payment_method||null,recurring_interval_days:d.recurring_interval_days||null,status:d.status};
 if(await insert('jobs',payload))e.target.reset();
};
$('serviceForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);if(await insert('services',{title:d.title.trim(),description:d.description||'',price_from:d.price_from||null,sort_order:services.length*10+10}))e.target.reset()};

let optimizedPhoto=null,previewPhotoUrl=null,photoBusy=false;
const photoSettings=()=>({
  aspect:$('photoCrop').value,
  offsetX:Number($('photoCropX').value)/100,
  offsetY:Number($('photoCropY').value)/100,
  maxDimension:Number($('photoDimension').value)
});
function invalidatePhoto(){
  optimizedPhoto=null;
  if(previewPhotoUrl){URL.revokeObjectURL(previewPhotoUrl);previewPhotoUrl=null;}
  $('photoEditorPreview').hidden=true;
  $('photoPreviewImage').removeAttribute('src');
  $('photoOptimizedInfo').textContent='';
}
for(const id of ['photoFile','photoCrop','photoCropX','photoCropY','photoDimension']){
  $(id).addEventListener(id==='photoFile'?'change':'input',()=>{
    if(!photoBusy)invalidatePhoto();
  });
}
async function preparePhoto(){
  if(photoBusy)return null;
  const file=$('photoFile').files[0];
  if(!file){$('photoStatus').textContent='Choose a photo first.';return null;}
  const options=photoSettings();
  const signature=[file.name,file.size,file.lastModified,JSON.stringify(options)].join('|');
  if(optimizedPhoto?.signature===signature)return optimizedPhoto.result;
  photoBusy=true;
  $('photoPreviewBtn').disabled=true;
  $('photoUploadBtn').disabled=true;
  $('photoStatus').textContent='Optimizing photo on your device…';
  try{
    const result=await optimizePhoto(file,options);
    invalidatePhoto();
    previewPhotoUrl=URL.createObjectURL(result.file);
    $('photoPreviewImage').src=previewPhotoUrl;
    $('photoEditorPreview').hidden=false;
    $('photoOptimizedInfo').textContent='Original: '+displayBytes(result.originalBytes)+
      ' → optimized: '+displayBytes(result.optimizedBytes)+
      ' ('+result.width+' × '+result.height+' pixels). Location/EXIF metadata removed.';
    $('photoStatus').textContent='Photo is ready to publish.';
    optimizedPhoto={signature,result};
    return result;
  }catch(error){
    $('photoStatus').textContent=error?.message||'Could not process this photo. Please try another image.';
    return null;
  }finally{
    photoBusy=false;
    $('photoPreviewBtn').disabled=false;
    $('photoUploadBtn').disabled=false;
  }
}
$('photoPreviewBtn').onclick=()=>{void preparePhoto()};
$('photoForm').onsubmit=async event=>{
  event.preventDefault();
  const optimized=await preparePhoto();
  if(!optimized||photoBusy)return;
  photoBusy=true;
  $('photoUploadBtn').disabled=true;
  $('photoPreviewBtn').disabled=true;
  const path=crypto.randomUUID()+'.jpg';
  try{
    $('photoStatus').textContent='Uploading '+displayBytes(optimized.optimizedBytes)+' to the website…';
    const {error}=await db.storage.from('coles-gallery').upload(path,optimized.file,{
      contentType:'image/jpeg',upsert:false,cacheControl:'3600'
    });
    if(error)throw new Error('Upload failed: '+error.message);
    const {error:rowError}=await db.from('gallery').insert({
      image_path:path,caption:String(event.target.elements.caption.value||'').slice(0,200),
      sort_order:photos.length*10+10
    });
    if(rowError){
      // Try not to leave orphaned images on failure.
      await db.storage.from('coles-gallery').remove([path]);
      throw new Error('Could not add the photo to your gallery: '+rowError.message);
    }
    event.target.reset();
    invalidatePhoto();
    await refreshAll();
    $('photoStatus').textContent='Photo uploaded and published! It will appear on the website gallery.';
    say('Photo added successfully.');
  }catch(error){
    $('photoStatus').textContent=error?.message||'Upload failed. Please try again.';
  }finally{
    photoBusy=false;
    $('photoUploadBtn').disabled=false;
    $('photoPreviewBtn').disabled=false;
  }
};
$('settingsForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);
 const u={business_name:d.business_name,tagline:d.tagline,phone:d.phone,service_area:d.service_area,google_review_url:d.google_review_url||null,google_place_id:d.google_place_id||null,google_maps_browser_key:d.google_maps_browser_key||null,updated_at:new Date().toISOString()};
 const {error}=await db.from('business_settings').update(u).eq('id',true);if(error){say('Settings not saved: '+error.message);return;}say('Website settings saved.');await refreshAll();
};
function editCustomer(c){const name=prompt('Customer name',c.name);if(name===null||!name.trim())return;const phone=prompt('Phone',c.phone||'');if(phone===null)return;update('customers',c.id,{name:name.trim(),phone:phone||null});}
function editService(s){const title=prompt('Service name',s.title);if(title===null||!title.trim())return;const description=prompt('Description',s.description);if(description===null)return;const price=prompt('Starting price in dollars (blank for quote)',s.price_from??'');if(price===null)return;const numeric=price===''?null:Number(price);if(numeric!==null&&(!Number.isFinite(numeric)||numeric<0))return alert('Invalid price.');update('services',s.id,{title:title.trim(),description,price_from:numeric});}
function editJob(j){
 const amount=prompt('Total amount paid so far ($)',j.amount_paid??'0');if(amount===null)return;
 const val=Number(amount);if(!Number.isFinite(val)||val<0)return alert('Invalid payment.');
 const method=prompt('How was the payment made? (Cash, Card, Other)',j.payment_method||'');if(method===null)return;
 update('jobs',j.id,{amount_paid:val,payment_method:method||null});
}

function editJobPrice(j){
 const value=prompt('Custom job price ($). Existing Stripe links must expire before changing this.',j.price??'');
 if(value===null)return;
 const dollars=Number(value);
 if(value.trim()===''||!Number.isFinite(dollars)||dollars<0||Math.round(dollars*100)!==dollars*100 && Math.abs(Math.round(dollars*100)-dollars*100)>1e-8)
   return alert('Enter a valid dollar amount with up to two decimal places.');
 update('jobs',j.id,{price:dollars});
}
async function createStripeCheckout(j){
 if(!confirm('Create a Stripe checkout for the unpaid balance of this job? The customer must receive the link before payment can happen.'))return;
 say('Creating a secure Stripe checkout…');
 const {data,error}=await db.functions.invoke('stripe-create-checkout',{body:{job_id:j.id}});
 if(error){
   let message='Stripe is not fully connected yet. Please check the payment setup.';
   try{const detail=await error.context?.json?.();if(detail?.error)message=detail.error}catch{}
   say(message);return;
 }
 if(!data?.checkout_url){say('Stripe did not return a payment link.');return;}
 await refreshAll();
 say((data.existing?'Existing':'New')+' Stripe link ready for '+money(data.amount_cents/100)+'. Choose Copy, Text, or Email under Stripe checkout history.');
}
async function copyLink(link){
 try{await navigator.clipboard.writeText(link);say('Payment link copied.')}catch{prompt('Copy this secure Stripe link:',link)}
}
function textPaymentLink(c,link,cents){
 const message="Cole's Auto Detailing: your payment of "+money(cents/100)+" is ready. Pay securely here: "+link;
 const number=(c?.phone||'').replace(/[^+\d]/g,'');
 window.location.href='sms:'+number+'?body='+encodeURIComponent(message);
 say('A text message draft opened. Please press Send in your messaging app.');
}
function emailPaymentLink(c,link,cents){
 const subject="Cole's Auto Detailing — Payment for your service";
 const body="Hello "+(c?.name||'')+",\n\nThank you for choosing Cole's Auto Detailing. Your payment of "+money(cents/100)+" is ready.\n\nPay securely with Stripe: "+link+"\n\nThank you!";
 window.location.href='mailto:'+encodeURIComponent(c?.email||'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 say('An email draft opened. Please send it from your email app.');
}
let aiPending=null;
const aiHistory=[];
const aiChat=$('aiChat');
function addAiMessage(role,content){const p=el('div',content,'ai-bubble ai-'+role);aiChat.append(p);aiChat.scrollTop=aiChat.scrollHeight;}
function describeAiAction(a){
 if(a.type==='update_setting')return 'Change website setting '+a.field+' to: '+a.value;
 if(a.type==='update_copy')return 'Update homepage '+a.key+' to: '+a.value;
 if(a.type==='update_theme')return 'Set website '+a.key+' color to '+a.value;
 if(a.type==='add_service')return 'Add service: '+a.title+' — '+(a.description||'')+' (starting price: '+(a.price_from==null?'custom quote':money(a.price_from))+')';
 if(a.type==='update_service')return 'Update service '+(services.find(s=>s.id===a.id)?.title||a.id)+': '+JSON.stringify(a.changes);
 if(a.type==='update_gallery')return 'Update photo: '+JSON.stringify(a.changes);
 return 'Unknown change';
}
async function applyAiAction(a){
 let table=null,query=null;
 if(a.type==='update_setting'){
  if(!['business_name','tagline','phone','service_area','google_review_url'].includes(a.field)||typeof a.value!=='string')throw Error('Invalid website setting.');
  table='business_settings';query=db.from(table).update({[a.field]:a.value,updated_at:new Date().toISOString()}).eq('id',true).select('id');
 }else if(a.type==='update_copy'){
  if(!['hero_eyebrow','hero_intro','services_title','gallery_title','payments_title','reviews_title','contact_title','contact_intro'].includes(a.key)||typeof a.value!=='string'||a.value.length<1||a.value.length>1500)throw Error('Invalid homepage text.');
  table='site_copy';query=db.from(table).update({content:a.value,updated_at:new Date().toISOString()}).eq('copy_key',a.key).select('copy_key');
 }else if(a.type==='update_theme'){
  if(!['accent','background','foreground'].includes(a.key)||!/^#[0-9a-f]{6}$/i.test(a.value))throw Error('Invalid website color.');
  table='site_theme';query=db.from(table).update({value:a.value,updated_at:new Date().toISOString()}).eq('theme_key',a.key).select('theme_key');
 }else if(a.type==='add_service'){
  if(typeof a.title!=='string'||a.title.trim().length<2||a.title.length>100)throw Error('Invalid service title.');
  const price=a.price_from==null?null:Number(a.price_from);
  if(price!==null&&(!Number.isFinite(price)||price<0))throw Error('Invalid service price.');
  table='services';query=db.from(table).insert({title:a.title.trim(),description:String(a.description||'').slice(0,1000),price_from:price,sort_order:services.length*10+10}).select('id');
 }else if(a.type==='update_service'){
  const s=services.find(s=>s.id===a.id);if(!s)throw Error('Service not found.');
  const changes={};for(const field of ['title','description','price_from','visible'])if(Object.hasOwn(a.changes||{},field))changes[field]=a.changes[field];
  if(!Object.keys(changes).length)throw Error('No changes to apply.');
  if(changes.title!==undefined&&(typeof changes.title!=='string'||changes.title.trim().length<2||changes.title.length>100))throw Error('Invalid service title.');
  if(changes.price_from!==undefined&&changes.price_from!==null&&(!Number.isFinite(Number(changes.price_from))||Number(changes.price_from)<0))throw Error('Invalid price.');
  table='services';query=db.from(table).update(changes).eq('id',a.id).select('id');
 }else if(a.type==='update_gallery'){
  if(!photos.some(p=>p.id===a.id))throw Error('Photo not found.');
  const changes={};for(const field of ['caption','visible'])if(Object.hasOwn(a.changes||{},field))changes[field]=a.changes[field];
  if(!Object.keys(changes).length)throw Error('No changes to apply.');
  table='gallery';query=db.from(table).update(changes).eq('id',a.id).select('id');
 }else throw Error('This action is not supported.');
 const {data,error}=await query;
 if(error)throw error;
 if(!data?.length)throw Error('No website record was changed. Please refresh and try again.');
}
$('aiChatForm').onsubmit=async e=>{
 e.preventDefault();
 const input=$('aiInput');const message=input.value.trim();
 if(!message||!staff)return;
 $('aiSend').disabled=true;$('aiStatus').textContent='Thinking…';
 aiPending=null;$('aiProposal').classList.add('hidden');
 addAiMessage('user',message);input.value='';
 try{
  const {data,error}=await db.functions.invoke('website-ai-assistant',{body:{message,history:aiHistory}});
  if(error)throw new Error(data?.error||'Could not contact the AI server. Check whether OpenAI API is configured.');
  if(data?.error)throw new Error(data.error);
  const reply=String(data?.reply||'Please try asking another way.');
  addAiMessage('assistant',reply);
  aiHistory.push({role:'user',content:message},{role:'assistant',content:reply});
  if(aiHistory.length>12)aiHistory.splice(0,aiHistory.length-12);
  if(data.action){aiPending=data.action;$('aiProposalText').textContent=describeAiAction(data.action);$('aiProposal').classList.remove('hidden');}
  $('aiStatus').textContent=data.action?'Review the change and choose Approve and publish.':'Ready.';
 }catch(err){addAiMessage('assistant',err.message);$('aiStatus').textContent='AI request failed.';}
 finally{$('aiSend').disabled=false;}
};
$('aiApprove').onclick=async()=>{
 if(!aiPending||!staff)return;
 const action=aiPending;aiPending=null;
 $('aiApprove').disabled=true;$('aiStatus').textContent='Publishing your approved change…';
 try{await applyAiAction(action);$('aiProposal').classList.add('hidden');addAiMessage('assistant','Published! Refresh the public website to see your change.');await refreshAll();$('aiStatus').textContent='Website updated.';}
 catch(err){addAiMessage('assistant','I could not publish that change: '+err.message);$('aiStatus').textContent='Change not published.';}
 finally{$('aiApprove').disabled=false;}
};
$('aiReject').onclick=()=>{aiPending=null;$('aiProposal').classList.add('hidden');$('aiStatus').textContent='Change canceled.';};
$('aiMic').onclick=()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('aiStatus').textContent='Speech-to-text is not supported by this browser. Try Chrome or type your request.';return;}
 const mic=$('aiMic'),recognition=new SR();recognition.lang='en-US';recognition.interimResults=false;
 recognition.onstart=()=>{mic.disabled=true;mic.textContent='Listening…';$('aiStatus').textContent='Speak your request now.';};
 recognition.onresult=e=>{$('aiInput').value=e.results[0][0].transcript;$('aiStatus').textContent='Voice captured. Review your words and tap Ask AI.';};
 recognition.onerror=e=>{$('aiStatus').textContent='Microphone error: '+e.error;};
 recognition.onend=()=>{mic.disabled=false;mic.textContent='🎙 Speak';};
 recognition.start();
};


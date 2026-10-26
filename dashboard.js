import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {supabaseUrl,supabasePublishableKey} from './supabase-config.js';
const db=createClient(supabaseUrl,supabasePublishableKey);
const $=id=>document.getElementById(id);
let services=[],customers=[],jobs=[],leads=[],photos=[],paymentRequests=[],settings=null,staff=false,pendingCommand=null;
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
$('signout').onclick=async()=>{await db.auth.signOut();staff=false;await refreshSession()};
async function refreshAll(){
 if(!staff)return;
 const [l,c,j,s,p,b,q]=await Promise.all([
 db.from('leads').select('*').order('created_at',{ascending:false}).limit(200),
 db.from('customers').select('*').order('created_at',{ascending:false}).limit(300),
 db.from('jobs').select('*').order('created_at',{ascending:false}).limit(300),
 db.from('services').select('*').order('sort_order').limit(100),
 db.from('gallery').select('*').order('sort_order').limit(100),
 db.from('business_settings').select('*').eq('id',true).maybeSingle(),
 db.from('payment_requests').select('*').order('created_at',{ascending:false}).limit(300),
 ]);
 for(const x of [l,c,j,s,p,b,q])if(x.error){say('Some data could not load: '+x.error.message);console.error(x.error.code);return;}
 [leads,customers,jobs,services,photos,settings,paymentRequests]=[l.data,c.data,j.data,s.data,p.data,b.data,q.data];
 $('newLeads').textContent=leads.filter(x=>x.status==='new').length;
 $('openJobs').textContent=jobs.filter(x=>!['completed','paid','cancelled'].includes(x.status)).length;
 $('totalPaid').textContent=money(jobs.reduce((sum,x)=>sum+Number(x.amount_paid||0)+Number(x.stripe_paid_cents||0)/100,0));
 opts($('jobCustomer'),customers);
 opts($('jobService'),services,'Custom service');
 const req=$('requestList');req.replaceChildren();
 if(!leads.length)req.textContent='No requests yet.';
 for(const l of leads)listRow(req,l.name+' · '+l.service_text,l.phone+' · '+(l.email||'No email')+' · '+(l.preferred_date||'Date flexible')+' · '+l.status+' · '+(l.details||'No details'),
 [['Mark contacted',()=>update('leads',l.id,{status:'contacted'}),'secondary'],
 ['Mark quoted',()=>update('leads',l.id,{status:'quoted'}),'secondary'],
 ['Create customer',async()=>{await insert('customers',{name:l.name,phone:l.phone,email:l.email});showTab('customers')},'secondary']]);

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
   ];
   if(j.price!==null&&outstanding>=0.50&&j.status!=='cancelled')
     actions.push(['Create Stripe link',()=>createStripeCheckout(j),'secondary']);
   if(j.price!==null&&paid>=Number(j.price)&&j.status!=='paid')
     actions.push(['Mark paid (offline)',()=>update('jobs',j.id,{status:'paid'}),'secondary']);
   listRow(jobsEl,(customer?.name||'Customer')+' — '+(j.service_description||services.find(x=>x.id===j.service_id)?.title||'Job'),
    'Status: '+j.status+' · Quote: '+(j.price==null?'Not set':money(j.price))+
    ' · Offline: '+money(j.amount_paid)+' · Stripe: '+money(Number(j.stripe_paid_cents||0)/100)+
    ' · Unpaid: '+(j.price==null?'Quote needed':money(outstanding))+
    ' · '+(j.scheduled_for?new Date(j.scheduled_for).toLocaleString():'Unscheduled')+
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
     actions.push(['Text link',()=>textPaymentLink(c,payment.checkout_url,payment.amount_cents),'secondary']);
     actions.push(['Email link',()=>emailPaymentLink(c,payment.checkout_url,payment.amount_cents),'secondary']);
   }
   listRow(paymentsEl,(c?.name||'Customer')+' · '+money(payment.amount_cents/100),
      status+' · Created '+new Date(payment.created_at).toLocaleString()+
      (payment.paid_at?' · Paid '+new Date(payment.paid_at).toLocaleString():'')+
      (Number(payment.refunded_cents)>0?' · Refunded '+money(payment.refunded_cents/100):''),
      actions);
 }
 const customerEl=$('customerList');customerEl.replaceChildren();
 for(const c of customers)listRow(customerEl,c.name,(c.phone||'')+' · '+(c.email||'')+' · '+(c.address||''),[['Edit',()=>editCustomer(c),'secondary']]);
 const serviceEl=$('serviceList');serviceEl.replaceChildren();
 for(const s of services)listRow(serviceEl,s.title,s.description+' · '+(s.price_from==null?'Custom quote':'From '+money(s.price_from))+' · '+(s.visible?'Published':'Hidden'),
 [['Edit',()=>editService(s),'secondary'],[s.visible?'Hide':'Publish',()=>update('services',s.id,{visible:!s.visible}),'secondary']]);
 const photoEl=$('photoList');photoEl.replaceChildren();
 for(const photo of photos){const url=db.storage.from('coles-gallery').getPublicUrl(photo.image_path).data.publicUrl;const row=el('div',null,'item'),img=el('img');img.src=url;img.alt=photo.caption||'Detailing photograph';img.className='thumbnail';row.append(img,el('strong',photo.caption||'Photo'));const b=el('button',photo.visible?'Hide photo':'Publish photo','secondary');b.onclick=()=>update('gallery',photo.id,{visible:!photo.visible});row.append(b);photoEl.append(row);}
 if(settings){const f=$('settingsForm');for(const [k,v] of Object.entries(settings)){if(f.elements[k])f.elements[k].value=v??'';}}
}
async function insert(table,payload){
 const {error}=await db.from(table).insert(payload);
 if(error){say('Could not save: '+error.message);return false}
 say('Saved successfully.');await refreshAll();return true;
}
async function update(table,id,payload){const {error}=await db.from(table).update(payload).eq('id',id);if(error){say('Could not update: '+error.message);return false}say('Updated.');await refreshAll();return true;}
const fields=form=>Object.fromEntries(new FormData(form));
$('customerForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);if(await insert('customers',{name:d.name.trim(),phone:d.phone||null,email:d.email||null,address:d.address||null,notes:d.notes||null}))e.target.reset()};
$('jobForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);if(!d.customer_id){say('Select a customer first.');return}
 const payload={customer_id:d.customer_id,service_id:d.service_id||null,service_description:d.service_description||null,scheduled_for:d.scheduled_for?new Date(d.scheduled_for).toISOString():null,price:d.price||null,amount_paid:d.amount_paid||0,payment_method:d.payment_method||null,recurring_interval_days:d.recurring_interval_days||null,status:d.status};
 if(await insert('jobs',payload))e.target.reset();
};
$('serviceForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);if(await insert('services',{title:d.title.trim(),description:d.description||'',price_from:d.price_from||null,sort_order:services.length*10+10}))e.target.reset()};
$('photoForm').onsubmit=async e=>{e.preventDefault();const file=e.target.elements.photo.files[0];if(!file)return;
 if(file.size>5242880||!['image/png','image/jpeg','image/webp'].includes(file.type)){say('Please upload a JPG, PNG, or WebP under 5 MB.');return;}
 const path=crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
 say('Uploading photo…');const {error}=await db.storage.from('coles-gallery').upload(path,file,{contentType:file.type,upsert:false});
 if(error){say('Upload failed: '+error.message);return;}
 const ok=await insert('gallery',{image_path:path,caption:e.target.elements.caption.value,sort_order:photos.length*10+10});
 if(ok)e.target.reset();
};
$('settingsForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);
 const u={business_name:d.business_name,tagline:d.tagline,phone:d.phone,service_area:d.service_area,google_review_url:d.google_review_url||null,payment_url:d.payment_url||null,updated_at:new Date().toISOString()};
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
function proposeCommand(text){
 let m;
 if((m=/^add service\s+(.+)$/i.exec(text)))return {description:'Add a new service named “‘+m[1]+'” to the website.',run:()=>insert('services',{title:m[1].slice(0,100),description:'',sort_order:services.length*10+10})};
 if((m=/^change phone to\s+([+\d\s().-]{7,30})$/i.exec(text)))return {description:'Update the public website phone number to '+m[1]+'.',run:async()=>{const {error}=await db.from('business_settings').update({phone:m[1]}).eq('id',true);if(error){say(error.message);return;}say('Phone updated.');await refreshAll();}};
 if(/^show (requests|leads)$/i.test(text))return {description:'Open customer requests (no data changed).',run:async()=>showTab('requests')};
 return null;
}
$('interpret').onclick=()=>{const value=$('command').value.trim();pendingCommand=proposeCommand(value);const box=$('commandReview');box.classList.remove('hidden');if(pendingCommand){$('commandExplanation').textContent=pendingCommand.description;$('confirmCommand').disabled=false;}else{$('commandExplanation').textContent='I cannot safely interpret that request yet. Use the forms and tabs to edit jobs, pricing, and photos. Supported examples are shown above.';$('confirmCommand').disabled=true;}};
$('confirmCommand').onclick=async()=>{if(!pendingCommand)return;const action=pendingCommand;pendingCommand=null;$('commandReview').classList.add('hidden');await action.run();$('command').value='';};
$('cancelCommand').onclick=()=>{pendingCommand=null;$('commandReview').classList.add('hidden');};
$('mic').onclick=()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){say('Voice transcription is not supported in this browser. Please type your command.');return;}
 const recognition=new SR();recognition.lang='en-US';recognition.interimResults=false;recognition.onresult=e=>{$('command').value=e.results[0][0].transcript;say('Voice captured. Click Review command to confirm.')};recognition.onerror=e=>say('Microphone error: '+e.error);recognition.start();
};
db.auth.onAuthStateChange(()=>{setTimeout(()=>refreshSession().catch(e=>console.error(e)),0)});
refreshSession().catch(()=>{$('login').classList.remove('hidden');$('office').classList.add('hidden')});

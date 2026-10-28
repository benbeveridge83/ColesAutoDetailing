// Customer communication composer for Parker's dashboard.
// Opens local SMS drafts: no provider sends or delivers texts here.
// The private message_preparations table logs "copied" and "opened", never "sent".
export function initMessaging({db,getJobs,getCustomers,getPayments,getSettings,refreshAll,say}){
  const $=id=>document.getElementById(id);
  const dialog=$('smsComposerDialog'),consentDialog=$('customerConsentDialog');
  const types=['reminder','payment','review'];
  const inputs={reminder:$('smsIncludeReminder'),payment:$('smsIncludePayment'),review:$('smsIncludeReview')};
  const fmtAmount=amount=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(amount)||0);
  const fmtTime=date=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',
    weekday:'long',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
  let selectedJobId=null,selectedCustomerId=null,consentCustomerId=null;
  const current=()=>({
    job:getJobs().find(j=>j.id===selectedJobId),
    customer:getCustomers().find(c=>c.id===selectedCustomerId)
  });
  function latestPayLink(job){
    const now=Date.now();
    const p=getPayments().find(p=>p.job_id===job.id&&p.status==='open'&&p.checkout_url
      &&(!p.expires_at||Date.parse(p.expires_at)>now));
    return p||null;
  }
  function balance(job){return Math.max(0,Number(job.price||0)-Number(job.amount_paid||0)-Number(job.stripe_paid_cents||0)/100)}
  function hasConsent(c,type){
    return c&&!c.sms_opt_out_at&&(
      type==='review'?Boolean(c.sms_review_opt_in_at):Boolean(c.sms_service_opt_in_at));
  }
  function eligible(job,c,type){
    if(!job||!c||!c.phone||!hasConsent(c,type))return false;
    if(type==='reminder')return Boolean(job.scheduled_for)&&!['cancelled','completed','paid'].includes(job.status);
    if(type==='review')return ['completed','paid'].includes(job.status)&&Boolean(getSettings()?.google_review_url);
    if(type==='payment')return job.price!=null&&balance(job)>=.5
      &&Boolean(latestPayLink(job))&&job.status!=='cancelled';
    return false;
  }
  function getPhone(c){
    if(!c?.phone)return '';
    const digits=c.phone.replace(/\D/g,'');
    if(digits.length===10)return '+1'+digits;
    if(digits.length===11&&digits.startsWith('1'))return '+'+digits;
    return '';
  }
  function compose(job,c){
    const selected=types.filter(t=>inputs[t].checked);
    if(!selected.length)return '';
    const first=String(c.name||'there').trim().split(/\s+/)[0].slice(0,50);
    const business=String(getSettings()?.business_name||"Cole's Auto Detailing");
    const lines=['Hi '+first+', this is Parker with '+business+'.'];
    if(selected.includes('reminder')){
      lines.push('Reminder: your '+(job.service_description||'cleaning service')+' is scheduled for '+fmtTime(new Date(job.scheduled_for))+'. Please let me know if you need to reschedule.');
    }
    if(selected.includes('payment')){
      const p=latestPayLink(job);
      if(p)lines.push('Your remaining payment of '+fmtAmount(Number(p.amount_cents)/100)+' is ready. Secure checkout: '+p.checkout_url);
    }
    if(selected.includes('review')){
      lines.push('If you have a moment, we would appreciate your honest Google review: '+getSettings().google_review_url);
    }
    const note=String($('smsCustomNote').value||'').trim();
    if(note)lines.push(note);
    lines.push('Questions? Call (832) 877-5556. Reply STOP to opt out of future texts.');
    return lines.join('\n\n').slice(0,1800);
  }
  function updatePreview(){
    if(!dialog.open)return;
    const {job,customer}=current();
    const box=$('smsComposerGuidance');
    if(!job||!customer){box.textContent='Could not load customer or job. Refresh and retry.';return;}
    const explanations=[];
    const canText=Boolean(getPhone(customer));
    if(!canText)explanations.push('Add a valid US customer mobile phone number in Customers.');
    if(customer.sms_opt_out_at)explanations.push('Customer opted out. Do not send any texts until they provide new consent.');
    else{
      if(!customer.sms_service_opt_in_at)explanations.push('Service/payment texting permission is not recorded. Use Customers → Text preferences after the customer consents.');
      if(!customer.sms_review_opt_in_at)explanations.push('Review-invitation texting permission is not recorded.');
    }
    if(!getSettings()?.google_review_url)explanations.push('Google review link is not configured under Website settings.');
    if(job.price!=null&&balance(job)>=.5&&!latestPayLink(job))explanations.push('Generate the job-specific Stripe link first in Jobs to include a payment link.');
    if(job.price==null)explanations.push('The job has no quoted price yet.');
    for(const type of types){
      const active=eligible(job,customer,type)&&canText;
      inputs[type].disabled=!active;
      if(!active)inputs[type].checked=false;
    }
    const createButton=$('smsGeneratePaymentBtn');
    const needsPayment=job.price!=null&&balance(job)>=.5&&job.status!=='cancelled'&&!latestPayLink(job);
    createButton.hidden=!needsPayment;
    createButton.disabled=!hasConsent(customer,'payment')||!getPhone(customer);
    const message=compose(job,customer);
    $('smsMessagePreview').value=message||'Choose an available item above to prepare a message.';
    box.textContent=explanations.join(' ')||'The message is only a draft until Parker sends it from his texting app.';
    $('smsOpenDraft').disabled=!message;
    $('smsCopyText').disabled=!message;
  }
  function openForJob(job,preferred=[]){
    const c=getCustomers().find(x=>x.id===job?.customer_id);
    if(!job||!c){say('This job must have a saved customer before composing a text.');return;}
    selectedJobId=job.id;selectedCustomerId=c.id;
    $('smsComposerCustomer').textContent=c.name+' · '+(c.phone||'No phone')+' · '+(job.service_description||'Service');
    $('smsCustomNote').value='';
    for(const t of types)inputs[t].checked=false;
    dialog.showModal();
    const defaults=preferred.length?preferred:
      (['completed','paid'].includes(job.status)?['payment','review']:['reminder']);
    for(const t of defaults)if(inputs[t])inputs[t].checked=true;
    updatePreview();
  }
  async function recordDraft(action,message){
    const {job,customer}=current();
    const {error}=await db.from('message_preparations').insert({
      job_id:job.id,customer_id:customer.id,channel:'sms',
      components:types.filter(t=>inputs[t].checked),message_text:message,action
    });
    if(error)console.warn('Draft logging failed:',error.code);
  }
  async function act(action){
    const {job,customer}=current();
    if(!job||!customer)return;
    const included=types.filter(t=>inputs[t].checked);
    if(!included.length||!getPhone(customer)||included.some(t=>!eligible(job,customer,t))){
      say('Text not prepared: check contact number, consent and selected options.');
      updatePreview();return;
    }
    const message=compose(job,customer);
    if(!message)return;
    if(action==='copy'){
      try{await navigator.clipboard.writeText(message);
        await recordDraft('copy',message);
        say('Message copied. It has NOT been sent. Paste it into a text and press Send.');
      }catch{window.prompt('Copy this message manually:',message);}
    }else{
      await recordDraft('open_draft',message);
      dialog.close();
      const number=getPhone(customer);
      window.location.href='sms:'+number+'?body='+encodeURIComponent(message);
      say('Text draft opened for '+customer.name+'. Parker must press Send in the messaging app.');
    }
  }
  $('smsGeneratePaymentBtn').onclick=async()=>{
    const {job,customer}=current();
    if(!job||!customer||!hasConsent(customer,'payment'))return;
    const button=$('smsGeneratePaymentBtn');button.disabled=true;
    $('smsComposerGuidance').textContent='Generating the secure payment link…';
    try{
      const {data,error}=await db.functions.invoke('stripe-create-checkout',{body:{job_id:job.id}});
      if(error){
        let message='Stripe is not yet configured. Ask the administrator to complete Stripe setup.';
        try{const details=await error.context?.json?.();if(details?.error)message=details.error}catch{}
        $('smsComposerGuidance').textContent=message;
        return;
      }
      if(!data?.checkout_url)throw new Error('Stripe did not return a checkout link.');
      await refreshAll();
      inputs.payment.checked=true;
      updatePreview();
      say('Secure payment link ready and selected. Review the combined text, then open the texting app.');
    }catch(e){$('smsComposerGuidance').textContent=e?.message||'Could not create payment link.';}
    finally{button.disabled=false;}
  };
  $('smsClose').onclick=()=>dialog.close();
  $('smsCopyText').onclick=()=>{void act('copy')};
  $('smsOpenDraft').onclick=()=>{void act('open_draft')};
  for(const t of types)inputs[t].addEventListener('change',updatePreview);
  $('smsCustomNote').addEventListener('input',updatePreview);

  // A separate customer preferences dialog avoids interpreting saved numbers as consent.
  function openConsent(c){
    consentCustomerId=c.id;
    $('customerConsentName').textContent=c.name+' · '+(c.phone||'No phone recorded');
    const f=$('customerConsentForm');
    f.elements.service_opt_in.checked=Boolean(c.sms_service_opt_in_at)&&!c.sms_opt_out_at;
    f.elements.review_opt_in.checked=Boolean(c.sms_review_opt_in_at)&&!c.sms_opt_out_at;
    f.elements.opt_out.checked=Boolean(c.sms_opt_out_at);
    f.elements.consent_note.value=c.sms_consent_note||'';
    consentDialog.showModal();
  }
  $('customerConsentCancel').onclick=()=>consentDialog.close();
  $('customerConsentForm').onsubmit=async e=>{
    e.preventDefault();
    const c=getCustomers().find(x=>x.id===consentCustomerId);
    if(!c)return;
    const f=e.target,stop=f.elements.opt_out.checked;
    const service=!stop&&f.elements.service_opt_in.checked,review=!stop&&f.elements.review_opt_in.checked;
    const note=f.elements.consent_note.value.trim();
    if((service||review)&&!note){alert('Record how or where the customer gave permission for these texts.');return;}
    if((service&&!c.sms_service_opt_in_at)||(review&&!c.sms_review_opt_in_at)){
      if(!window.confirm('Confirm the customer explicitly agreed to these types of text messages. Consent cannot be assumed from a phone number alone.'))return;
    }
    const now=new Date().toISOString();
    const updates={
      sms_service_opt_in_at:service?(c.sms_opt_out_at?now:(c.sms_service_opt_in_at||now)):null,
      sms_review_opt_in_at:review?(c.sms_opt_out_at?now:(c.sms_review_opt_in_at||now)):null,
      sms_opt_out_at:stop?(c.sms_opt_out_at||now):null,
      sms_consent_note:note||null
    };
    const {error}=await db.from('customers').update(updates).eq('id',c.id);
    if(error){say('Could not save SMS permissions: '+error.message);return;}
    consentDialog.close();
    say('Customer messaging preferences updated.');
    await refreshAll();
  };
  function refresh(){if(dialog.open)updatePreview();}
  return {openForJob,openConsent,refresh};
}

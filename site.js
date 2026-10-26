import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseUrl, supabasePublishableKey } from './supabase-config.js';

const db = createClient(supabaseUrl, supabasePublishableKey);
const $ = (id) => document.getElementById(id);
const defaultServices = [
  { title:'Exterior car wash', description:'Make the driveway look better with a fresh, clean car.' },
  { title:'Interior & exterior clean', description:'Get the inside and outside looking and feeling cleaner.' },
  { title:'Residential window cleaning', description:'Bring more light into your home with cleaner windows.' },
];

function element(tag, className, text) {
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
}
function renderServices(services){
  const container=$('servicesList'), select=$('serviceSelect');
  if (!container || !select) return;
  const shown=services?.length ? services : defaultServices;
  container.replaceChildren();
  select.replaceChildren();
  for(const [i,service] of shown.entries()){
    const card=element('div','card');
    card.append(element('div','num',String(i+1).padStart(2,'0')+' / SERVICE'));
    card.append(element('h3','',service.title));
    card.append(element('p','',service.description+(service.price_from!=null?' Starting at $'+Number(service.price_from).toFixed(2):'')));
    container.append(card);
    const opt=document.createElement('option');opt.value=service.title;opt.textContent=service.title;select.append(opt);
  }
  const other=document.createElement('option');other.value='Other';other.textContent='Other / request a custom quote';select.append(other);
}
async function loadPublicData(){
  const [settingsResult, servicesResult, photosResult]=await Promise.all([
    db.from('business_settings').select('*').eq('id',true).maybeSingle(),
    db.from('services').select('title,description,price_from,sort_order').eq('visible',true).order('sort_order'),
    db.from('gallery').select('image_path,caption,sort_order').eq('visible',true).order('sort_order'),
  ]);
  if(settingsResult.data){
    const b=settingsResult.data;
    const phoneDigits=String(b.phone||'(832) 877-5556').replace(/[^+\d]/g,'');
    document.querySelectorAll('a[href^="tel:"]').forEach(a=>{a.href='tel:'+phoneDigits;if(a.classList.contains('pill'))a.textContent='CALL PARKER ↗';else if(a.classList.contains('phone-big'))a.textContent=b.phone+' ↗';else if(a.textContent.includes('CALL ('))a.textContent='CALL '+b.phone;});
    const paymentButton=$('paymentLink'); if(paymentButton)paymentButton.href='tel:'+phoneDigits;
    const review=$('googleReviewLink');
    if(b.google_review_url){review.href=b.google_review_url;review.hidden=false;}
  }
  if(servicesResult.data)renderServices(servicesResult.data);
  if(photosResult.data && photosResult.data.length){
    const gallery=$('galleryList');gallery.replaceChildren();
    for(const photo of photosResult.data){
      const figure=element('figure');
      const img=document.createElement('img');
      img.loading='lazy';img.alt=photo.caption||'Cole’s Auto Detailing work';
      img.src=db.storage.from('coles-gallery').getPublicUrl(photo.image_path).data.publicUrl;
      const cap=element('figcaption','',photo.caption||'Recent work');
      figure.append(img,cap);gallery.append(figure);
    }
  }
}
const form=$('requestForm'), btn=$('requestButton'), status=$('formStatus');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(form.elements.website.value) return;
  const f=new FormData(form), data={
    name:String(f.get('name')||'').trim(),
    phone:String(f.get('phone')||'').trim(),
    email:String(f.get('email')||'').trim()||null,
    service_text:String(f.get('service_text')||'').trim(),
    preferred_date:String(f.get('preferred_date')||'')||null,
    details:String(f.get('details')||'').trim()||null
  };
  if(data.name.length<2 || data.phone.length<7 || !data.service_text){status.textContent='Please enter your name, phone number and service.';return;}
  btn.disabled=true;status.textContent='Sending your request…';
  const {error}=await db.from('leads').insert(data);
  btn.disabled=false;
  if(error){
    console.error('Quote request failed:',error.code);
    status.textContent='We could not send this request. Please call or text Parker at (832) 877-5556.';
  }else{
    form.reset();status.textContent='Thank you! Your request was sent. Parker will be in touch.';
  }
});
renderServices(defaultServices);
loadPublicData().catch(()=>{status.textContent='Online requests are temporarily unavailable. Please call Parker at (832) 877-5556.';});

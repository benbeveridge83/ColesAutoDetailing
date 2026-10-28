/**
 * Job calendar (America/Chicago) using Supabase jobs as the single source of truth.
 * No separate calendar duplication or hidden background scheduler.
 * Reminder badges show tasks Parker needs to handle; .ics download can create native
 * calendar alarms. Sending customer SMS is intentionally a separate confirmed action.
 */
const ZONE='America/Chicago';
const fmtParts=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const fmtTime=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,weekday:'short',month:'short',day:'numeric',
  hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const fmtDay=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'});
const fmtMoney=amount=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(amount)||0);
function centralParts(date){
 const p=Object.fromEntries(fmtParts.formatToParts(date).filter(v=>v.type!=='literal').map(v=>[v.type,v.value]));
 return {year:Number(p.year),month:Number(p.month),day:Number(p.day),hour:Number(p.hour),minute:Number(p.minute)};
}
function pad(n){return String(n).padStart(2,'0')}
export function dayKey(date){const p=centralParts(date);return p.year+'-'+pad(p.month)+'-'+pad(p.day)}
export function centralToUtcISO(day,time){
 const [y,m,d]=day.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
 if(!y||!m||!d||hour<0||hour>23||minute<0||minute>59)throw new Error('Enter a valid job date and time.');
 const intended=Date.UTC(y,m-1,d,hour,minute);
 let stamp=intended+6*3600000;
 for(let attempt=0;attempt<5;attempt++){
   const p=centralParts(new Date(stamp));
   const current=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
   const delta=intended-current;
   if(delta===0)break;
   stamp+=delta;
 }
 const actual=centralParts(new Date(stamp));
 if(actual.year!==y||actual.month!==m||actual.day!==d||actual.hour!==hour||actual.minute!==minute)
   throw new Error('That local time is invalid because of the daylight-saving time change. Choose another time.');
 return new Date(stamp).toISOString();
}
function dateAtUtc(day){const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))}
export function shiftDays(day,delta){const d=dateAtUtc(day);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
export function startOfWeek(day){const dayOfWeek=dateAtUtc(day).getUTCDay();return shiftDays(day,-dayOfWeek)}
function htmlButton(title,callback,style='secondary'){
 const b=document.createElement('button');b.type='button';b.className=style;b.textContent=title;b.onclick=callback;return b;
}
function textNode(tag,text,cls){
 const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;
}
function icsEncode(v){return String(v??'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function icsUtc(d){return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').replace('Z','Z')}

function saveIcs(entry,customer,title){
 const d=entryDate(entry);
 if(!d)throw new Error('Choose a calendar date before exporting.');
 const start=entryStart(entry);
 const end=start?new Date(start.getTime()+Number(entry.duration_minutes||90)*60000):null;
 const alarm=Number(entry.reminder_minutes_before||0);
 const lines=[
  'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ColesAutoDetailing//JobCalendar//EN',
  'CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+entry.id+'@colesautodetailingtexas.com',
  'DTSTAMP:'+icsUtc(new Date())
 ];
 if(start){
  lines.push('DTSTART:'+icsUtc(start),'DTEND:'+icsUtc(end));
 }else{
  lines.push('DTSTART;VALUE=DATE:'+d.replaceAll('-',''),
   'DTEND;VALUE=DATE:'+shiftDays(d,1).replaceAll('-',''));
 }
 lines.push('SUMMARY:'+icsEncode(title),
  'DESCRIPTION:'+icsEncode('Cole’s calendar '+(entry.kind==='event'?'event':'job')+
   (customer?'. Customer: '+customer.name+'. Phone: '+(customer.phone||'')+'.':'')),
  'STATUS:CONFIRMED');
 if(customer?.address)lines.push('LOCATION:'+icsEncode(customer.address));
 if(alarm>0){
   // An all-day entry has no start time. Anchor its reminder to 9am Central.
   const reminderAnchor=start||new Date(centralToUtcISO(d,'09:00'));
   const trigger=start?'TRIGGER:-PT'+alarm+'M':
     'TRIGGER;VALUE=DATE-TIME:'+icsUtc(new Date(reminderAnchor.getTime()-alarm*60000));
   lines.push('BEGIN:VALARM','ACTION:DISPLAY',trigger,
     'DESCRIPTION:Upcoming calendar event','END:VALARM');
 }
 lines.push('END:VEVENT','END:VCALENDAR','');
 const blob=new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='coles-calendar-'+d+'.ics';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function entryDate(e){
 if(e.kind==='event')return e.event_date||null;
 return e.calendar_date||(e.scheduled_for?dayKey(new Date(e.scheduled_for)):null);
}
function entryStart(e){
 if(e.kind==='event'){
   if(!e.event_date||!e.event_time)return null;
   try{return new Date(centralToUtcISO(e.event_date,String(e.event_time).slice(0,5)));}
   catch{return null;}
 }
 return e.scheduled_for?new Date(e.scheduled_for):null;
}
export function initCalendar({db,getJobs,getEvents,getCustomers,getServices,refreshAll,openComposer,say}){
 const $=id=>document.getElementById(id);
 let selectedDate=dayKey(new Date()),view='month',cursorMonth=selectedDate.slice(0,7);
 const frm=$('calendarJobForm');
 const type=$('calendarEntryType');
 const findCustomer=entry=>getCustomers().find(c=>c.id===entry.customer_id);
 const titleOf=entry=>entry.kind==='event'?(entry.title||'Event'):
   (entry.service_description||getServices().find(s=>s.id===entry.service_id)?.title||'Job');
 const allEntries=()=>[
   ...getJobs().map(e=>({...e,kind:'job'})),
   ...getEvents().map(e=>({...e,kind:'event'}))
 ];
 const onDate=day=>allEntries().filter(e=>entryDate(e)===day)
   .sort((a,b)=>{
     const ta=entryStart(a)?.getTime(),tb=entryStart(b)?.getTime();
     if(!ta&&!tb)return titleOf(a).localeCompare(titleOf(b));
     if(!ta)return -1;
     if(!tb)return 1;
     return ta-tb;
   });
 const when=entry=>{const d=entryStart(entry);return d?fmtTime.format(d):'All day · '+entryDate(entry);};
 function selectOptions(select,items,empty,{newCustomer=false}={}){
   const previous=select.value;select.replaceChildren();
   const opt=document.createElement('option');opt.value='';opt.textContent=empty;select.append(opt);
   for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=item.title||item.name;select.append(o);}
   if(newCustomer){
     const o=document.createElement('option');o.value='__new__';o.textContent='+ Add New Customer';select.append(o);
   }
   if([...select.options].some(o=>o.value===previous))select.value=previous;
 }
 function updateFormType(){
   const job=type.value!=='event';
   for(const field of document.querySelectorAll('[data-calendar-job-field]'))field.hidden=!job;
   $('calendarEditorHeading').textContent=frm.elements.id.value?
     (job?'Edit job':'Edit event'):(job?'Add job':'Add general event');
   $('calendarSaveBtn').textContent=frm.elements.id.value?'Save changes':'Save to calendar';
 }
 function toggleNewCustomer(){
   $('calendarNewCustomer').hidden=$('calendarCustomer').value!=='__new__';
 }
 function formatClock(date){
   return new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'numeric',minute:'2-digit'}).format(date);
 }
 function drawGrid(){
   const grid=$('calendarGrid');grid.replaceChildren();
   for(const weekday of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])grid.append(textNode('div',weekday,'calendar-weekday'));
   const month=cursorMonth+'-01';
   const first=view==='month'?shiftDays(month,-dateAtUtc(month).getUTCDay()):startOfWeek(selectedDate);
   const count=view==='month'?42:7;
   $('calHeading').textContent=view==='month'?
     new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(dateAtUtc(month)):
     'Week of '+fmtDay.format(dateAtUtc(first));
   const today=dayKey(new Date());
   for(let i=0;i<count;i++){
     const d=shiftDays(first,i);
     const button=htmlButton('',()=>{
       selectedDate=d;cursorMonth=d.slice(0,7);
       if(!frm.elements.id.value)$('calendarDate').value=d;
       render();
     });
     button.className='calendar-day'+(d===selectedDate?' active':'')+
       (d===today?' today':'')+(view==='month'&&d.slice(0,7)!==cursorMonth?' outside':'');
     button.setAttribute('aria-label','Select '+d);
     button.append(textNode('span',String(dateAtUtc(d).getUTCDate()),'cal-date'));
     const list=onDate(d);
     for(const item of list.slice(0,2)){
       const customer=findCustomer(item);
       const start=entryStart(item);
       const label=(start?formatClock(start)+' ':'')+(customer?.name?customer.name+' — ':'')+titleOf(item);
       const chip=textNode('span',label,'cal-chip'+(item.kind==='event'?' event':
         ['completed','paid'].includes(item.status)?' complete':item.status==='cancelled'?' cancelled':''));
       chip.title=(item.kind==='event'?'Event':'Job')+': '+titleOf(item);
       button.append(chip);
     }
     if(list.length>2)button.append(textNode('span','+'+(list.length-2)+' more','calendar-empty'));
     grid.append(button);
   }
 }
 function drawDay(){
   const container=$('calDayJobs');container.replaceChildren();
   $('calDayHeading').textContent=fmtDay.format(dateAtUtc(selectedDate));
   const items=onDate(selectedDate);
   if(!items.length)container.append(textNode('p','Nothing on this date. Add a job or event using the form.'));
   for(const entry of items)drawEntry(entry,container);
 }
 async function markCompleted(job){
   if(!confirm('Mark this job completed?'))return;
   const {error}=await db.from('jobs').update({status:'completed'}).eq('id',job.id);
   if(error){say('Could not mark job complete: '+error.message);return;}
   say('Job completed. You can send a customer a payment link or review invitation when their contact is saved.');
   await refreshAll();
 }
 async function removeEvent(item){
   if(item.kind!=='event'||!confirm('Delete this calendar event?'))return;
   const {error}=await db.from('calendar_events').delete().eq('id',item.id);
   if(error){say('Could not delete event: '+error.message);return;}
   clear();say('Event deleted.');await refreshAll();
 }
 function drawEntry(item,container,reminder=false){
   const customer=findCustomer(item),isJob=item.kind==='job';
   const wrap=textNode('div','','item'+(reminder?' calendar-reminder-due':''));
   const label=(customer?.name?customer.name+' — ':'')+titleOf(item);
   wrap.append(textNode('strong',label));
   wrap.append(textNode('small',when(item)+
     ' · '+(item.duration_minutes||90)+' minutes · '+(isJob?item.status:'General event')+
     (isJob&&item.price!=null?' · '+fmtMoney(item.price):'')+
     (customer?.address?' · '+customer.address:'')));
   wrap.append(htmlButton('Edit',()=>edit(item)));
   wrap.append(htmlButton('Add to my calendar',()=>{
     try{saveIcs(item,customer,titleOf(item));say('Calendar invitation downloaded. Import it into your calendar app to receive reminders.')}
     catch(e){say(e.message);}
   }));
   if(isJob){
     if(customer&&item.status!=='cancelled')wrap.append(htmlButton('Send Text',()=>openComposer(item)));
     if(!['paid','completed','cancelled'].includes(item.status))
       wrap.append(htmlButton('Mark completed',()=>{void markCompleted(item)}));
     if(['completed','paid'].includes(item.status)&&item.recurring_interval_days)
       wrap.append(htmlButton('Schedule next visit',()=>{void scheduleNext(item)}));
   }else{
     wrap.append(htmlButton('Delete event',()=>{void removeEvent(item)},'secondary'));
   }
   if(reminder)wrap.append(htmlButton('Mark reminder handled',async()=>{
     const table=isJob?'jobs':'calendar_events';
     const {error}=await db.from(table).update({reminder_handled_at:new Date().toISOString()}).eq('id',item.id);
     if(error){say('Could not update reminder: '+error.message);return;}
     say('Reminder handled manually. This does not send a customer message.');
     await refreshAll();
   }));
   container.append(wrap);
 }
 function drawReminders(){
   const box=$('calendarReminders');box.replaceChildren();
   const now=Date.now();
   const due=allEntries().filter(item=>{
     if(item.reminder_minutes_before==null||item.reminder_handled_at||
       item.kind==='job'&&['cancelled','completed','paid'].includes(item.status))return false;
     const start=entryStart(item);
     const calendarDay=entryDate(item);
     if(!start&&!calendarDay)return false;
     // All-day entries can be reminders too: use 9am Central for their alert clock.
     const anchor=start||new Date(centralToUtcISO(calendarDay,'09:00'));
     const time=anchor.getTime();
     return time>=now-24*3600000&&time<=now+14*86400000&&now>=time-item.reminder_minutes_before*60000;
   }).sort((a,b)=>entryStart(a)-entryStart(b));
   if(!due.length)box.append(textNode('p','No reminders currently due.'));
   for(const item of due)drawEntry(item,box,true);
 }
 function render(){
   if(!$('calendarGrid'))return;
   selectOptions($('calendarCustomer'),getCustomers(),'No customer',{newCustomer:true});
   selectOptions($('calendarService'),getServices(),'No service selected');
   toggleNewCustomer();
   drawGrid();drawDay();drawReminders();
   if(!frm.elements.id.value&&!$('calendarDate').value)$('calendarDate').value=selectedDate;
   $('calMonthView').classList.toggle('active',view==='month');
   $('calWeekView').classList.toggle('active',view==='week');
   updateFormType();
 }
 function clear(){
   frm.reset();
   frm.elements.id.value='';
   type.disabled=false;type.value='job';
   $('calendarDate').value=selectedDate;
   $('calendarTime').value='';
   $('calendarCustomer').value='';
   toggleNewCustomer();
   updateFormType();
 }
 function edit(entry){
   const d=entryDate(entry)||selectedDate;
   selectedDate=d;cursorMonth=d.slice(0,7);
   clear();render();
   const start=entryStart(entry);
   const p=start?centralParts(start):null;
   frm.elements.id.value=entry.id;
   type.value=entry.kind;type.disabled=true;
   frm.elements.customer_id.value=entry.customer_id||'';
   frm.elements.service_id.value=entry.kind==='job'?(entry.service_id||''):'';
   frm.elements.service_description.value=titleOf(entry)==='Job'||titleOf(entry)==='Event'?'':entry.kind==='event'?entry.title||'':entry.service_description||'';
   frm.elements.date.value=d;
   frm.elements.time.value=p?pad(p.hour)+':'+pad(p.minute):'';
   frm.elements.duration_minutes.value=String(entry.duration_minutes||90);
   frm.elements.reminder_minutes_before.value=String(entry.reminder_minutes_before??'');
   frm.elements.recurring_interval_days.value=String(entry.recurring_interval_days??'');
   frm.elements.price.value=entry.kind==='job'?(entry.price??''):'';
   frm.elements.notes.value=entry.notes||'';
   updateFormType();toggleNewCustomer();
   frm.scrollIntoView({behavior:'smooth',block:'center'});
 }
 async function scheduleNext(job){
   const d=entryDate({...job,kind:'job'});
   if(!d)return;
   const nextDay=shiftDays(d,Number(job.recurring_interval_days));
   const old=entryStart({...job,kind:'job'});
   const p=old?centralParts(old):null;
   let time=null;
   try{time=p?centralToUtcISO(nextDay,pad(p.hour)+':'+pad(p.minute)):null;}
   catch(e){say(e.message);return;}
   if(!confirm('Schedule the next '+titleOf({...job,kind:'job'})+' on '+nextDay+
     (time?' at '+fmtTime.format(new Date(time)):' (all day)')+'?'))return;
   const {error}=await db.from('jobs').insert({
     customer_id:job.customer_id||null,service_id:job.service_id,
     service_description:job.service_description||null,scheduled_for:time,
     calendar_date:nextDay,duration_minutes:job.duration_minutes||90,
     reminder_minutes_before:job.reminder_minutes_before,
     recurring_interval_days:job.recurring_interval_days,
     price:job.price,notes:job.notes,status:'scheduled'
   });
   if(error){say('Could not schedule next visit: '+error.message);return;}
   selectedDate=nextDay;cursorMonth=nextDay.slice(0,7);
   clear();say('Next visit scheduled.');await refreshAll();
 }
 async function quickCustomer(form){
   const value=form.elements.customer_id.value;
   if(value!=='__new__')return value||null;
   const name=form.elements.new_customer_name.value.trim();
   const phone=form.elements.new_customer_phone.value.trim();
   const email=form.elements.new_customer_email.value.trim();
   const address=form.elements.new_customer_address.value.trim();
   if(!name&&!phone&&!email&&!address)return null; // No required fields.
   if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
     throw new Error('Customer email looks invalid. Correct it or leave it blank.');
   const customer={
     name:name||phone||email||'New customer',
     phone:phone||null,email:email||null,address:address||null
   };
   const {data,error}=await db.from('customers').insert(customer).select('id').single();
   if(error)throw new Error('Could not add customer: '+error.message);
   return data.id;
 }
 frm.onsubmit=async e=>{
   e.preventDefault();
   const f=e.target,kind=type.value==='event'?'event':'job';
   const id=f.elements.id.value||null;
   const date=f.elements.date.value||selectedDate; // Date is never a required field.
   const time=f.elements.time.value||null; // An empty time means an all-day entry.
   let startISO=null;
   try{if(time)startISO=centralToUtcISO(date,time);}
   catch(error){say(error.message);return;}
   const duration=Number(f.elements.duration_minutes.value)||90;
   const priceText=f.elements.price.value;
   const price=priceText.trim()===''?null:Number(priceText);
   if(kind==='job'&&price!=null&&(price<0||!Number.isFinite(price))){
     say('Price must be a positive amount, or you can leave it blank.');return;
   }
   // Conflicts are warnings only, never a requirement to reschedule.
   if(startISO){
     const start=Date.parse(startISO),end=start+duration*60000;
     const conflict=allEntries().find(item=>{
       if(id&&item.id===id&&item.kind===kind)return false;
       if(item.kind==='job'&&item.status==='cancelled')return false;
       const other=entryStart(item);
       return other&&start<other.getTime()+Number(item.duration_minutes||90)*60000&&end>other.getTime();
     });
     if(conflict&&!confirm('This overlaps '+titleOf(conflict)+'. Save anyway?'))return;
   }
   $('calendarSaveBtn').disabled=true;
   try{
     const customerId=await quickCustomer(f);
     const title=f.elements.service_description.value.trim();
     let result;
     if(kind==='event'){
       const payload={
         title:title||'Event',event_date:date,event_time:time,
         customer_id:customerId,duration_minutes:duration,
         reminder_minutes_before:f.elements.reminder_minutes_before.value?
           Number(f.elements.reminder_minutes_before.value):null,
         notes:f.elements.notes.value.trim()||null
       };
       result=id?await db.from('calendar_events').update({
         ...payload,reminder_handled_at:null,updated_at:new Date().toISOString()
       }).eq('id',id):await db.from('calendar_events').insert(payload);
     }else{
       const payload={
         customer_id:customerId,service_id:f.elements.service_id.value||null,
         service_description:title||null,calendar_date:date,scheduled_for:startISO,
         duration_minutes:duration,reminder_minutes_before:f.elements.reminder_minutes_before.value?
           Number(f.elements.reminder_minutes_before.value):null,
         recurring_interval_days:f.elements.recurring_interval_days.value?
           Number(f.elements.recurring_interval_days.value):null,
         price,notes:f.elements.notes.value.trim()||null
       };
       result=id?await db.from('jobs').update({
         ...payload,reminder_handled_at:null
       }).eq('id',id):await db.from('jobs').insert({...payload,status:'scheduled'});
     }
     if(result.error)throw new Error(result.error.message);
     selectedDate=date;cursorMonth=date.slice(0,7);
     clear();
     say((kind==='job'?'Job':'Event')+(id?' updated':' added')+' on '+date+'.'+(!time?' Saved as all day.':''));
     await refreshAll();
   }catch(error){say('Could not save calendar entry: '+error.message);}
   finally{$('calendarSaveBtn').disabled=false;}
 };
 type.addEventListener('change',updateFormType);
 $('calendarCustomer').addEventListener('change',toggleNewCustomer);
 $('calToday').onclick=()=>{selectedDate=dayKey(new Date());cursorMonth=selectedDate.slice(0,7);render()};
 $('calMonthView').onclick=()=>{view='month';cursorMonth=selectedDate.slice(0,7);render()};
 $('calWeekView').onclick=()=>{view='week';render()};
 $('calPrev').onclick=()=>navigate(-1);
 $('calNext').onclick=()=>navigate(1);
 function navigate(delta){
   if(view==='week'){selectedDate=shiftDays(selectedDate,delta*7);cursorMonth=selectedDate.slice(0,7);}
   else{
     const [y,m]=cursorMonth.split('-').map(Number);
     selectedDate=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,10);
     cursorMonth=selectedDate.slice(0,7);
   }
   if(!frm.elements.id.value)$('calendarDate').value=selectedDate;
   render();
 }
 $('calendarCancelEdit').onclick=()=>{clear();render();};
 clear();
 return {render,selectDate:date=>{selectedDate=date;cursorMonth=date.slice(0,7);render();},editJob:job=>edit({...job,kind:'job'})};
}

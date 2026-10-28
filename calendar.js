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
function dayKey(date){const p=centralParts(date);return p.year+'-'+pad(p.month)+'-'+pad(p.day)}
function centralToUtcISO(day,time){
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
function shiftDays(day,delta){const d=dateAtUtc(day);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function startOfWeek(day){const dayOfWeek=dateAtUtc(day).getUTCDay();return shiftDays(day,-dayOfWeek)}
function htmlButton(title,callback,style='secondary'){
 const b=document.createElement('button');b.type='button';b.className=style;b.textContent=title;b.onclick=callback;return b;
}
function textNode(tag,text,cls){
 const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;
}
function icsEncode(v){return String(v??'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function icsUtc(d){return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').replace('Z','Z')}
function saveIcs(job,customer,serviceLabel){
 if(!job.scheduled_for)throw new Error('Job has no scheduled date.');
 const start=new Date(job.scheduled_for);
 const end=new Date(start.getTime()+Number(job.duration_minutes||90)*60000);
 const alarm=Number(job.reminder_minutes_before||0);
 const lines=[
  'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ColesAutoDetailing//JobCalendar//EN',
  'CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+job.id+'@colesautodetailingtexas.com',
  'DTSTAMP:'+icsUtc(new Date()),'DTSTART:'+icsUtc(start),'DTEND:'+icsUtc(end),
  'SUMMARY:'+icsEncode(serviceLabel+' — '+customer.name),
  'DESCRIPTION:'+icsEncode('Cole’s Auto Detailing job. Customer: '+customer.name+'. Phone: '+(customer.phone||'')+'.'),
  'STATUS:CONFIRMED'
 ];
 if(customer.address)lines.push('LOCATION:'+icsEncode(customer.address));
 if(alarm>0)lines.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-PT'+alarm+'M','DESCRIPTION:Upcoming Cole’s Auto Detailing job','END:VALARM');
 lines.push('END:VEVENT','END:VCALENDAR','');
 const blob=new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='coles-job-'+new Date(job.scheduled_for).toISOString().slice(0,10)+'.ics';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function initCalendar({db,getJobs,getCustomers,getServices,refreshAll,openComposer,say}){
 const $=id=>document.getElementById(id);
 let selectedDate=dayKey(new Date()),view='month';
 let cursorMonth=selectedDate.slice(0,7);
 const serviceLabel=job=>job.service_description||getServices().find(s=>s.id===job.service_id)?.title||'Cleaning service';
 const jobsOnDate=day=>getJobs().filter(j=>j.scheduled_for&&dayKey(new Date(j.scheduled_for))===day)
  .sort((a,b)=>Date.parse(a.scheduled_for)-Date.parse(b.scheduled_for));
 const findCustomer=job=>getCustomers().find(c=>c.id===job.customer_id);
 function selectOptions(select,items,empty){
   const previous=select.value;select.replaceChildren();
   const option=document.createElement('option');option.value='';option.textContent=empty;select.append(option);
   for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=item.title||item.name;select.append(o);}
   if([...select.options].some(o=>o.value===previous))select.value=previous;
 }
 function formatHour(date){return new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'numeric',minute:'2-digit'}).format(date)}
 function renderCalendarGrid(){
   const grid=$('calendarGrid');grid.replaceChildren();
   for(const weekday of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']){
     grid.append(textNode('div',weekday,'calendar-weekday'));
   }
   const firstMonth=cursorMonth+'-01';
   let firstDay,length;
   if(view==='month'){
     const offset=dateAtUtc(firstMonth).getUTCDay();
     firstDay=shiftDays(firstMonth,-offset);
     length=42;
     $('calHeading').textContent=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(dateAtUtc(firstMonth));
   }else{
     firstDay=startOfWeek(selectedDate);length=7;
     $('calHeading').textContent='Week of '+fmtDay.format(dateAtUtc(firstDay));
   }
   const today=dayKey(new Date());
   for(let i=0;i<length;i++){
     const day=shiftDays(firstDay,i);
     const button=htmlButton('',()=>{selectedDate=day;cursorMonth=day.slice(0,7);render();});
     button.className='calendar-day'+(day===selectedDate?' active':'')+
       (day===today?' today':'')+(view==='month'&&day.slice(0,7)!==cursorMonth?' outside':'');
     button.setAttribute('aria-label','Select '+day);
     button.append(textNode('span',String(dateAtUtc(day).getUTCDate()),'cal-date'));
     const list=jobsOnDate(day);
     for(const job of list.slice(0,2)){
       const c=findCustomer(job);
       const chip=textNode('span',formatHour(new Date(job.scheduled_for))+' '+(c?.name||serviceLabel(job)),
         'cal-chip'+(['completed','paid'].includes(job.status)?' complete':job.status==='cancelled'?' cancelled':''));
       chip.title=serviceLabel(job)+' — '+(c?.name||'Customer')+' ('+job.status+')';
       button.append(chip);
     }
     if(list.length>2)button.append(textNode('span','+'+(list.length-2)+' more','calendar-empty'));
     grid.append(button);
   }
 }
 async function complete(job){
   if(!confirm('Mark this job completed? You can then send a payment link and a review invitation.'))return;
   const {error}=await db.from('jobs').update({status:'completed'}).eq('id',job.id);
   if(error){say('Could not complete job: '+error.message);return;}
   say('Job marked completed. Choose Send Text to contact the customer.');
   await refreshAll();
 }
 function row(job,container,reminder=false){
   const customer=findCustomer(job);
   const wrapper=textNode('div','', 'item'+(reminder?' calendar-reminder-due':''));
   wrapper.append(textNode('strong',(customer?.name||'Customer')+' — '+serviceLabel(job)));
   wrapper.append(textNode('small',
     fmtTime.format(new Date(job.scheduled_for))+' · '+(job.duration_minutes||90)+' min · '+job.status+
     ' · '+(job.price==null?'Quote not set':fmtMoney(job.price))+
     (customer?.address?' · '+customer.address:'')
   ));
   wrapper.append(htmlButton('Edit',()=>edit(job)));
   if(job.status!=='cancelled'){
     wrapper.append(htmlButton('Send Text',()=>openComposer(job)));
     wrapper.append(htmlButton('Add to my calendar',()=>{try{saveIcs(job,customer||{name:'Customer'},serviceLabel(job));say('Calendar invitation downloaded. Open/import it to add the job to your calendar app.')}catch(e){say(e.message)}}));
   }
   if(!['paid','completed','cancelled'].includes(job.status))
     wrapper.append(htmlButton('Mark completed',()=>{void complete(job)}));
   if(reminder)wrapper.append(htmlButton('Mark reminder handled',async()=>{
     const {error}=await db.from('jobs').update({reminder_handled_at:new Date().toISOString()}).eq('id',job.id);
     if(error){say('Could not update reminder: '+error.message);return;}
     say('Reminder marked handled manually. This does not confirm SMS delivery.');
     await refreshAll();
   }));
   if(['completed','paid'].includes(job.status)&&job.recurring_interval_days)
     wrapper.append(htmlButton('Schedule next visit',()=>{void scheduleNext(job)}));
   container.append(wrapper);
 }
 function renderSelectedDay(){
   const container=$('calDayJobs');container.replaceChildren();
   $('calDayHeading').textContent=fmtDay.format(dateAtUtc(selectedDate));
   const items=jobsOnDate(selectedDate);
   if(!items.length)container.append(textNode('p','No jobs on this date. Create one using the form.'));
   for(const job of items)row(job,container);
 }
 function renderReminders(){
   const box=$('calendarReminders');box.replaceChildren();
   const now=Date.now();
   const due=getJobs().filter(j=>{
     if(!j.scheduled_for||!j.reminder_minutes_before||j.reminder_handled_at||
       ['cancelled','completed','paid'].includes(j.status))return false;
     const time=Date.parse(j.scheduled_for);
     return time>=now-24*3600000&&time<=now+14*86400000&&now>=time-j.reminder_minutes_before*60000;
   }).sort((a,b)=>Date.parse(a.scheduled_for)-Date.parse(b.scheduled_for));
   if(!due.length){box.append(textNode('p','No reminders currently due.'));return;}
   for(const job of due)row(job,box,true);
 }
 function render(){
   if(!$('calendarGrid'))return;
   selectOptions($('calendarCustomer'),getCustomers(),'Choose a customer…');
   selectOptions($('calendarService'),getServices(),'Custom service');
   renderCalendarGrid();renderSelectedDay();renderReminders();
   if(!$('calendarJobId').value)$('calendarDate').value=selectedDate;
   $('calMonthView').classList.toggle('active',view==='month');
   $('calWeekView').classList.toggle('active',view==='week');
 }
 function clear(){
   $('calendarJobForm').reset();
   $('calendarJobId').value='';
   $('calendarEditorHeading').textContent='Schedule a job';
   $('calendarSaveBtn').textContent='Schedule job';
   $('calendarDate').value=selectedDate;
   $('calendarTime').value='09:00';
 }
 function edit(job){
   const form=$('calendarJobForm');
   const p=centralParts(new Date(job.scheduled_for));
   selectedDate=p.year+'-'+pad(p.month)+'-'+pad(p.day);
   cursorMonth=selectedDate.slice(0,7);
   render();
   form.elements.id.value=job.id;
   form.elements.customer_id.value=job.customer_id;
   form.elements.service_id.value=job.service_id||'';
   form.elements.service_description.value=job.service_description||'';
   form.elements.date.value=selectedDate;
   form.elements.time.value=pad(p.hour)+':'+pad(p.minute);
   form.elements.duration_minutes.value=String(job.duration_minutes||90);
   form.elements.reminder_minutes_before.value=String(job.reminder_minutes_before??'');
   form.elements.recurring_interval_days.value=String(job.recurring_interval_days??'');
   form.elements.price.value=job.price??'';
   form.elements.notes.value=job.notes||'';
   $('calendarEditorHeading').textContent='Edit scheduled job';
   $('calendarSaveBtn').textContent='Save changes';
   form.scrollIntoView({behavior:'smooth',block:'center'});
 }
 async function scheduleNext(job){
   const start=new Date(job.scheduled_for);
   const next=new Date(start.getTime()+job.recurring_interval_days*86400000);
   // DST: scheduled next visit should retain the SAME Central clock time.
   const p=centralParts(start);
   const nextDay=shiftDays(dayKey(start),job.recurring_interval_days);
   let when;
   try{when=centralToUtcISO(nextDay,pad(p.hour)+':'+pad(p.minute));}catch(e){say(e.message);return;}
   if(!confirm('Schedule the next '+serviceLabel(job)+' for '+fmtTime.format(new Date(when))+'? No text will be sent automatically.'))return;
   const {error}=await db.from('jobs').insert({
     customer_id:job.customer_id,service_id:job.service_id,
     service_description:job.service_description,scheduled_for:when,
     duration_minutes:job.duration_minutes||90,reminder_minutes_before:job.reminder_minutes_before,
     recurring_interval_days:job.recurring_interval_days,
     price:job.price,notes:job.notes,status:'scheduled'
   });
   if(error){say('Could not schedule next job: '+error.message);return;}
   selectedDate=nextDay;cursorMonth=selectedDate.slice(0,7);clear();
   say('Next visit scheduled. Send the customer a reminder when it is due.');
   await refreshAll();
 }
 $('calendarJobForm').onsubmit=async e=>{
   e.preventDefault();
   const f=e.target;
   if(!f.elements.customer_id.value){say('Choose a customer to schedule this job.');return;}
   const id=f.elements.id.value||null;
   let startISO;
   try{startISO=centralToUtcISO(f.elements.date.value,f.elements.time.value);}
   catch(error){say(error.message);return;}
   const start=Date.parse(startISO);
   const duration=Number(f.elements.duration_minutes.value||90);
   if(duration<15||duration>720){say('Select a duration between 15 minutes and 12 hours.');return;}
   const collision=getJobs().find(j=>j.id!==id&&j.scheduled_for&&j.status!=='cancelled'
     &&start<Date.parse(j.scheduled_for)+Number(j.duration_minutes||90)*60000
     &&start+duration*60000>Date.parse(j.scheduled_for));
   if(collision&&!confirm('Another job overlaps this time ('+serviceLabel(collision)+'). Schedule anyway?'))return;
   const priceStr=f.elements.price.value;
   const price=priceStr===''?null:Number(priceStr);
   if(price!=null&&(price<0||!Number.isFinite(price))){say('Enter a valid job price.');return;}
   const payload={
     customer_id:f.elements.customer_id.value,
     service_id:f.elements.service_id.value||null,
     service_description:f.elements.service_description.value.trim()||null,
     scheduled_for:startISO,duration_minutes:duration,
     reminder_minutes_before:f.elements.reminder_minutes_before.value?Number(f.elements.reminder_minutes_before.value):null,
     recurring_interval_days:f.elements.recurring_interval_days.value?Number(f.elements.recurring_interval_days.value):null,
     price,notes:f.elements.notes.value.trim()||null
   };
   $('calendarSaveBtn').disabled=true;
   try{
     const result=id?await db.from('jobs').update({
       ...payload,reminder_handled_at:null
     }).eq('id',id):await db.from('jobs').insert({...payload,status:'scheduled'});
     if(result.error){say('Could not save job: '+result.error.message);return;}
     selectedDate=f.elements.date.value;cursorMonth=selectedDate.slice(0,7);
     clear();say('Job '+(id?'updated':'scheduled')+' on the calendar.');
     await refreshAll();
   }finally{$('calendarSaveBtn').disabled=false;}
 };
 $('calToday').onclick=()=>{selectedDate=dayKey(new Date());cursorMonth=selectedDate.slice(0,7);render()};
 $('calMonthView').onclick=()=>{view='month';cursorMonth=selectedDate.slice(0,7);render()};
 $('calWeekView').onclick=()=>{view='week';render()};
 $('calPrev').onclick=()=>navigate(-1);
 $('calNext').onclick=()=>navigate(1);
 function navigate(delta){
   if(view==='week'){selectedDate=shiftDays(selectedDate,delta*7);cursorMonth=selectedDate.slice(0,7);}
   else{
     const [y,m]=cursorMonth.split('-').map(Number);
     const next=new Date(Date.UTC(y,m-1+delta,1));
     selectedDate=next.toISOString().slice(0,10);cursorMonth=selectedDate.slice(0,7);
   }
   render();
 }
 $('calendarCancelEdit').onclick=()=>clear();
 clear();
 return {render,selectDate:date=>{selectedDate=date;cursorMonth=date.slice(0,7);render()},editJob:edit};
}

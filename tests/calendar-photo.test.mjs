import test from 'node:test';
import assert from 'node:assert/strict';
import {centralToUtcISO,dayKey,shiftDays,startOfWeek,entryDate,entryStart} from '../calendar.js';
import {computeCrop,displayBytes,UPLOAD_LIMIT} from '../photo-tools.js';

test('Central Time converts summer and winter hours correctly',()=>{
  assert.equal(centralToUtcISO('2026-12-12','09:00'),'2026-12-12T15:00:00.000Z');
  assert.equal(centralToUtcISO('2026-07-12','09:00'),'2026-07-12T14:00:00.000Z');
  assert.equal(centralToUtcISO('2027-03-14','09:00'),'2027-03-14T14:00:00.000Z');
});
test('Nonexistent spring-forward appointment time is rejected',()=>{
  assert.throws(()=>centralToUtcISO('2027-03-14','02:30'),/daylight-saving/);
});
test('Calendar date navigation crosses month and year boundaries',()=>{
  assert.equal(shiftDays('2026-12-31',1),'2027-01-01');
  assert.equal(shiftDays('2027-01-01',-1),'2026-12-31');
  assert.equal(startOfWeek('2026-10-27'),'2026-10-25');
});
test('Date keys use Central Time instead of the viewer device timezone',()=>{
  assert.equal(dayKey(new Date('2026-12-01T05:59:00Z')),'2026-11-30');
  assert.equal(dayKey(new Date('2026-12-01T06:00:00Z')),'2026-12-01');
});
test('Original photo crop never removes content',()=>{
  assert.deepEqual(computeCrop(4000,3000,'original'),{x:0,y:0,width:4000,height:3000});
});
test('Square crop keeps image dimensions within original bounds',()=>{
  assert.deepEqual(computeCrop(4000,3000,'1:1'),{x:500,y:0,width:3000,height:3000});
});
test('Wide photo crop supports repositioning',()=>{
  const a=computeCrop(4000,3000,'16:9',.5,0);
  const b=computeCrop(4000,3000,'16:9',.5,1);
  assert.equal(a.width,4000);assert.equal(a.height,2250);
  assert.equal(a.y,0);assert.equal(b.y,750);
});
test('Portrait photo crop gives expected aspect ratio',()=>{
  const crop=computeCrop(3000,4000,'3:4');
  assert.equal(crop.width,3000);
  assert.equal(crop.height,4000);
});
test('File sizes and 5 MB upload limit are explicit',()=>{
  assert.equal(displayBytes(2*1024*1024),'2.00 MB');
  assert.equal(UPLOAD_LIMIT,5242880);
});

test('A job without customer or scheduled start still appears on selected calendar day',()=>{
  const item={kind:'job',customer_id:null,calendar_date:'2026-10-27',scheduled_for:null,
    service_description:null};
  assert.equal(entryDate(item),'2026-10-27');
  assert.equal(entryStart(item),null);
});
test('General event without customer or time is a valid all-day entry',()=>{
  const item={kind:'event',customer_id:null,title:'Event',event_date:'2026-11-03',event_time:null};
  assert.equal(entryDate(item),'2026-11-03');
  assert.equal(entryStart(item),null);
});
test('An optional-time event still uses Central Time when one is provided',()=>{
  const item={kind:'event',customer_id:null,title:'Supplies',event_date:'2026-11-03',event_time:'10:30:00'};
  assert.equal(entryStart(item).toISOString(),'2026-11-03T16:30:00.000Z');
});
test('Older scheduled jobs appear on the calendar without a new date column populated',()=>{
  const item={kind:'job',calendar_date:null,scheduled_for:'2026-11-03T16:30:00.000Z'};
  assert.equal(entryDate(item),'2026-11-03');
});

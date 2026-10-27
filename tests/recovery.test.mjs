import test from 'node:test';
import assert from 'node:assert/strict';
import {requestReset, savePassword} from '../recovery-core.mjs';

test('reset validates email and uses the fixed HTTPS recovery destination', async()=>{
 let calls=0;
 const auth={resetPasswordForEmail:async(email,options)=>{calls++; assert.equal(email,'parker@example.com'); assert.equal(options.redirectTo,'https://colesautodetailingtexas.com/reset-password.html');return {error:null}}};
 await assert.rejects(()=>requestReset(auth,'bad'),/email/i);
 await requestReset(auth,' parker@example.com ');
 assert.equal(calls,1);
});
test('password mismatch and missing session cannot change a password',async()=>{
 let changed=false;
 const auth={getUser:async()=>({data:{user:null},error:null}),updateUser:async()=>{changed=true;return {error:null}}};
 await assert.rejects(()=>savePassword(auth,'LongPassword123!','different'),/match/);
 await assert.rejects(()=>savePassword(auth,'LongPassword123!','LongPassword123!'),/expired|sign in/i);
 assert.equal(changed,false);
});
test('provider errors are reported and successful password change signs out locally',async()=>{
 let password,scope;
 const auth={getUser:async()=>({data:{user:{id:'test'}},error:null}),updateUser:async(x)=>{password=x.password;return {error:null}},signOut:async(x)=>{scope=x.scope;return {error:null}}};
 await savePassword(auth,'LongPassword123!','LongPassword123!');
 assert.equal(password,'LongPassword123!');assert.equal(scope,'local');
 await assert.rejects(()=>requestReset({resetPasswordForEmail:async()=>({error:{message:'Rate limit reached'}})},'parker@example.com'),/Rate limit/);
});

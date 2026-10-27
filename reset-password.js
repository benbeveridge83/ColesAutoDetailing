import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {supabaseUrl,supabasePublishableKey} from './supabase-config.js';
import {requestReset,savePassword} from './recovery-core.mjs';
const $=id=>document.getElementById(id);
const fragment=new URLSearchParams(location.hash.slice(1));
const invalidLink=fragment.has('error')||fragment.has('error_code');
const db=createClient(supabaseUrl,supabasePublishableKey);
let saving=false,complete=false;
function showPassword(){
 if(invalidLink||complete)return;
 $('requestPanel').hidden=true;$('passwordPanel').hidden=false;
 $('newPassword').focus();
}
db.auth.onAuthStateChange((event,session)=>{
 if((event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')&&session)showPassword();
});
if(invalidLink){
 $('requestStatus').textContent='This reset link is invalid or has expired. Request a new email below.';
 history.replaceState(null,'',location.pathname);
}else{
 db.auth.getSession().then(({data,error})=>{
  if(error){$('requestStatus').textContent='This reset link could not be verified. Please request a new email.';return;}
  if(data.session)showPassword();
 }).catch(()=>{$('requestStatus').textContent='Could not connect. Please refresh and try again.';});
}
$('requestForm').onsubmit=async event=>{
 event.preventDefault();const button=$('sendReset');button.disabled=true;
 $('requestStatus').textContent='Requesting your reset email…';
 try{
  await requestReset(db.auth,$('resetEmail').value);
  $('requestStatus').textContent='If an account exists for this email, a reset link will arrive shortly. Check your inbox and spam folder. If you have never signed in, your business administrator may need to create your account first.';
 }catch(error){$('requestStatus').textContent='Could not send the reset email: '+error.message;}
 finally{button.disabled=false;}
};
$('passwordForm').onsubmit=async event=>{
 event.preventDefault();if(saving)return;saving=true;$('savePassword').disabled=true;
 $('passwordStatus').textContent='Saving your password…';
 try{
  await savePassword(db.auth,$('newPassword').value,$('confirmPassword').value);
  complete=true;$('passwordForm').reset();$('passwordForm').hidden=true;
  $('passwordStatus').textContent='Your password is saved. Return to sign in with your new password.';
 }catch(error){$('passwordStatus').textContent=error.message;}
 finally{saving=false;$('savePassword').disabled=false;}
};

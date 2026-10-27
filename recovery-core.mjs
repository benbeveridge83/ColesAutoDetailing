export const recoveryUrl='https://colesautodetailingtexas.com/reset-password.html';
export async function requestReset(auth,value){
 const email=String(value||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address.');
 const {error}=await auth.resetPasswordForEmail(email,{redirectTo:recoveryUrl});
 if(error)throw new Error(error.message);
}
export async function savePassword(auth,password,confirmation){
 if(password.length<12)throw new Error('Use at least 12 characters.');
 if(password!==confirmation)throw new Error('The passwords do not match.');
 const {data,error}=await auth.getUser();
 if(error||!data?.user)throw new Error('This link has expired. Request a new reset email or sign in again.');
 const result=await auth.updateUser({password});
 if(result.error)throw new Error(result.error.message);
 // Discard this recovery session. Do not revoke unrelated device sessions here.
 await auth.signOut({scope:'local'});
}

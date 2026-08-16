/* Nexora-India email OTP auth flow. Requires Supabase Auth email templates to expose {{ .Token }}. */
(function(){
 const OTP_LENGTH=8;
 const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
 let lastHash='';
 const client=()=>window.sb;
 function msg(el,text,type='error'){if(el)el.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`}
 function mount(){
  if(location.hash==='#/register'){
   const b=document.querySelector('#submit'); if(!b||b.dataset.otpBound)return; b.dataset.otpBound='1';
   b.onclick=async()=>{const email=document.querySelector('#email')?.value.trim(),password=document.querySelector('#password')?.value,name=document.querySelector('#name')?.value.trim(),phone=document.querySelector('#phone')?.value.trim(),m=document.querySelector('#msg');if(!email||!password)return msg(m,'Email and password are required.');try{b.disabled=true;const r=await client().auth.signUp({email,password,options:{data:{full_name:name,phone}}});if(r.error)throw r.error;document.querySelector('#app').innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Verify your email</h2><p>We sent a verification code to <b>${esc(email)}</b>.</p><div class="field"><label>${OTP_LENGTH}-digit OTP</label><input id="verifyOtp" class="input" inputmode="numeric" maxlength="${OTP_LENGTH}" autocomplete="one-time-code"></div><button id="verifyBtn" class="btn">Verify email</button><div id="verifyMsg"></div></div></div>`;document.querySelector('#verifyBtn').onclick=async()=>{const v=document.querySelector('#verifyOtp').value.trim(),vm=document.querySelector('#verifyMsg');if(!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(v))return msg(vm,`Enter the ${OTP_LENGTH}-digit code.`);const x=await client().auth.verifyOtp({email,token:v,type:'email'});if(x.error)return msg(vm,x.error.message);location.hash='#/account'}; }catch(e){msg(m,e.message)}finally{b.disabled=false}}
  }
  if(location.hash==='#/forgot'){
   const b=document.querySelector('#submit');if(!b||b.dataset.otpBound)return;b.dataset.otpBound='1';
   b.onclick=async()=>{const email=document.querySelector('#email')?.value.trim(),m=document.querySelector('#msg');if(!email)return msg(m,'Enter your registered email.');try{b.disabled=true;const r=await client().auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#/forgot'});if(r.error)throw r.error;document.querySelector('#app').innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Verify password reset</h2><p>We sent a recovery code to <b>${esc(email)}</b>.</p><div class="field"><label>${OTP_LENGTH}-digit OTP</label><input id="recoveryOtp" class="input" inputmode="numeric" maxlength="${OTP_LENGTH}" autocomplete="one-time-code"></div><button id="recoveryVerify" class="btn">Verify code</button><div id="recoveryMsg"></div></div></div>`;document.querySelector('#recoveryVerify').onclick=async()=>{const v=document.querySelector('#recoveryOtp').value.trim(),vm=document.querySelector('#recoveryMsg');if(!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(v))return msg(vm,`Enter the ${OTP_LENGTH}-digit code.`);const x=await client().auth.verifyOtp({email,token:v,type:'recovery'});if(x.error)return msg(vm,x.error.message);document.querySelector('#app').innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Create new password</h2><div class="field"><label>New password</label><input id="newPassword" class="input" type="password" minlength="8"></div><div class="field"><label>Confirm password</label><input id="confirmPassword" class="input" type="password" minlength="8"></div><button id="savePassword" class="btn">Save new password</button><div id="passwordMsg"></div></div></div>`;document.querySelector('#savePassword').onclick=async()=>{const a=document.querySelector('#newPassword').value,c=document.querySelector('#confirmPassword').value,pm=document.querySelector('#passwordMsg');if(a.length<8)return msg(pm,'Password must be at least 8 characters.');if(a!==c)return msg(pm,'Passwords do not match.');const y=await client().auth.updateUser({password:a});if(y.error)return msg(pm,y.error.message);msg(pm,'Password changed successfully.','success');setTimeout(()=>location.hash='#/account',900)}}; }catch(e){msg(m,e.message)}finally{b.disabled=false}}
  }
 }
 async function preventAuthPagesForLoggedInUser(){
  if(!client() || !['#/login','#/register'].includes(location.hash)) return;
  try{
   const r=await client().auth.getSession();
   if(r.data?.session) location.hash='#/';
  }catch(e){console.error(e)}
 }
 setInterval(()=>{const h=location.hash;if(h!==lastHash){lastHash=h;setTimeout(mount,80)}else if(h==='#/register'||h==='#/forgot')mount();preventAuthPagesForLoggedInUser()},300);new MutationObserver(()=>{mount();preventAuthPagesForLoggedInUser()}).observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{mount();preventAuthPagesForLoggedInUser()},500);
})();

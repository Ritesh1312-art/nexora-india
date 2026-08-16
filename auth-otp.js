/* Nexora-India email OTP handler. Uses its own Supabase client so it cannot depend on app.js globals. */
(function(){
  const OTP_LENGTH=8;
  let clientPromise=null;
  let lastBoundForm=null;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style='width:100%;box-sizing:border-box;pointer-events:auto;touch-action:manipulation;user-select:text;-webkit-user-select:text;display:block;opacity:1;';

  async function client(){
    if(!clientPromise) clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.url||!d.key)throw new Error('Authentication configuration is unavailable. Please try again after the latest deployment is live.');
      return supabase.createClient(d.url,d.key);
    });
    return clientPromise;
  }
  function show(text,type='error'){
    const el=$('#msg')||$('#otpMsg');
    if(el)el.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`;
  }
  function otpScreen(email){
    $('#app').innerHTML=`<div class="container"><div class="panel" style="max-width:520px;margin:32px auto">
      <h2>Verify your email</h2>
      <p>We sent an <b>${OTP_LENGTH}-digit OTP</b> to <b>${esc(email)}</b>.</p>
      <div class="field"><label for="verifyOtp">${OTP_LENGTH}-digit OTP</label><input id="verifyOtp" class="input" style="${style}" inputmode="numeric" pattern="[0-9]*" maxlength="${OTP_LENGTH}" autocomplete="one-time-code"></div>
      <button id="verifyBtn" type="button" class="btn" style="width:100%">Verify email</button>
      <button id="resendBtn" type="button" class="btn secondary" style="width:100%;margin-top:10px">Resend OTP</button>
      <div id="otpMsg" style="margin-top:10px"></div>
    </div></div>`;
    const verify=$('#verifyBtn'), resend=$('#resendBtn');
    verify.onclick=async()=>{
      const code=$('#verifyOtp').value.trim();
      if(!new RegExp('^\\d{'+OTP_LENGTH+'}$').test(code))return show('Enter the '+OTP_LENGTH+'-digit OTP.');
      try{
        verify.disabled=true;verify.textContent='Verifying…';
        const s=await client(),r=await s.auth.verifyOtp({email,token:code,type:'email'});
        if(r.error)throw r.error;
        if(r.data?.session){location.hash='#/';location.reload();}
        else {location.hash='#/login';location.reload();}
      }catch(e){show(e.message);verify.disabled=false;verify.textContent='Verify email';}
    };
    resend.onclick=async()=>{
      try{
        resend.disabled=true;let seconds=30;resend.textContent='Resend OTP ('+seconds+'s)';
        const s=await client(),r=await s.auth.resend({type:'signup',email});
        if(r.error)throw r.error;
        show('A new OTP has been sent to your email.','success');
      }catch(e){show(e.message);}
      const timer=setInterval(()=>{seconds--;if(seconds<=0){clearInterval(timer);resend.disabled=false;resend.textContent='Resend OTP';}else resend.textContent='Resend OTP ('+seconds+'s)';},1000);
    };
    $('#verifyOtp').focus();
  }
  function bindRegister(){
    if(location.hash!=='#/register')return;
    const b=$('#submit');
    if(!b||lastBoundForm===b||b.dataset.nexoraOtpBound==='1')return;
    lastBoundForm=b;b.dataset.nexoraOtpBound='1';
    b.onclick=async()=>{
      const email=$('#email')?.value.trim(),password=$('#password')?.value,name=$('#name')?.value.trim(),phone=$('#phone')?.value.trim();
      if(!email||!password)return show('Email and password are required.');
      if(password.length<8)return show('Password must be at least 8 characters.');
      try{
        b.disabled=true;b.textContent='Creating account…';
        const s=await client();
        const r=await s.auth.signUp({email,password,options:{data:{full_name:name,phone}}});
        if(r.error)throw r.error;
        const user=r.data?.user;
        // Supabase intentionally returns an obfuscated/fake user for some existing accounts when email confirmation is enabled.
        if(user && Array.isArray(user.identities) && user.identities.length===0){
          show('An account with this email already exists. Please use Login or Forgot Password.');
          return;
        }
        if(r.data?.session){location.hash='#/';location.reload();return;}
        otpScreen(email);
      }catch(e){show(e.message)}finally{b.disabled=false;b.textContent='Register';}
    };
  }
  function bindForgot(){
    if(location.hash!=='#/forgot')return;
    const b=$('#submit');
    if(!b||b.dataset.nexoraOtpBound==='1')return;
    b.dataset.nexoraOtpBound='1';
    b.onclick=async()=>{
      const email=$('#email')?.value.trim();
      if(!email)return show('Enter your registered email.');
      try{
        b.disabled=true;b.textContent='Sending…';
        const s=await client(),r=await s.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#/forgot'});
        if(r.error)throw r.error;
        $('#app').innerHTML=`<div class="container"><div class="panel" style="max-width:520px;margin:32px auto"><h2>Verify password reset</h2><p>We sent an <b>${OTP_LENGTH}-digit recovery OTP</b> to <b>${esc(email)}</b>.</p><div class="field"><label for="recoveryOtp">${OTP_LENGTH}-digit OTP</label><input id="recoveryOtp" class="input" style="${style}" inputmode="numeric" maxlength="${OTP_LENGTH}" autocomplete="one-time-code"></div><button id="recoveryVerify" type="button" class="btn" style="width:100%">Verify code</button><button id="recoveryResend" type="button" class="btn secondary" style="width:100%;margin-top:10px">Resend OTP</button><div id="otpMsg" style="margin-top:10px"></div></div></div>`;
        $('#recoveryVerify').onclick=async()=>{const code=$('#recoveryOtp').value.trim();if(!/^\d{8}$/.test(code))return show('Enter the 8-digit OTP.');try{const x=await s.auth.verifyOtp({email,token:code,type:'recovery'});if(x.error)throw x.error;show('OTP verified. You can now set a new password.','success');}catch(e){show(e.message)}};
        $('#recoveryResend').onclick=async()=>{const rb=$('#recoveryResend');try{rb.disabled=true;const x=await s.auth.resend({type:'recovery',email});if(x.error)throw x.error;show('A new recovery OTP has been sent.','success');let n=30;rb.textContent='Resend OTP ('+n+'s)';const t=setInterval(()=>{n--;if(n<=0){clearInterval(t);rb.disabled=false;rb.textContent='Resend OTP';}else rb.textContent='Resend OTP ('+n+'s)'},1000)}catch(e){rb.disabled=false;show(e.message)}};
      }catch(e){show(e.message)}finally{b.disabled=false;b.textContent='Send reset email';}
    };
  }
  function mount(){if(location.hash==='#/register')bindRegister();else if(location.hash==='#/forgot')bindForgot();else lastBoundForm=null;}
  window.addEventListener('hashchange',()=>setTimeout(mount,80));
  new MutationObserver(()=>mount()).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(mount,300);
})();

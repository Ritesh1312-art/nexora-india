/* Nexora-India auth/navigation hardening. Email/password auth only. */
(function(){
  let clientPromise=null;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function client(){
    if(!clientPromise) clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.url||!d.key)throw new Error('Authentication configuration is unavailable. Please try again after the latest deployment is live.');return supabase.createClient(d.url,d.key)});
    return clientPromise;
  }
  function message(text,type='error'){const m=$('#rescueMsg');if(m)m.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`;}
  function nav(){
    const cart=$('#cartNav'),login=$('#loginLink'),orders=$('#ordersLink'),account=$('#accountLink'),logout=$('#logoutBtn');
    const logged=!!window.session;
    if(cart)cart.hidden=!logged;if(login)login.hidden=logged;if(orders)orders.hidden=!logged;if(account)account.hidden=!logged;if(logout)logout.hidden=!logged;
  }
  const inputStyle='width:100%;box-sizing:border-box;pointer-events:auto;touch-action:auto;user-select:text;-webkit-user-select:text;opacity:1;';
  function renderLogin(){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Login to Nexora-India</h2><div class="field"><label>Email</label><input id="rescueEmail" class="input" style="${inputStyle}" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"></div><div class="field"><label>Password</label><input id="rescuePassword" class="input" style="${inputStyle}" type="password" autocomplete="current-password"></div><button id="rescueLogin" type="button" class="btn" style="width:100%">Login</button><div style="margin-top:14px"><a href="#/forgot">Forgot password?</a> · <a href="#/register">Create account</a></div><div id="rescueMsg"></div></div></div>`;
    $('#rescueLogin').onclick=async()=>{const b=$('#rescueLogin');try{const email=$('#rescueEmail').value.trim(),password=$('#rescuePassword').value;if(!email||!password)return message('Enter your email and password.');b.disabled=true;b.textContent='Logging in…';const s=await client();const r=await s.auth.signInWithPassword({email,password});if(r.error)throw r.error;window.session=r.data.session;nav();location.hash='#/';location.reload()}catch(e){message(e.message)}finally{b.disabled=false;b.textContent='Login'}};
  }
  function renderRegister(){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Create Nexora-India account</h2><div class="field"><label>Full name</label><input id="rescueName" class="input" style="${inputStyle}" autocomplete="name"></div><div class="field"><label>Mobile</label><input id="rescuePhone" class="input" style="${inputStyle}" inputmode="tel" autocomplete="tel"></div><div class="field"><label>Email</label><input id="rescueEmail" class="input" style="${inputStyle}" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"></div><div class="field"><label>Password</label><input id="rescuePassword" class="input" style="${inputStyle}" type="password" minlength="8" autocomplete="new-password"></div><button id="rescueRegister" type="button" class="btn" style="width:100%">Register</button><div style="margin-top:14px">Already registered? <a href="#/login">Login</a></div><div id="rescueMsg"></div></div></div>`;
    $('#rescueRegister').onclick=async()=>{const b=$('#rescueRegister');try{const email=$('#rescueEmail').value.trim(),password=$('#rescuePassword').value,name=$('#rescueName').value.trim(),phone=$('#rescuePhone').value.trim();if(!email||!password)return message('Email and password are required.');if(password.length<8)return message('Password must be at least 8 characters.');b.disabled=true;b.textContent='Creating account…';const s=await client();const r=await s.auth.signUp({email,password,options:{data:{full_name:name,phone}}});if(r.error)throw r.error;app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Verify your email</h2><p>We sent an 8-digit verification code to <b>${esc(email)}</b>.</p><div class="field"><label>8-digit OTP</label><input id="rescueOtp" class="input" style="${inputStyle}" inputmode="numeric" maxlength="8" autocomplete="one-time-code"></div><button id="rescueVerify" type="button" class="btn" style="width:100%">Verify email</button><div id="rescueMsg"></div></div></div>`;$('#rescueVerify').onclick=async()=>{try{const code=$('#rescueOtp').value.trim();if(!/^\d{8}$/.test(code))return message('Enter the 8-digit OTP.');const x=await s.auth.verifyOtp({email,token:code,type:'email'});if(x.error)throw x.error;location.hash='#/';location.reload()}catch(e){message(e.message)}}}catch(e){message(e.message)}finally{b.disabled=false;b.textContent='Register'}};
  }
  function renderForgot(){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Reset password</h2><div class="field"><label>Email</label><input id="rescueEmail" class="input" style="${inputStyle}" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"></div><button id="rescueReset" type="button" class="btn" style="width:100%">Send reset OTP</button><div style="margin-top:14px"><a href="#/login">Back to login</a></div><div id="rescueMsg"></div></div></div>`;
    $('#rescueReset').onclick=async()=>{try{const email=$('#rescueEmail').value.trim();if(!email)return message('Enter your registered email.');const s=await client();const r=await s.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#/forgot'});if(r.error)throw r.error;message('Password reset code sent. Check your email.','success')}catch(e){message(e.message)}};
  }
  let lastRescueHash='';
  function ensureRoute(){
    nav();
    const h=location.hash||'#/';
    if(h===lastRescueHash)return;
    lastRescueHash=h;
    const app=$('#app');
    // The main app owns normal routes. Rescue only renders if the main router failed to populate #app.
    if(!app||app.innerHTML.trim())return;
    if(h==='#/login')renderLogin();
    else if(h==='#/register')renderRegister();
    else if(h==='#/forgot')renderForgot();
    else if(app)app.innerHTML='<div class="container"><div class="panel"><h2>Welcome to Nexora-India</h2><p>The store is loading. Please refresh once if products do not appear.</p><a class="btn" href="#/login">Login / Register</a></div></div>';
  }
  document.addEventListener('click',e=>{const a=e.target.closest('#loginLink');if(a){e.preventDefault();e.stopImmediatePropagation();location.hash='#/login';setTimeout(ensureRoute,0)}},true);
  window.addEventListener('hashchange',()=>setTimeout(ensureRoute,20));
  setTimeout(ensureRoute,900);
})();

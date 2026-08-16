/* Nexora-India auth/navigation hardening. Runs independently so login never depends on the main router. */
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
    let logged=!!window.session;
    if(!logged){try{logged=!!JSON.parse(localStorage.getItem('supabase.auth.token')||'null')}catch(e){}}
    if(cart)cart.hidden=!logged;
    if(login)login.hidden=logged;
    if(orders)orders.hidden=!logged;
    if(account)account.hidden=!logged;
    if(logout)logout.hidden=!logged;
  }
  function renderLogin(){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Login to Nexora-India</h2><div class="field"><label>Email</label><input id="rescueEmail" class="input" type="email" autocomplete="email"></div><div class="field"><label>Password</label><input id="rescuePassword" class="input" type="password" autocomplete="current-password"></div><button id="rescueLogin" class="btn" style="width:100%">Login</button><button id="rescueGoogle" class="btn secondary" style="width:100%;margin-top:10px">Continue with Google</button><div style="margin-top:14px"><a href="#/forgot">Forgot password?</a> · <a href="#/register">Create account</a></div><div id="rescueMsg"></div></div></div>`;
    $('#rescueLogin').onclick=async()=>{const b=$('#rescueLogin');try{b.disabled=true;b.textContent='Logging in…';const s=await client();const r=await s.auth.signInWithPassword({email:$('#rescueEmail').value.trim(),password:$('#rescuePassword').value});if(r.error)throw r.error;window.session=r.data.session;nav();location.hash='#/';location.reload()}catch(e){message(e.message)}finally{b.disabled=false;b.textContent='Login'}};
    $('#rescueGoogle').onclick=async()=>{try{const s=await client();const r=await s.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/#/'}});if(r.error)throw r.error}catch(e){message(e.message)}};
  }
  function renderRegister(){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Create Nexora-India account</h2><div class="field"><label>Full name</label><input id="rescueName" class="input"></div><div class="field"><label>Mobile</label><input id="rescuePhone" class="input" inputmode="tel"></div><div class="field"><label>Email</label><input id="rescueEmail" class="input" type="email" autocomplete="email"></div><div class="field"><label>Password</label><input id="rescuePassword" class="input" type="password" minlength="8" autocomplete="new-password"></div><button id="rescueRegister" class="btn" style="width:100%">Register</button><div style="margin-top:14px">Already registered? <a href="#/login">Login</a></div><div id="rescueMsg"></div></div></div>`;
    $('#rescueRegister').onclick=async()=>{const b=$('#rescueRegister');try{b.disabled=true;b.textContent='Creating account…';const email=$('#rescueEmail').value.trim(),password=$('#rescuePassword').value,name=$('#rescueName').value.trim(),phone=$('#rescuePhone').value.trim();if(!email||!password)return message('Email and password are required.');if(password.length<8)return message('Password must be at least 8 characters.');const s=await client();const r=await s.auth.signUp({email,password,options:{data:{full_name:name,phone}}});if(r.error)throw r.error;app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Verify your email</h2><p>We sent an 8-digit verification code to <b>${esc(email)}</b>.</p><div class="field"><label>8-digit OTP</label><input id="rescueOtp" class="input" inputmode="numeric" maxlength="8" autocomplete="one-time-code"></div><button id="rescueVerify" class="btn" style="width:100%">Verify email</button><div id="rescueMsg"></div></div></div>`;$('#rescueVerify').onclick=async()=>{try{const code=$('#rescueOtp').value.trim();if(!/^\d{8}$/.test(code))return message('Enter the 8-digit OTP.');const x=await s.auth.verifyOtp({email,token:code,type:'email'});if(x.error)throw x.error;location.hash='#/';location.reload()}catch(e){message(e.message)}}}catch(e){message(e.message)}finally{b.disabled=false;b.textContent='Register'}};
  }
  function renderForgot(){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:500px;margin:40px auto"><h2>Reset password</h2><div class="field"><label>Email</label><input id="rescueEmail" class="input" type="email" autocomplete="email"></div><button id="rescueReset" class="btn" style="width:100%">Send reset OTP</button><div style="margin-top:14px"><a href="#/login">Back to login</a></div><div id="rescueMsg"></div></div></div>`;
    $('#rescueReset').onclick=async()=>{try{const email=$('#rescueEmail').value.trim();if(!email)return message('Enter your registered email.');const s=await client();const r=await s.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#/forgot'});if(r.error)throw r.error;message('Password reset code sent. Check your email.','success')}catch(e){message(e.message)}};
  }
  function ensureRoute(){
    nav();const h=location.hash||'#/';
    if(h==='#/login')renderLogin();
    else if(h==='#/register')renderRegister();
    else if(h==='#/forgot')renderForgot();
    else if($('#app')&&!$('#app').innerHTML.trim()){$('#app').innerHTML='<div class="container"><div class="panel"><h2>Welcome to Nexora-India</h2><p>The store is loading. Please refresh once if products do not appear.</p><a class="btn" href="#/login">Login / Register</a></div></div>'}
  }
  document.addEventListener('click',e=>{const a=e.target.closest('#loginLink');if(a){e.preventDefault();location.hash='#/login';setTimeout(ensureRoute,0)}},true);
  window.addEventListener('hashchange',()=>setTimeout(ensureRoute,20));
  new MutationObserver(()=>{if(location.hash==='#/login'||location.hash==='#/register'||location.hash==='#/forgot')setTimeout(ensureRoute,0)}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureRoute,700);
})();

/* Nexora-India auth flow: stable email/password login + registration. */
(function(){
  let clientPromise=null;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inputStyle='width:100%;box-sizing:border-box;pointer-events:auto;touch-action:manipulation;user-select:text;-webkit-user-select:text;opacity:1;display:block;';

  async function client(){
    if(!clientPromise) clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.url||!d.key) throw new Error('Authentication configuration is unavailable. Please try again after the latest deployment is live.');
      return supabase.createClient(d.url,d.key);
    });
    return clientPromise;
  }
  function msg(text,type='error'){const m=$('#rescueMsg');if(m)m.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`;}
  function nav(){
    const logged=!!window.session;
    const ids=['cartNav','ordersLink','accountLink','logoutBtn'];
    ids.forEach(id=>{const el=$('#'+id);if(el)el.hidden=!logged;});
    const login=$('#loginLink');if(login)login.hidden=logged;
  }
  function shell(title,body){
    const app=$('#app');
    if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:520px;margin:32px auto">
      <h2 style="margin-top:0">${title}</h2>
      <div style="display:flex;gap:8px;margin:0 0 20px">
        <a href="#/login" class="btn ${location.hash==='#/login'?'':'secondary'}" style="flex:1;text-align:center">Login</a>
        <a href="#/register" class="btn ${location.hash==='#/register'?'':'secondary'}" style="flex:1;text-align:center">Register</a>
      </div>
      ${body}
    </div></div>`;
  }
  function renderLogin(){
    shell('Login to Nexora-India',`
      <div class="field"><label for="rescueEmail">Email</label><input id="rescueEmail" class="input" style="${inputStyle}" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"></div>
      <div class="field"><label for="rescuePassword">Password</label><input id="rescuePassword" class="input" style="${inputStyle}" type="password" autocomplete="current-password"></div>
      <button id="rescueLogin" type="button" class="btn" style="width:100%">Login</button>
      <div style="margin-top:14px;text-align:center"><a href="#/forgot">Forgot password?</a></div>
      <div id="rescueMsg"></div>`);
    $('#rescueLogin').onclick=async()=>{
      const b=$('#rescueLogin');
      try{
        const email=$('#rescueEmail').value.trim(),password=$('#rescuePassword').value;
        if(!email||!password)return msg('Enter your email and password.');
        b.disabled=true;b.textContent='Logging in…';
        const s=await client(),r=await s.auth.signInWithPassword({email,password});
        if(r.error)throw r.error;
        window.session=r.data.session;nav();location.hash='#/';location.reload();
      }catch(e){msg(e.message)}finally{b.disabled=false;b.textContent='Login'}
    };
  }
  function renderRegister(){
    shell('Create Nexora-India account',`
      <div class="field"><label for="rescueName">Full name</label><input id="rescueName" class="input" style="${inputStyle}" autocomplete="name"></div>
      <div class="field"><label for="rescuePhone">Mobile</label><input id="rescuePhone" class="input" style="${inputStyle}" type="tel" inputmode="tel" autocomplete="tel"></div>
      <div class="field"><label for="rescueEmail">Email</label><input id="rescueEmail" class="input" style="${inputStyle}" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"></div>
      <div class="field"><label for="rescuePassword">Password</label><input id="rescuePassword" class="input" style="${inputStyle}" type="password" minlength="8" autocomplete="new-password"></div>
      <button id="rescueRegister" type="button" class="btn" style="width:100%">Register</button>
      <div id="rescueMsg"></div>`);
    $('#rescueRegister').onclick=async()=>{
      const b=$('#rescueRegister');
      try{
        const email=$('#rescueEmail').value.trim(),password=$('#rescuePassword').value,name=$('#rescueName').value.trim(),phone=$('#rescuePhone').value.trim();
        if(!email||!password)return msg('Email and password are required.');
        if(password.length<8)return msg('Password must be at least 8 characters.');
        b.disabled=true;b.textContent='Creating account…';
        const s=await client(),r=await s.auth.signUp({email,password,options:{data:{full_name:name,phone}}});
        if(r.error)throw r.error;
        if(r.data.session){location.hash='#/';location.reload();return;}
        $('#app').innerHTML=`<div class="container"><div class="panel" style="max-width:520px;margin:32px auto"><h2>Verify your email</h2><p>We sent an 8-digit verification code to <b>${esc(email)}</b>.</p><div class="field"><label for="rescueOtp">8-digit OTP</label><input id="rescueOtp" class="input" style="${inputStyle}" inputmode="numeric" maxlength="8" autocomplete="one-time-code"></div><button id="rescueVerify" type="button" class="btn" style="width:100%">Verify email</button><div id="rescueMsg"></div></div></div>`;
        $('#rescueVerify').onclick=async()=>{try{const code=$('#rescueOtp').value.trim();if(!/^\d{8}$/.test(code))return msg('Enter the 8-digit OTP.');const x=await s.auth.verifyOtp({email,token:code,type:'email'});if(x.error)throw x.error;location.hash='#/';location.reload()}catch(e){msg(e.message)}};
      }catch(e){msg(e.message)}finally{b.disabled=false;b.textContent='Register'}
    };
  }
  function renderForgot(){
    shell('Reset password',`<div class="field"><label for="rescueEmail">Email</label><input id="rescueEmail" class="input" style="${inputStyle}" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"></div><button id="rescueReset" type="button" class="btn" style="width:100%">Send reset email</button><div id="rescueMsg"></div>`);
    $('#rescueReset').onclick=async()=>{try{const email=$('#rescueEmail').value.trim();if(!email)return msg('Enter your registered email.');const s=await client(),r=await s.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#/forgot'});if(r.error)throw r.error;msg('Password reset email sent. Check your inbox.','success')}catch(e){msg(e.message)}};
  }
  let renderedHash=null;
  function routeAuth(){
    nav();
    const h=location.hash||'';
    if(h!=='#/login'&&h!=='#/register'&&h!=='#/forgot'){renderedHash=null;return;}
    if(renderedHash===h)return;
    renderedHash=h;
    if(h==='#/login')renderLogin();
    else if(h==='#/register')renderRegister();
    else renderForgot();
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('a,button');if(!el)return;
    const href=(el.getAttribute('href')||'').toLowerCase();
    if(href==='#/login'||href==='#/register'||href==='#/forgot'||el.id==='loginLink'){
      e.preventDefault();e.stopImmediatePropagation();
      const target=el.id==='loginLink'?'#/login':href;
      if(location.hash===target){renderedHash=null;routeAuth();}else{location.hash=target;}
    }
  },true);
  window.addEventListener('hashchange',()=>setTimeout(routeAuth,0));
  setTimeout(routeAuth,900);
})();

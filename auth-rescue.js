/* Nexora-India customer authentication UI. Uses the SAME Supabase client/session as app.js. */
(function(){
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inputStyle='width:100%;box-sizing:border-box;pointer-events:auto;touch-action:manipulation;user-select:text;-webkit-user-select:text;opacity:1;display:block;';
  function client(){return window.sb||null}
  function sync(){window.refreshNav?.()}
  function store(){
    sync();
    if(location.hash!=='#/')history.replaceState(null,'','#/');
    if(typeof window.renderHome==='function')window.renderHome();else window.route?.();
  }
  function notice(text,type='error'){const m=$('#authMsg');if(m)m.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`}
  function shell(title,body){
    const app=$('#app');if(!app)return;
    app.innerHTML=`<div class="container"><div class="panel" style="max-width:520px;margin:32px auto"><h2 style="margin-top:0">${title}</h2><div style="display:flex;gap:8px;margin:0 0 20px"><button id="loginMode" class="btn" style="flex:1">Login</button><button id="registerMode" class="btn secondary" style="flex:1">Register</button></div>${body}</div></div>`;
    $('#loginMode').onclick=()=>{history.replaceState(null,'','#/login');renderLogin()};
    $('#registerMode').onclick=()=>{history.replaceState(null,'','#/register');renderRegister()};
  }
  function renderLogin(){
    if(window.session){store();return}
    shell('Login to Nexora-India',`<div class="field"><label>Email</label><input id="authEmail" class="input" style="${inputStyle}" type="email" autocomplete="email" inputmode="email"></div><div class="field"><label>Password</label><input id="authPassword" class="input" style="${inputStyle}" type="password" autocomplete="current-password"></div><label style="display:flex;align-items:center;gap:8px;margin:8px 0 16px"><input type="checkbox" id="rememberMe" style="width:18px;height:18px"><span>Remember me</span></label><button id="authLogin" class="btn" type="button" style="width:100%">Login</button><div style="margin-top:14px;text-align:center"><a href="#/forgot">Forgot password?</a></div><div id="authMsg"></div>`);
    const submit=async()=>{
      const b=$('#authLogin'),s=client();
      if(!s){notice('Authentication service is not ready.');return}
      const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
      if(!email||!password){notice('Enter your email and password.');return}
      b.disabled=true;b.textContent='Logging in…';
      try{
        const r=await s.auth.signInWithPassword({email,password});
        if(r.error)throw r.error;
        const current=r.data.session||(await s.auth.getSession()).data.session;
        if(!current)throw new Error('Login succeeded but no active session was returned.');
        window.session=current;window.sb=s;sync();store();
      }catch(e){notice(e.message||'Login failed.')}finally{b.disabled=false;b.textContent='Login'}
    };
    $('#authLogin').onclick=submit;
    $('#authEmail').onkeydown=e=>{if(e.key==='Enter')submit()};
    $('#authPassword').onkeydown=e=>{if(e.key==='Enter')submit()};
  }
  function renderRegister(){
    if(window.session){store();return}
    shell('Create Nexora-India account',`<div class="field"><label>Full name</label><input id="regName" class="input" style="${inputStyle}"></div><div class="field"><label>Mobile</label><input id="regPhone" class="input" style="${inputStyle}" type="tel" inputmode="tel"></div><div class="field"><label>Email</label><input id="regEmail" class="input" style="${inputStyle}" type="email" autocomplete="email"></div><div class="field"><label>Password</label><input id="regPassword" class="input" style="${inputStyle}" type="password" minlength="8" autocomplete="new-password"></div><button id="registerBtn" class="btn" type="button" style="width:100%">Register</button><div id="authMsg"></div>`);
    $('#registerBtn').onclick=async()=>{
      const b=$('#registerBtn'),s=client();
      if(!s){notice('Authentication service is not ready.');return}
      const email=$('#regEmail').value.trim(),password=$('#regPassword').value;
      if(!email||!password){notice('Email and password are required.');return}
      if(password.length<8){notice('Password must be at least 8 characters.');return}
      b.disabled=true;b.textContent='Creating account…';
      try{
        const r=await s.auth.signUp({email,password,options:{data:{full_name:$('#regName').value.trim(),phone:$('#regPhone').value.trim()}}});
        if(r.error)throw r.error;
        if(r.data.session){window.session=r.data.session;window.sb=s;sync();store();return}
        notice('Registration submitted. Check your email for confirmation if email verification is enabled.','success');
      }catch(e){notice(e.message||'Registration failed.')}finally{b.disabled=false;b.textContent='Register'}
    };
  }
  function renderForgot(){
    if(window.session){store();return}
    shell('Reset password',`<div class="field"><label>Email</label><input id="forgotEmail" class="input" style="${inputStyle}" type="email" autocomplete="email"></div><button id="forgotBtn" class="btn" type="button" style="width:100%">Send reset email</button><div id="authMsg"></div>`);
    $('#forgotBtn').onclick=async()=>{try{const s=client();if(!s)throw new Error('Authentication service is not ready.');const email=$('#forgotEmail').value.trim();if(!email)throw new Error('Enter your registered email.');const r=await s.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#/forgot'});if(r.error)throw r.error;notice('Password reset email sent. Check your inbox.','success')}catch(e){notice(e.message||'Unable to send reset email.')}};
  }
  function routeAuth(){
    const h=location.hash||'#/';
    if(window.session&&(h==='#/login'||h==='#/register'||h==='#/forgot')){store();return}
    if(h==='#/login')renderLogin();else if(h==='#/register')renderRegister();else if(h==='#/forgot')renderForgot();
  }
  window.renderLogin=renderLogin;window.renderRegister=renderRegister;window.renderForgot=renderForgot;
  window.addEventListener('hashchange',routeAuth);setTimeout(routeAuth,0);
})();

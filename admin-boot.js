(()=>{
  'use strict';
  // Single authoritative admin login handler.
  // Submits the password to /api/admin, verifies the HttpOnly cookie was set,
  // then reloads so admin-v2.js boots into the authenticated console.
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy=false;

  async function request(body){
    const r=await fetch('/api/admin',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({error:'Invalid server response'}));
    if(!r.ok||!d.ok)throw new Error(d.error||('Request failed (HTTP '+r.status+')'));
    return d;
  }

  async function login(){
    if(busy)return;
    const form=document.getElementById('loginForm');
    const password=document.getElementById('password');
    const button=document.getElementById('loginBtn');
    const msg=document.getElementById('msg');
    if(!form||!password||!button||!msg)return;

    const pw=password.value;
    if(!pw){msg.innerHTML='<div class="notice error">Enter admin password</div>';password.focus();return;}

    busy=true;
    button.disabled=true;
    button.textContent='Logging in…';
    msg.innerHTML='';

    try{
      await request({action:'login',password:pw});
      await request({action:'session'});
      msg.innerHTML='<div class="notice success">Login successful. Opening admin panel…</div>';
      window.location.replace('/admin.html');
    }catch(e){
      msg.innerHTML='<div class="notice error">'+esc(e.message||e)+'</div>';
      busy=false;
      button.disabled=false;
      button.textContent='Login';
      password.focus();
    }
  }

  function init(){
    const form=document.getElementById('loginForm');
    const button=document.getElementById('loginBtn');
    const password=document.getElementById('password');
    if(!form||!button)return;
    if(form.dataset.adminLoginBound==='1')return;
    form.dataset.adminLoginBound='1';
    form.addEventListener('submit',e=>{e.preventDefault();login();},false);
    button.addEventListener('click',e=>{e.preventDefault();login();},false);
    if(password)password.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();login();}},false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

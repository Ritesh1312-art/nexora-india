(()=>{
  'use strict';
  function init(){
    const oldForm=document.getElementById('loginForm');
    if(!oldForm)return;
    const form=oldForm.cloneNode(true);
    oldForm.replaceWith(form);
    const password=form.querySelector('#password');
    const button=form.querySelector('#loginBtn');
    const msg=form.querySelector('#msg');
    if(!password||!button||!msg)return;
    button.type='button';
    let busy=false;
    const escapeHtml=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
    const show=(text,ok=false)=>{msg.innerHTML='<div class="notice '+(ok?'success':'error')+'">'+escapeHtml(text)+'</div>';};
    async function login(){
      if(busy)return;
      const pw=password.value;
      if(!pw){show('Enter admin password');password.focus();return;}
      busy=true;
      button.disabled=true;
      button.textContent='Logging in…';
      msg.innerHTML='';
      try{
        const r=await fetch('/api/admin-login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','cache-control':'no-cache'},body:JSON.stringify({password:pw})});
        const text=await r.text();
        let data={};
        try{data=JSON.parse(text||'{}')}catch{data={error:'Server returned an invalid response'}}
        if(!r.ok||!data.ok)throw new Error(data.error||('Login failed (HTTP '+r.status+')'));
        if(data.token){
          try{sessionStorage.setItem('nexora_admin_token',data.token)}catch{}
        }
        show('Login successful. Opening admin panel…',true);
        window.location.replace('/admin.html?session=1');
      }catch(e){
        show(e?.message||e);
        busy=false;
        button.disabled=false;
        button.textContent='Login';
        password.focus();
      }
    }
    form.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();login();},true);
    button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();login();},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

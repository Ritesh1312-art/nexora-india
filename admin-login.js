(()=>{
  'use strict';

  function escapeHtml(value){
    return String(value??'').replace(/[&<>\"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function init(){
    const form=document.getElementById('loginForm');
    const password=document.getElementById('password');
    const button=document.getElementById('loginBtn');
    const msg=document.getElementById('msg');
    if(!form||!password||!button||!msg)return;
    if(form.dataset.adminLoginBound==='1')return;
    form.dataset.adminLoginBound='1';

    const show=(text,ok=false)=>{
      msg.innerHTML='<div class="notice '+(ok?'success':'error')+'">'+escapeHtml(text)+'</div>';
    };

    let busy=false;

    async function request(body){
      const response=await fetch('/api/admin',{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        headers:{
          'content-type':'application/json',
          'cache-control':'no-cache'
        },
        body:JSON.stringify(body)
      });
      const text=await response.text();
      let data={};
      try{data=JSON.parse(text||'{}')}catch{
        data={error:'Server returned an invalid response'};
      }
      if(!response.ok||!data.ok){
        throw new Error(data.error||('Request failed (HTTP '+response.status+')'));
      }
      return data;
    }

    async function login(event){
      event?.preventDefault();
      if(busy)return;

      const pw=password.value;
      if(!pw){
        show('Enter admin password');
        password.focus();
        return;
      }

      busy=true;
      button.disabled=true;
      button.textContent='Logging in…';
      msg.innerHTML='';

      try{
        // Use the single authoritative admin endpoint. Authentication is cookie-based;
        // no sessionStorage token or second login endpoint is required.
        await request({action:'login',password:pw});

        // Do not redirect blindly. Verify that the browser can immediately use
        // the freshly issued HttpOnly session cookie. This prevents the old
        // "green success -> login again" loop from being hidden.
        await request({action:'session'});

        show('Login successful. Opening admin panel…',true);
        window.location.replace('/admin.html');
      }catch(error){
        show(error?.message||error);
        busy=false;
        button.disabled=false;
        button.textContent='Login';
        password.focus();
      }
    }

    form.addEventListener('submit',login,false);
    button.addEventListener('click',login,false);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();

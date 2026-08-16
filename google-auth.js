/* Nexora-India: Google Sign-In UI. Provider credentials are configured in Supabase, never in frontend. */
(function(){
 let clientPromise=null;
 async function client(){
  if(!clientPromise) clientPromise=fetch('/api/config').then(r=>r.json()).then(cfg=>{if(!cfg.url||!cfg.key)throw new Error('Authentication configuration unavailable');return supabase.createClient(cfg.url,cfg.key)});
  return clientPromise;
 }
 async function mount(){
  if(location.hash!=='#/login')return;
  const submit=document.querySelector('#submit');
  if(!submit||document.querySelector('#googleSignIn'))return;
  const wrap=document.createElement('div');wrap.style.cssText='margin-top:14px;text-align:center';
  wrap.innerHTML='<div class="muted" style="margin:8px 0">or</div><button id="googleSignIn" type="button" class="btn secondary" style="width:100%">Continue with Google</button><div id="googleMsg"></div>';
  submit.parentNode.appendChild(wrap);
  document.querySelector('#googleSignIn').onclick=async()=>{
   const b=document.querySelector('#googleSignIn'),m=document.querySelector('#googleMsg');b.disabled=true;b.textContent='Connecting to Google…';
   try{const s=await client();const {error}=await s.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/#/'}});if(error)throw error}catch(e){m.innerHTML=`<div class="notice error">${String(e.message||'Google sign-in failed').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>`;b.disabled=false;b.textContent='Continue with Google';}
  };
 }
 window.addEventListener('hashchange',()=>setTimeout(mount,0));
 new MutationObserver(()=>mount()).observe(document.documentElement,{childList:true,subtree:true});
 setTimeout(mount,300);
})();
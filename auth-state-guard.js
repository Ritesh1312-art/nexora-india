/* Nexora-India final auth-state guard. Runs after all app modules and prevents authenticated login UI. */
(function(){
  let clientPromise=null;
  const authHashes=new Set(['#/login','#/register','#/forgot']);
  const $=s=>document.querySelector(s);
  async function client(){
    if(!clientPromise) clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.url||!d.key) throw new Error('Auth config unavailable');
      return supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    });
    return clientPromise;
  }
  function syncNav(logged){
    const login=$('#loginLink'),orders=$('#ordersLink'),account=$('#accountLink'),logout=$('#logoutBtn'),cart=$('#cartNav');
    if(login) login.hidden=logged;
    if(orders) orders.hidden=!logged;
    if(account) account.hidden=!logged;
    if(logout) logout.hidden=!logged;
    if(cart) cart.hidden=!logged;
  }
  function isLoginUI(){
    const app=$('#app');
    if(!app) return false;
    const text=(app.textContent||'').toLowerCase();
    return !!app.querySelector('#rescueLogin,#submit') && (text.includes('login to nexora-india')||text.includes('login'));
  }
  async function enforce(sb){
    const got=await sb.auth.getSession();
    const active=!!got.data.session;
    window.__nexoraAuthenticated=active;
    if(active){
      window.session=got.data.session;
      syncNav(true);
      if(authHashes.has(location.hash) || isLoginUI()){
        if(location.hash!=='#/account') location.hash='#/account';
        setTimeout(()=>{try{window.route?.()}catch(e){}},0);
      }
    }else{
      syncNav(false);
    }
  }
  async function boot(){
    try{
      const sb=await client();
      await enforce(sb);
      sb.auth.onAuthStateChange((_event,session)=>{
        window.session=session||null;
        syncNav(!!session);
        setTimeout(()=>enforce(sb).catch(()=>{}),0);
      });
      setInterval(()=>enforce(sb).catch(()=>{}),500);
      const observer=new MutationObserver(()=>{
        if(window.__nexoraAuthenticated && (authHashes.has(location.hash)||isLoginUI())) enforce(sb).catch(()=>{});
      });
      observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
      window.addEventListener('hashchange',()=>enforce(sb).catch(()=>{}));
    }catch(e){console.warn('Nexora auth-state guard:',e)}
  }
  boot();
})();

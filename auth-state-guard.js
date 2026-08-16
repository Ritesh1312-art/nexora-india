/* Nexora-India final auth + navigation guard. Runs last and owns customer header actions. */
(function(){
  let clientPromise=null;
  const authHashes=new Set(['#/login','#/register','#/forgot']);
  const navHashes=new Set(['#/','#/products','#/cart','#/orders','#/account','#/checkout']);
  const $=s=>document.querySelector(s);
  async function client(){
    if(!clientPromise) clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.url||!d.key)throw new Error('Auth config unavailable');return supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})});
    return clientPromise;
  }
  function syncNav(logged){
    const login=$('#loginLink'),orders=$('#ordersLink'),account=$('#accountLink'),logout=$('#logoutBtn'),cart=$('#cartNav');
    if(login)login.hidden=logged;
    if(orders)orders.hidden=!logged;
    if(account)account.hidden=!logged;
    if(logout)logout.hidden=!logged;
    if(cart)cart.hidden=!logged;
  }
  function routeNow(hash){
    if(location.hash!==hash) location.hash=hash;
    setTimeout(()=>{try{window.route?.()}catch(e){console.error('Nexora route:',e)}},0);
  }
  function isLoginUI(){const app=$('#app');if(!app)return false;const text=(app.textContent||'').toLowerCase();return !!app.querySelector('#rescueLogin,#submit')&&(text.includes('login to nexora-india')||text.includes('login'));}
  async function logout(sb){
    try{await sb.auth.signOut({scope:'local'})}catch(e){console.warn('Supabase logout:',e)}
    window.session=null;syncNav(false);routeNow('#/');
  }
  function installNavigation(sb){
    document.addEventListener('click',async e=>{
      const el=e.target.closest('a,button');if(!el)return;
      const id=el.id||'',href=(el.getAttribute('href')||'').split('?')[0].toLowerCase(),text=(el.textContent||'').trim().toLowerCase();
      const logged=!!window.session;
      if(id==='logoutBtn'||(text==='logout'&&el.closest('.topbar'))){e.preventDefault();e.stopImmediatePropagation();await logout(sb);return}
      let target=null;
      if(id==='loginLink'||href==='#/login'||text==='login / register')target='#/login';
      else if(id==='ordersLink'||href==='#/orders'||text==='my orders')target='#/orders';
      else if(id==='accountLink'||href==='#/account'||text==='account')target='#/account';
      else if(id==='cartNav'||href==='#/cart'||text.startsWith('cart'))target='#/cart';
      else if(href==='#/products'||text==='products')target='#/products';
      else if(href==='#/'||text==='store')target='#/';
      if(!target)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(target==='#/login'&&!logged){routeNow(target);return}
      if(authHashes.has(target)&&logged){routeNow('#/account');return}
      if(!logged&&['#/cart','#/orders','#/account','#/checkout'].includes(target)){routeNow('#/login');return}
      routeNow(target);
    },true);
  }
  async function enforce(sb){
    const got=await sb.auth.getSession(),active=!!got.data.session;
    window.__nexoraAuthenticated=active;window.session=got.data.session||null;syncNav(active);
    if(active&&(authHashes.has(location.hash)||isLoginUI())){routeNow('#/account');}
  }
  async function boot(){
    try{const sb=await client();installNavigation(sb);await enforce(sb);sb.auth.onAuthStateChange((_event,session)=>{window.session=session||null;syncNav(!!session);setTimeout(()=>enforce(sb).catch(()=>{}),0)});setInterval(()=>enforce(sb).catch(()=>{}),1000);const observer=new MutationObserver(()=>{if(window.__nexoraAuthenticated&&(authHashes.has(location.hash)||isLoginUI()))enforce(sb).catch(()=>{})});observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});window.addEventListener('hashchange',()=>enforce(sb).catch(()=>{}));}
    catch(e){console.warn('Nexora auth-state guard:',e)}
  }
  boot();
})();

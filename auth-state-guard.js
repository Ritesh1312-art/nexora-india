/* Nexora-India authoritative auth + navigation controller. Loaded last. */
(function(){
  let clientPromise=null;
  const authHashes=new Set(['#/login','#/register','#/forgot']);
  const protectedHashes=new Set(['#/cart','#/orders','#/account','#/checkout']);
  const $=s=>document.querySelector(s);
  async function client(){
    if(!clientPromise)clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.url||!d.key)throw new Error('Auth config unavailable');return supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})});
    return clientPromise;
  }
  function syncNav(logged){['ordersLink','accountLink','logoutBtn','cartNav'].forEach(id=>{const el=$('#'+id);if(el)el.hidden=!logged});const login=$('#loginLink');if(login)login.hidden=logged;}
  function directStore(){if(location.hash!=='#/')location.hash='#/';setTimeout(()=>{try{if(typeof window.renderHome==='function')window.renderHome();else window.route?.()}catch(e){console.error('Nexora store route:',e)}},0)}
  function route(hash){if(location.hash!==hash)location.hash=hash;setTimeout(()=>{try{window.route?.()}catch(e){console.error('Nexora route:',e)}},0)}
  async function doLogout(sb){try{await sb.auth.signOut({scope:'local'})}catch(e){console.warn('Supabase logout:',e)}window.session=null;try{window.refreshNav?.()}catch(e){}syncNav(false);directStore();}
  function handleNavigation(sb,e){
    const el=e.target.closest('a,button');if(!el)return;
    const id=el.id||'',href=(el.getAttribute('href')||'').split('?')[0].toLowerCase(),text=(el.textContent||'').trim().toLowerCase(),logged=!!window.session;
    const accountLogout=el.dataset?.tab==='logout'||el.matches('.account-nav button[data-tab="logout"]');
    if(id==='logoutBtn'||accountLogout||(text==='logout'&&el.closest('.topbar'))){e.preventDefault();e.stopImmediatePropagation();doLogout(sb);return;}
    let target=null;
    if(id==='loginLink'||href==='#/login'||text==='login / register')target='#/login';
    else if(id==='ordersLink'||href==='#/orders'||text==='my orders')target='#/orders';
    else if(id==='accountLink'||href==='#/account'||text==='account')target='#/account';
    else if(id==='cartNav'||href==='#/cart'||text.startsWith('cart'))target='#/cart';
    else if(href==='#/products'||text==='products')target='#/products';
    else if(href==='#/'||text==='store')target='#/';
    if(!target)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(target==='#/'){directStore();return;}
    if(target==='#/login'&&!logged){route(target);return;}
    if(authHashes.has(target)&&logged){route('#/account');return;}
    if(!logged&&protectedHashes.has(target)){route('#/login');return;}
    route(target);
  }
  async function enforce(sb){const got=await sb.auth.getSession(),active=!!got.data.session;window.__nexoraAuthenticated=active;window.session=got.data.session||null;syncNav(active);if(active&&(authHashes.has(location.hash)||document.querySelector('#rescueLogin')))route('#/account');}
  async function boot(){try{const sb=await client();document.addEventListener('click',e=>handleNavigation(sb,e),true);await enforce(sb);if(!location.hash||location.hash==='#')directStore();sb.auth.onAuthStateChange((_event,s)=>{window.session=s||null;syncNav(!!s);setTimeout(()=>{if(!s)directStore();else enforce(sb).catch(()=>{})},0)});setInterval(()=>enforce(sb).catch(()=>{}),1000);window.addEventListener('hashchange',()=>setTimeout(()=>enforce(sb).catch(()=>{}),0));}catch(e){console.warn('Nexora auth/navigation controller:',e)}}
  boot();
})();

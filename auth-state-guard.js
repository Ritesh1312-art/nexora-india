/* Nexora-India FINAL customer auth + navigation controller. Loaded last. */
(function(){
  let clientPromise=null;
  const authHashes=new Set(['#/login','#/register','#/forgot']);
  const protectedHashes=new Set(['#/cart','#/account','#/checkout']);
  const $=s=>document.querySelector(s);
  async function client(){if(!clientPromise)clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.url||!d.key)throw new Error('Auth config unavailable');return supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})});return clientPromise;}
  function syncNav(logged){const login=$('#loginLink'),account=$('#accountLink'),logout=$('#logoutBtn'),cart=$('#cartNav'),orders=$('#ordersLink');if(login)login.hidden=logged;if(account)account.hidden=!logged;if(logout)logout.hidden=!logged;if(cart)cart.hidden=!logged;if(orders)orders.hidden=true;}
  function store(){window.session=null;syncNav(false);if(location.hash!=='#/')location.hash='#/';setTimeout(()=>{try{if(typeof window.renderHome==='function')window.renderHome();else window.route?.()}catch(e){console.error('Nexora Store render:',e)}},0);}
  function route(hash){if(location.hash!==hash)location.hash=hash;setTimeout(()=>{try{window.route?.()}catch(e){console.error('Nexora route:',e)}},0);}
  async function logout(sb){try{await sb.auth.signOut({scope:'local'})}catch(e){console.warn('Supabase logout:',e)}window.session=null;window.sb=sb;try{window.refreshNav?.()}catch(e){}syncNav(false);store();}
  function handleNavigation(sb,e){
    const el=e.target.closest('a,button');if(!el)return;
    const id=el.id||'',href=(el.getAttribute('href')||'').split('?')[0].toLowerCase(),text=(el.textContent||'').trim().toLowerCase(),logged=!!window.session;
    if(id==='logoutBtn'||(text==='logout'&&el.closest('.topbar'))){e.preventDefault();e.stopImmediatePropagation();logout(sb);return;}
    let target=null;
    if(id==='loginLink'||href==='#/login'||text==='login / register')target='#/login';
    else if(id==='accountLink'||href==='#/account'||text==='account')target='#/account';
    else if(id==='cartNav'||href==='#/cart'||text.startsWith('cart'))target='#/cart';
    else if(href==='#/products'||text==='products')target='#/products';
    else if(href==='#/'||text==='store')target='#/';
    if(!target)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(target==='#/'){if(logged){location.hash='#/';setTimeout(()=>window.route?.(),0)}else store();return;}
    if(target==='#/login'&&!logged){route(target);return;}
    if(authHashes.has(target)&&logged){route('#/account');return;}
    if(!logged&&protectedHashes.has(target)){route('#/login');return;}
    route(target);
  }
  async function enforce(sb){
    const got=await sb.auth.getSession(),active=!!got.data.session;
    window.__nexoraAuthenticated=active;window.session=got.data.session||null;window.sb=sb;syncNav(active);
    if(active&&authHashes.has(location.hash)){route('#/account');return;}
    if(!active&&protectedHashes.has(location.hash)){route('#/login');return;}
  }
  async function boot(){
    try{
      const sb=await client();window.sb=sb;document.addEventListener('click',e=>handleNavigation(sb,e),true);await enforce(sb);
      if(!location.hash||location.hash==='#')store();
      sb.auth.onAuthStateChange((_event,s)=>{window.session=s||null;window.sb=sb;syncNav(!!s);setTimeout(()=>{if(!s)store();else enforce(sb).catch(()=>{})},0)});
      setInterval(()=>enforce(sb).catch(()=>{}),1500);window.addEventListener('hashchange',()=>setTimeout(()=>enforce(sb).catch(()=>{}),0));
    }catch(e){console.warn('Nexora auth/navigation controller:',e)}
  }
  boot();
})();

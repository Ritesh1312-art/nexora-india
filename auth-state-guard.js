/* Nexora-India FINAL navigation controller v8. Header navigation is explicit and deterministic. */
(function(){
  let clientPromise=null,sbRef=null;
  const authHashes=new Set(['#/login','#/register','#/forgot']);
  const protectedHashes=new Set(['#/cart','#/account','#/checkout']);
  const $=s=>document.querySelector(s);
  async function client(){if(!clientPromise)clientPromise=fetch('/api/config',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.url||!d.key)throw new Error('Auth config unavailable');return supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})});return clientPromise}
  function syncNav(logged){const login=$('#loginLink'),account=$('#accountLink'),logout=$('#logoutBtn'),cart=$('#cartNav'),orders=$('#ordersLink');if(login)login.hidden=logged;if(account)account.hidden=!logged;if(logout)logout.hidden=!logged;if(cart)cart.hidden=!logged;if(orders)orders.hidden=true}
  function renderCurrent(){try{if(typeof window.route==='function')window.route()}catch(e){console.error('Nexora route:',e)}}
  function go(hash){if(location.hash===hash){renderCurrent();return}location.hash=hash;setTimeout(renderCurrent,0)}
  function goStore(){syncNav(!!window.session);go('#/');setTimeout(()=>{try{if(typeof window.renderHome==='function')window.renderHome()}catch(e){console.error('Nexora Store:',e)}},30)}
  function goAccount(){if(!window.session){go('#/login');return}go('#/account');setTimeout(renderCurrent,30)}
  function goProducts(){go('#/products');setTimeout(()=>{try{if(typeof window.renderProducts==='function')window.renderProducts()}catch(e){console.error('Nexora Products:',e)}},30)}
  async function logout(){try{if(sbRef)await sbRef.auth.signOut({scope:'local'})}catch(e){console.warn('Supabase logout:',e)}window.session=null;window.__nexoraAuthenticated=false;syncNav(false);goStore()}
  function handleNavigation(e){const el=e.target.closest('a,button');if(!el)return;const id=el.id||'',href=(el.getAttribute('href')||'').split('?')[0].toLowerCase(),text=(el.textContent||'').trim().toLowerCase();if(el.closest('.topbar')){if(id==='logoutBtn'||text==='logout'){e.preventDefault();e.stopImmediatePropagation();logout();return}if(id==='accountLink'||text==='account'){e.preventDefault();e.stopImmediatePropagation();goAccount();return}if(href==='#/'||text==='store'){e.preventDefault();e.stopImmediatePropagation();goStore();return}if(href==='#/products'||text==='products'){e.preventDefault();e.stopImmediatePropagation();goProducts();return}}if(id==='loginLink'||href==='#/login'||text==='login / register'){e.preventDefault();e.stopImmediatePropagation();if(window.session)goStore();else go('#/login');return}if(id==='cartNav'||href==='#/cart'||text.startsWith('cart')){if(!window.session){e.preventDefault();e.stopImmediatePropagation();go('#/login')}}}
  async function enforce(sb){const got=await sb.auth.getSession(),active=!!got.data.session;window.__nexoraAuthenticated=active;window.session=got.data.session||null;window.sb=sb;syncNav(active);if(active&&authHashes.has(location.hash)){goStore();return}if(!active&&protectedHashes.has(location.hash)){go('#/login');return}if(!location.hash||location.hash==='#')goStore()}
  async function boot(){try{const s=await client();sbRef=s;window.sb=s;document.addEventListener('click',handleNavigation,true);await enforce(s);s.auth.onAuthStateChange((_event,session)=>{window.session=session||null;window.sb=s;syncNav(!!session);if(!session)goStore();else if(authHashes.has(location.hash))goStore()});window.addEventListener('hashchange',()=>setTimeout(()=>enforce(s).catch(()=>{}),0))}catch(e){console.warn('Nexora auth/navigation controller:',e)}}
  boot();
})();

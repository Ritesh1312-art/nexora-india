/* Nexora-India FINAL CUSTOMER RUNTIME
   One authoritative customer auth/navigation layer. Loaded after every other customer script. */
(function(){
  'use strict';
  let client=null, ready=false, loggedIn=false, rendering=false;
  const AUTH=new Set(['#/login','#/register','#/forgot']);
  const $=s=>document.querySelector(s);
  function syncHeader(){const show=loggedIn;const ids={loginLink:!show,accountLink:show,cartNav:show,logoutBtn:show,ordersLink:false};Object.keys(ids).forEach(id=>{const e=$('#'+id);if(e)e.hidden=ids[id]})}
  function setHash(h){if(location.hash!==h)history.replaceState(null,'',h)}
  function store(){if(rendering)return;rendering=true;setHash('#/');syncHeader();if(typeof window.renderHome==='function')window.renderHome();rendering=false}
  function products(){if(rendering)return;rendering=true;setHash('#/products');if(typeof window.renderProducts==='function')window.renderProducts();else if(typeof window.route==='function')window.route();rendering=false}
  function cart(){if(!loggedIn){login();return}setHash('#/cart');if(typeof window.route==='function')window.route()}
  function account(){if(!loggedIn){login();return}setHash('#/account');if(typeof window.renderAccount==='function')window.renderAccount();else if(typeof window.route==='function')window.route()}
  function login(){setHash('#/login');if(typeof window.renderLogin==='function')window.renderLogin();else if(typeof window.route==='function')window.route()}
  async function logout(){if(client){try{await client.auth.signOut({scope:'local'})}catch(e){console.warn(e)}}loggedIn=false;window.session=null;syncHeader();store()}
  function target(el){if(!el)return null;const top=el.closest('.topbar');if(!top)return null;const id=el.id,text=(el.textContent||'').trim().toLowerCase(),href=(el.getAttribute('href')||'').split('?')[0];if(id==='logoutBtn')return'logout';if(id==='accountLink'||text==='account')return'account';if(id==='cartNav'||href==='#/cart'||text.startsWith('cart'))return'cart';if(href==='#/products'||text==='products')return'products';if(href==='#/'||text==='store')return'store';if(id==='loginLink')return'login';return null}
  document.addEventListener('click',function(e){const el=e.target.closest('a,button'),t=target(el);if(!t)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(t==='store')return store();if(t==='products')return products();if(t==='cart')return cart();if(t==='account')return account();if(t==='logout')return logout();if(t==='login')return loggedIn?store():login()},true);
  async function boot(){try{const cfg=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());if(!cfg.url||!cfg.key)throw new Error('Missing Supabase configuration');client=supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});window.sb=client;const s=await client.auth.getSession();window.session=s.data.session||null;loggedIn=!!window.session;ready=true;syncHeader();client.auth.onAuthStateChange((_event,session)=>{window.session=session||null;loggedIn=!!session;ready=true;syncHeader();setTimeout(store,0)});if(!location.hash||location.hash==='#'||(loggedIn&&AUTH.has(location.hash)))store()}catch(e){console.error('Nexora customer runtime:',e)}}
  const observer=new MutationObserver(()=>{if(ready&&loggedIn){const app=$('#app');const loginUi=app&&/login to nexora-india/i.test(app.textContent||'');if(AUTH.has(location.hash)||loginUi)store()}syncHeader()});
  const root=$('#app');if(root)observer.observe(root,{childList:true,subtree:true});
  window.NexoraCustomerRuntime={store,products,cart,account,logout,login};boot();
})();

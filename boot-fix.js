/* Nexora-India frontend recovery + private admin entry. */
(function(){
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  // Admin is intentionally not exposed in the public storefront navigation.
  // Keep the dedicated /admin.html entry available only when its URL is known.
  document.addEventListener('click',function(e){
    const el=e.target.closest('a,button');
    if(!el)return;
    const text=(el.textContent||'').trim().toLowerCase();
    const href=(el.getAttribute('href')||'').toLowerCase();
    if(href==='#/admin' || text==='admin'){
      e.preventDefault();
      e.stopImmediatePropagation();
      location.href='/admin.html';
    }
  },true);

  function syncCustomerNav(){
    const login=document.querySelector('#loginLink');
    const orders=document.querySelector('#ordersLink');
    const account=document.querySelector('#accountLink');
    const logout=document.querySelector('#logoutBtn');
    const loggedIn=!!window.session;
    if(login) login.hidden=loggedIn;
    if(orders) orders.hidden=!loggedIn;
    if(account) account.hidden=!loggedIn;
    if(logout) logout.hidden=!loggedIn;
  }

  async function boot(){
    for(let i=0;i<40 && !window.sb;i++) await wait(250);
    if(!window.sb){
      try{ if(typeof window.route==='function') window.route(); }catch(e){console.error(e)}
      syncCustomerNav();
      return;
    }
    window.loadCatalog=async function(){
      try{
        const c=await window.sb.from('categories').select('*').eq('active',true).order('sort_order');
        window.categories=c.data||[];
      }catch(e){console.warn('Categories load skipped:',e);window.categories=[];}
      try{
        const p=await window.sb.from('products').select('id,name,slug,description,image_url,selling_price,stock,category_id').eq('active',true).eq('approved_by_admin',true).order('created_at',{ascending:false});
        if(p.error) throw p.error;
        window.products=p.data||[];
      }catch(e){
        console.warn('Products load failed:',e);
        window.products=[];
      }
    };
    try{await window.loadCatalog();}catch(e){console.error(e)}
    try{window.refreshNav();window.route();}catch(e){console.error(e)}
    syncCustomerNav();
    window.addEventListener('hashchange',()=>setTimeout(syncCustomerNav,0));
    if(window.sb?.auth) window.sb.auth.onAuthStateChange(()=>setTimeout(syncCustomerNav,0));
  }
  window.addEventListener('unhandledrejection',e=>console.warn('Nexora async error:',e.reason));
  boot();
})();

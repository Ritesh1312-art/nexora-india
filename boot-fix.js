/* Nexora-India frontend recovery + private admin entry + homepage UX. */
(function(){
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

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
    const loggedIn=!!(orders && !orders.hidden);
    if(login) login.hidden=loggedIn;
    if(orders) orders.hidden=!loggedIn;
    if(account) account.hidden=!loggedIn;
    if(logout) logout.hidden=!loggedIn;
  }

  function productCard(p){
    const cat=(window.categories||[]).find(c=>c.id===p.category_id);
    const image=p.image_url||'https://placehold.co/700x560?text=Nexora-India';
    return `<article class="home-product-card">
      <div class="home-product-image"><img src="${window.esc(image)}" alt="${window.esc(p.name)}" loading="lazy"><span class="product-source">${window.esc(cat?.name||'Product')}</span></div>
      <div class="home-product-body"><h3>${window.esc(p.name)}</h3><div class="home-price">${window.money(p.selling_price)}</div><div class="home-stock">${p.stock>0?'In stock':'Currently unavailable'}</div><button class="btn home-buy" ${p.stock<1?'disabled':''} onclick="addCart('${p.id}')">Add to cart</button></div>
    </article>`;
  }

  function renderHomepage(){
    const cats=(window.categories||[]).filter(c=>c.active!==false);
    const ps=(window.products||[]).filter(p=>p.active!==false&&p.approved_by_admin!==false);
    const query=(document.querySelector('#homeSearch')?.value||'').trim().toLowerCase();
    const filtered=query?ps.filter(p=>(p.name+' '+(p.description||'')).toLowerCase().includes(query)):ps;
    const categoryCards=cats.slice(0,8).map(c=>`<button class="category-tile" onclick="filterCat('${c.id}')"><div class="category-art"><img src="${window.esc(c.image_url||'https://placehold.co/600x400?text='+encodeURIComponent(c.name))}" alt="${window.esc(c.name)}" loading="lazy"></div><strong>${window.esc(c.name)}</strong><span>Explore products →</span></button>`).join('');
    const featured=filtered.slice(0,8).map(productCard).join('');
    const newer=filtered.slice(8,16).map(productCard).join('');
    document.querySelector('#app').innerHTML=`
      <div class="home-page">
        <section class="home-hero">
          <div class="hero-glow hero-glow-one"></div><div class="hero-glow hero-glow-two"></div>
          <div class="home-hero-copy"><span class="eyebrow">NEXORA-INDIA · SMART SHOPPING</span><h1>Find something you’ll<br><em>love today.</em></h1><p>Discover footwear, daily-use essentials, kitchen appliances, jewellery and more — all in one place.</p>
            <div class="home-search"><span>⌕</span><input id="homeSearch" value="${window.esc(query)}" placeholder="Search products, categories or essentials…" autocomplete="off"><button onclick="renderHomepage()">Search</button></div>
            <div class="hero-actions"><a class="btn" href="#/">Explore store</a><button class="btn secondary" onclick="document.querySelector('.home-categories')?.scrollIntoView({behavior:'smooth'})">Browse categories</button></div>
          </div>
          <div class="hero-showcase"><div class="showcase-card"><span>Curated picks</span><b>${ps.length||0}</b><small>products available</small></div><div class="showcase-orbit">N</div></div>
        </section>

        <section class="home-section home-categories"><div class="section-heading"><div><span class="section-kicker">SHOP BY CATEGORY</span><h2>What are you looking for?</h2></div><span class="section-note">Simple. Clear. One tap away.</span></div><div class="category-grid">${categoryCards||'<div class="empty-state">Categories will appear here as soon as they are active.</div>'}</div></section>

        <section class="home-promo"><div><span class="section-kicker">NEXORA PICKS</span><h2>Everyday finds, picked for you.</h2><p>Browse our latest approved products with clear pricing and stock visibility.</p></div><a class="btn" href="#/">Shop all products</a></section>

        <section class="home-section"><div class="section-heading"><div><span class="section-kicker">FEATURED</span><h2>Popular picks</h2></div><span class="section-note">Fresh from the catalogue</span></div><div class="home-product-grid">${featured||'<div class="empty-state">No products are published yet. Admin can approve products from the dashboard.</div>'}</div></section>

        ${newer?`<section class="home-section"><div class="section-heading"><div><span class="section-kicker">NEW ARRIVALS</span><h2>Just added</h2></div></div><div class="home-product-grid">${newer}</div></section>`:''}

        <section class="home-trust"><div><span>✓</span><div><b>Clear pricing</b><small>No confusing price presentation.</small></div></div><div><span>✓</span><div><b>Secure checkout</b><small>Protected account and order flow.</small></div></div><div><span>✓</span><div><b>Order visibility</b><small>Track your orders from your account.</small></div></div></section>
      </div>`;
    const input=document.querySelector('#homeSearch');
    if(input){input.addEventListener('keydown',e=>{if(e.key==='Enter')renderHomepage();});}
  }

  async function boot(){
    for(let i=0;i<40 && !window.sb;i++) await wait(250);
    if(!window.sb){
      try{if(typeof window.route==='function')window.route();}catch(e){console.error(e)}
      syncCustomerNav(); return;
    }
    if(typeof window.refreshNav==='function'){
      const originalRefreshNav=window.refreshNav;
      window.refreshNav=function(){originalRefreshNav();syncCustomerNav();};
    }
    window.loadCatalog=async function(){
      try{const c=await window.sb.from('categories').select('*').eq('active',true).order('sort_order');window.categories=c.data||[];}catch(e){console.warn('Categories load skipped:',e);window.categories=[];}
      try{const p=await window.sb.from('products').select('id,name,slug,description,image_url,selling_price,stock,category_id,active,approved_by_admin,created_at').eq('active',true).eq('approved_by_admin',true).order('created_at',{ascending:false});if(p.error)throw p.error;window.products=p.data||[];}catch(e){console.warn('Products load failed:',e);window.products=[];}
    };
    try{await window.loadCatalog();}catch(e){console.error(e)}
    window.renderHome=renderHomepage;
    try{window.refreshNav();window.route();}catch(e){console.error(e)}
    syncCustomerNav();
    window.addEventListener('hashchange',()=>setTimeout(syncCustomerNav,0));
  }
  window.addEventListener('unhandledrejection',e=>console.warn('Nexora async error:',e.reason));
  boot();
})();

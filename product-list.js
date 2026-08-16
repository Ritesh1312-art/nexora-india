/* Nexora-India Point 2: product listing, search, filter and sort UX. */
(function(){
  const esc=window.esc||((v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const money=window.money||((n)=>'₹'+Number(n||0).toLocaleString('en-IN'));
  let state={q:'',cat:'',min:'',max:'',stock:false,sort:'newest'};
  function products(){return (window.products||[]).filter(p=>p.active!==false&&p.approved_by_admin!==false)}
  function cats(){return (window.categories||[]).filter(c=>c.active!==false)}
  function apply(){
    let a=products();
    const q=state.q.trim().toLowerCase();
    if(q)a=a.filter(p=>(p.name+' '+(p.description||'')).toLowerCase().includes(q));
    if(state.cat)a=a.filter(p=>p.category_id===state.cat);
    if(state.min!=='')a=a.filter(p=>Number(p.selling_price)>=Number(state.min));
    if(state.max!=='')a=a.filter(p=>Number(p.selling_price)<=Number(state.max));
    if(state.stock)a=a.filter(p=>Number(p.stock)>0);
    if(state.sort==='price_asc')a.sort((x,y)=>Number(x.selling_price)-Number(y.selling_price));
    else if(state.sort==='price_desc')a.sort((x,y)=>Number(y.selling_price)-Number(x.selling_price));
    else if(state.sort==='name')a.sort((x,y)=>String(x.name).localeCompare(String(y.name)));
    else if(state.sort==='stock')a.sort((x,y)=>Number(y.stock)-Number(x.stock));
    else a.sort((x,y)=>new Date(y.created_at||0)-new Date(x.created_at||0));
    return a;
  }
  function card(p){const c=cats().find(x=>x.id===p.category_id);return `<article class="listing-card"><a class="listing-image" href="#/product/${encodeURIComponent(p.id)}"><img src="${esc(p.image_url||'https://placehold.co/700x560?text=Nexora-India')}" alt="${esc(p.name)}" loading="lazy">${Number(p.stock)<=0?'<span class="out-badge">Out of stock</span>':''}</a><div class="listing-body"><span class="listing-cat">${esc(c?.name||'Product')}</span><h3>${esc(p.name)}</h3><div class="listing-price">${money(p.selling_price)}</div><div class="listing-stock">${Number(p.stock)>0?`${esc(String(p.stock))} available`:'Currently unavailable'}</div><button class="btn" ${Number(p.stock)<=0?'disabled':''} onclick="addCart('${p.id}')">Add to cart</button></div></article>`}
  function render(){
    const a=apply(), cs=cats();
    const active=[];if(state.q)active.push(`Search: ${esc(state.q)}`);if(state.cat){const c=cs.find(x=>x.id===state.cat);if(c)active.push(esc(c.name))}if(state.min!==''||state.max!=='')active.push(`₹${state.min||0}–₹${state.max||'∞'}`);if(state.stock)active.push('In stock');
    document.querySelector('#app').innerHTML=`<div class="listing-page"><section class="listing-head"><div><span class="section-kicker">SHOPPING</span><h1>All Products</h1><p>Find the right product quickly with search, filters and sorting.</p></div><button class="btn secondary" onclick="renderCart()">Cart (${(window.cart||[]).reduce((s,x)=>s+x.qty,0)})</button></section><div class="listing-toolbar"><div class="listing-search"><span>⌕</span><input id="listQ" value="${esc(state.q)}" placeholder="Search products…"><button class="btn" id="listSearch">Search</button></div><button class="filter-toggle btn secondary" onclick="document.querySelector('.listing-filters').classList.toggle('open')">☰ Filters</button><label class="sort-label">Sort <select id="sortSelect"><option value="newest">Newest</option><option value="price_asc">Price: Low to high</option><option value="price_desc">Price: High to low</option><option value="name">Name</option><option value="stock">Availability</option></select></label></div>${active.length?`<div class="active-filters">${active.map(x=>`<span>${x}</span>`).join('')}<button onclick="window.listClear()">Clear all</button></div>`:''}<div class="listing-layout"><aside class="listing-filters"><div class="filter-head"><b>Filter products</b><button onclick="window.listClear()">Clear</button></div><div class="filter-group"><b>Category</b>${cs.map(c=>`<label><input type="checkbox" ${state.cat===c.id?'checked':''} onchange="window.listCat('${c.id}',this.checked)"> ${esc(c.name)}</label>`).join('')}</div><div class="filter-group"><b>Price</b><div class="price-inputs"><input id="minPrice" type="number" min="0" placeholder="Min" value="${esc(state.min)}"><input id="maxPrice" type="number" min="0" placeholder="Max" value="${esc(state.max)}"></div><button class="btn secondary apply-price" onclick="window.listPrice()">Apply</button></div><div class="filter-group"><label class="check-row"><input id="stockOnly" type="checkbox" ${state.stock?'checked':''} onchange="window.listStock(this.checked)"> In stock only</label></div></aside><main class="listing-results"><div class="result-summary"><b>${a.length}</b> product${a.length===1?'':'s'} found</div><div class="listing-grid">${a.map(card).join('')||'<div class="empty-state">No products match these filters.<br><button class="btn secondary" onclick="window.listClear()">Clear filters</button></div>'}</div></main></div></div>`;
    const q=document.querySelector('#listQ');q?.addEventListener('keydown',e=>{if(e.key==='Enter'){state.q=q.value;render()}});document.querySelector('#listSearch')?.addEventListener('click',()=>{state.q=q.value;render()});document.querySelector('#sortSelect').value=state.sort;document.querySelector('#sortSelect').onchange=e=>{state.sort=e.target.value;render()};
  }
  window.listCat=(id,on)=>{state.cat=on?id:'';render()};window.listPrice=()=>{state.min=document.querySelector('#minPrice')?.value||'';state.max=document.querySelector('#maxPrice')?.value||'';render()};window.listStock=on=>{state.stock=!!on;render()};window.listClear=()=>{state={q:'',cat:'',min:'',max:'',stock:false,sort:'newest'};render()};
  function route(){const h=location.hash||'#/';if(h==='#/products'||h.startsWith('#/products?')||h.startsWith('#/category/')){const m=h.match(/^#\/category\/([^?]+)/);if(m)state.cat=decodeURIComponent(m[1]);const qs=h.includes('?')?new URLSearchParams(h.split('?')[1]):null;if(qs?.get('q')!==null)state.q=qs.get('q')||'';render();return true}return false}
  const oldRoute=window.route;window.route=function(){if(route())return;return oldRoute&&oldRoute()};
  const oldRenderHome=window.renderHome;const oldFilter=window.filterCat;window.filterCat=function(id){state={q:'',cat:id,min:'',max:'',stock:false,sort:'newest'};location.hash='#/category/'+encodeURIComponent(id)};
  window.addEventListener('hashchange',()=>route());
  function boot(){if(window.sb){window.renderHome=window.renderHome;const original=window.renderHomepage;if(original){const origFn=original;}}}
  boot();
})();

/* Nexora-India customer navigation bridge: Store / Products / Account / Logout. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  let clientPromise=null, productCache=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  async function client(){
    if(window.sb)return window.sb;
    if(!clientPromise) clientPromise=fetch('/api/config',{cache:'no-store'}).then(r=>r.json()).then(cfg=>{if(!cfg.url||!cfg.key)throw Error('Authentication service is not configured.');window.sb=supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});return window.sb;});
    return clientPromise;
  }
  async function session(){const s=await client();const r=await s.auth.getSession();window.session=r.data.session||null;return window.session}
  function store(){history.replaceState(null,'','#/');if(typeof window.renderHome==='function')window.renderHome();}
  async function products(){
    const s=await client();
    if(!productCache){
      const p=await s.from('products').select('id,name,description,image_url,selling_price,stock,category_id').eq('active',true).eq('approved_by_admin',true).order('created_at',{ascending:false});
      productCache=p.data||[];
    }
    const cards=productCache.map(p=>`<article class="card"><img src="${esc(p.image_url||'https://placehold.co/600x500?text=Nexora-India')}" alt=""><div class="card-body"><h3>${esc(p.name)}</h3><div class="price">${money(p.selling_price)}</div><div class="muted">${p.stock>0?p.stock+' available':'Out of stock'}</div><button class="btn" ${p.stock<1?'disabled':''} onclick="addCart('${p.id}')">Add to cart</button></div></article>`).join('');
    $('#app').innerHTML=`<div class="container"><div class="between"><h2>Products</h2><a class="btn secondary" href="#/">Store</a></div><div class="grid">${cards||'<div class="panel">No products are live yet.</div>'}</div></div>`;
  }
  async function account(){if(!(await session())){location.hash='#/login';return;} if(typeof window.renderAccount==='function')return window.renderAccount();location.hash='#/account';}
  async function logout(){try{const s=await client();await s.auth.signOut();}catch(e){console.error(e)}window.session=null;store();}
  function bind(){
    const map=[['storeLink','#/'],['productsLink','#/products'],['accountLink','#/account']];map.forEach(([id,href])=>{const e=$('#'+id);if(e)e.setAttribute('href',href)});
    document.addEventListener('click',e=>{const el=e.target.closest('a,button');if(!el)return;const id=el.id||'';const t=(el.textContent||'').trim().toLowerCase();if(id==='logoutBtn'||t==='logout'){e.preventDefault();e.stopImmediatePropagation();logout();return;}if(id==='productsLink'||t==='products'){e.preventDefault();e.stopImmediatePropagation();history.replaceState(null,'','#/products');products();return;}if(id==='accountLink'||t==='account'||t==='my account'){e.preventDefault();e.stopImmediatePropagation();account();return;}if(id==='storeLink'||t==='store'){e.preventDefault();e.stopImmediatePropagation();store();return;}},true);
    window.renderProducts=products;
    window.addEventListener('hashchange',()=>{const h=location.hash;if(h==='#/products')products();else if(h==='#/account')account();else if(h==='#/')store();});
  }
  setTimeout(bind,0);
})();

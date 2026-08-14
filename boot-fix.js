/* Nexora-India frontend recovery patch: render a safe catalog even if the legacy catalog query fails. */
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const $=s=>document.querySelector(s);
  let client=null,products=[],categories=[];
  function render(){
    const app=$('#app');if(!app)return;
    const cards=products.map(p=>`<article class="card"><img src="${esc(p.image_url||'https://placehold.co/600x500?text=Nexora-India')}" alt=""><div class="card-body"><div class="muted">${esc(categories.find(c=>c.id===p.category_id)?.name||'')}</div><h3>${esc(p.name)}</h3><div class="price">${money(p.selling_price)}</div><div class="muted">${Number(p.stock)>0?esc(p.stock)+' available':'Out of stock'}</div></div></article>`).join('');
    app.innerHTML=`<div class="container"><section class="hero"><h1>Nexora-India</h1><p>Smart finds across footwear, daily use, kitchen appliances and artificial jewellery.</p></section><div class="between"><h2>Products</h2><a class="btn secondary" href="#/admin">Admin</a></div><div class="grid">${cards||'<div class="panel">Store is connected, but no approved products are live yet.</div>'}</div></div>`;
  }
  async function boot(){
    try{
      const cfg=await fetch('/api/config').then(r=>r.json());
      if(cfg.url&&cfg.key&&window.supabase)client=window.supabase.createClient(cfg.url,cfg.key);
      if(client){
        const c=await client.from('categories').select('*').eq('active',true).order('sort_order');
        categories=c.data||[];
        const p=await client.from('products').select('id,name,slug,description,image_url,selling_price,stock,category_id').eq('active',true).eq('approved_by_admin',true).order('created_at',{ascending:false});
        if(p.error)throw p.error;
        products=p.data||[];
      }
    }catch(e){console.error('Nexora recovery:',e)}
    render();
  }
  boot();
})();

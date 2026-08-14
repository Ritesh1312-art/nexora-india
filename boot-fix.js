/* Nexora-India frontend recovery patch. Keeps the existing app intact but prevents a catalog-query failure from leaving a blank page. */
(function(){
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function boot(){
    for(let i=0;i<40 && !window.sb;i++) await wait(250);
    if(!window.sb){
      try{ if(typeof window.route==='function') window.route(); }catch(e){console.error(e)}
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
  }
  window.addEventListener('unhandledrejection',e=>console.warn('Nexora async error:',e.reason));
  boot();
})();

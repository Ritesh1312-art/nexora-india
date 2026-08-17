/* Nexora-India: admin product editor + Gemini description generation. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sb=()=>window.sb;
  let observerStarted=false;

  function notice(text,type='success'){
    const e=$('#productEditorMsg'); if(e)e.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`;
  }
  function close(){const e=$('#productEditorModal');if(e)e.remove()}

  async function open(id){
    if(!sb())return alert('Authentication service is not ready.');
    const [{data:p,error:pe},{data:cats,error:ce}]=await Promise.all([
      sb().from('products').select('*').eq('id',id).single(),
      sb().from('categories').select('id,name,active').eq('active',true).order('sort_order').order('name')
    ]);
    if(pe)return alert(pe.message);
    if(ce)return alert(ce.message);
    const modal=document.createElement('div');modal.id='productEditorModal';modal.className='modal-backdrop';
    modal.innerHTML=`<div class="modal-card" style="max-width:900px;width:94vw;max-height:92vh;overflow:auto"><div class="between"><div><span class="section-kicker">PRODUCT EDITOR</span><h2>Edit Product</h2></div><button id="peClose" class="btn secondary" type="button">Close</button></div><div id="productEditorMsg"></div><div class="admin-form">
      <div class="field full"><label>Product Name</label><input id="peName" class="input" value="${esc(p.name)}"></div>
      <div class="field"><label>SKU</label><input id="peSku" class="input" value="${esc(p.sku)}"></div>
      <div class="field"><label>Category</label><select id="peCategory" class="input"><option value="">Select category</option>${(cats||[]).map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(p.category_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>MRP ₹</label><input id="peMrp" class="input" type="number" step="0.01" value="${p.mrp??''}"></div>
      <div class="field"><label>Selling Price ₹</label><input id="pePrice" class="input" type="number" step="0.01" value="${p.selling_price??''}"></div>
      <div class="field"><label>Stock</label><input id="peStock" class="input" type="number" min="0" value="${p.stock??0}"></div>
      <div class="field full"><label>Product Image URL</label><input id="peImage" class="input" value="${esc(p.image_url)}" placeholder="Public image URL"></div>
      <div class="field full"><label>Description</label><div style="display:flex;gap:8px;align-items:flex-start"><textarea id="peDescription" class="input" rows="14" style="flex:1">${esc(p.description)}</textarea><button id="peGenerate" class="btn" type="button">✨ Generate with Gemini</button></div><small class="muted">Gemini analyzes the product data and, when the image URL is accessible, the product image. It will not intentionally invent unsupported specifications.</small></div>
      <div class="field"><label><input id="peFeatured" type="checkbox" ${p.featured?'checked':''}> Featured</label></div>
      <div class="field"><label><input id="peActive" type="checkbox" ${p.active?'checked':''}> Active</label></div>
      <div class="field"><label><input id="peApproved" type="checkbox" ${p.approved_by_admin?'checked':''}> Approved / Live</label></div>
    </div><div class="admin-actions"><button id="peSave" class="btn" type="button">Save Product</button><button id="peSaveLive" class="btn" type="button">Save & Live</button></div></div>`;
    document.body.appendChild(modal);
    $('#peClose').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close()});
    $('#peGenerate').onclick=async()=>{
      const b=$('#peGenerate');b.disabled=true;b.textContent='Generating…';notice('Gemini is analyzing the product…','success');
      try{
        const sess=window.session?.access_token?window.session:((await sb().auth.getSession()).data.session);
        if(!sess)throw Error('Admin session expired. Please log in again.');
        const r=await fetch('/api/generate-product-description',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${sess.access_token}`},body:JSON.stringify({product:{...p,name:$('#peName').value,sku:$('#peSku').value,category_name:$('#peCategory').selectedOptions[0]?.textContent,image_url:$('#peImage').value,description:$('#peDescription').value,mrp:$('#peMrp').value,selling_price:$('#pePrice').value,stock:$('#peStock').value}})});
        const d=await r.json();if(!r.ok)throw Error(d.error||'Generation failed.');$('#peDescription').value=d.description;notice('Description generated. Review it and then save the product.');
      }catch(e){notice(e.message,'error')}finally{b.disabled=false;b.textContent='✨ Generate with Gemini'}
    };
    async function save(live){
      const b=live?$('#peSaveLive'):$('#peSave');b.disabled=true;
      const payload={name:$('#peName').value.trim(),sku:$('#peSku').value.trim()||null,category_id:$('#peCategory').value||null,mrp:Number($('#peMrp').value)||0,selling_price:Number($('#pePrice').value)||0,stock:Math.max(0,parseInt($('#peStock').value,10)||0),image_url:$('#peImage').value.trim()||null,description:$('#peDescription').value.trim()||null,featured:$('#peFeatured').checked,active:live?true:$('#peActive').checked,approved_by_admin:live?true:$('#peApproved').checked};
      const r=await sb().from('products').update(payload).eq('id',id);if(r.error)notice(r.error.message,'error');else{notice(live?'Product saved and LIVE.':'Product saved.');setTimeout(close,500);if(typeof window.refreshAdminProducts==='function')window.refreshAdminProducts()};b.disabled=false;
    }
    $('#peSave').onclick=()=>save(false);$('#peSaveLive').onclick=()=>save(true);
  }

  function enhance(){
    const panel=$('#adminPanel');if(!panel)return;
    if(!panel.querySelector('[data-saveprod]'))return;
    if(panel.dataset.productEditorEnhanced==='1')return;
    panel.dataset.productEditorEnhanced='1';
    const heading=panel.querySelector('h2');
    if(heading&& !panel.querySelector('#addProductSoon')){const wrap=document.createElement('div');wrap.className='admin-toolbar';wrap.style.marginBottom='12px';wrap.innerHTML='<button id="addProductSoon" class="btn" type="button">+ Add Product</button><span class="muted">Use Edit to manage full product details and AI description.</span>';heading.after(wrap);}
    panel.querySelectorAll('[data-saveprod]').forEach(b=>{
      const id=b.dataset.saveprod;const edit=document.createElement('button');edit.className='btn small secondary';edit.type='button';edit.textContent='Edit';edit.dataset.editProduct=id;edit.onclick=()=>open(id);b.after(document.createTextNode(' '),edit);
    });
    const reload=$('#prodReload');if(reload)window.refreshAdminProducts=()=>reload.click();
    const add=$('#addProductSoon');if(add)add.onclick=()=>alert('Add Product form will be enabled in the Products tab next. The current Edit flow is ready, including Gemini description generation.');
  }
  function start(){if(observerStarted)return;observerStarted=true;const mo=new MutationObserver(enhance);mo.observe(document.body,{childList:true,subtree:true});setTimeout(enhance,300)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

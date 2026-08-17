/* Nexora-India: complete admin product create/edit + Gemini description generation. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sb=()=>window.sb;
  let observerStarted=false;
  const notice=(text,type='success')=>{const e=$('#productEditorMsg');if(e)e.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`};
  const close=()=>$('#productEditorModal')?.remove();
  async function categories(){const r=await sb().from('categories').select('id,name,active').eq('active',true).order('sort_order').order('name');if(r.error)throw r.error;return r.data||[]}
  function form(p,cats,edit){
    const x=p||{};
    return `<div class="modal-card" style="max-width:900px;width:94vw;max-height:92vh;overflow:auto"><div class="between"><div><span class="section-kicker">PRODUCT ${edit?'EDITOR':'CREATE'}</span><h2>${edit?'Edit Product':'Add Product'}</h2></div><button id="peClose" class="btn secondary" type="button">Close</button></div><div id="productEditorMsg"></div><div class="admin-form">
      <div class="field full"><label>Product Name *</label><input id="peName" class="input" value="${esc(x.name)}"></div>
      <div class="field"><label>SKU</label><input id="peSku" class="input" value="${esc(x.sku)}"></div>
      <div class="field"><label>Category *</label><select id="peCategory" class="input"><option value="">Select category</option>${cats.map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(x.category_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>MRP ₹</label><input id="peMrp" class="input" type="number" min="0" step="0.01" value="${x.mrp??''}"></div>
      <div class="field"><label>Selling Price ₹ *</label><input id="pePrice" class="input" type="number" min="0" step="0.01" value="${x.selling_price??''}"></div>
      <div class="field"><label>Stock *</label><input id="peStock" class="input" type="number" min="0" value="${x.stock??0}"></div>
      <div class="field full"><label>Product Image URL</label><input id="peImage" class="input" value="${esc(x.image_url)}" placeholder="Public image URL"></div>
      <div class="field full"><label>Description</label><div style="display:flex;gap:8px;align-items:flex-start"><textarea id="peDescription" class="input" rows="14" style="flex:1">${esc(x.description)}</textarea><button id="peGenerate" class="btn" type="button">✨ Generate with Gemini</button></div><small class="muted">Gemini uses the product data and, when the image URL is accessible, the product image. Review the generated text before saving.</small></div>
      <div class="field"><label><input id="peFeatured" type="checkbox" ${x.featured?'checked':''}> Featured</label></div>
      <div class="field"><label><input id="peActive" type="checkbox" ${x.active?'checked':''}> Active</label></div>
      <div class="field"><label><input id="peApproved" type="checkbox" ${x.approved_by_admin?'checked':''}> Approved / Live</label></div>
    </div><div class="admin-actions"><button id="peSave" class="btn" type="button">${edit?'Save Changes':'Save Draft'}</button><button id="peSaveLive" class="btn" type="button">Save & Live</button></div></div>`;
  }
  async function open(id){if(!sb())return alert('Authentication service is not ready.');const [{data:p,error:pe},cats]=await Promise.all([sb().from('products').select('*').eq('id',id).single(),categories()]);if(pe)return alert(pe.message);show(p,cats,true)}
  async function add(){if(!sb())return alert('Authentication service is not ready.');try{show(null,await categories(),false)}catch(e){alert(e.message)}}
  function show(p,cats,edit){
    close();const modal=document.createElement('div');modal.id='productEditorModal';modal.className='modal-backdrop';modal.innerHTML=form(p,cats,edit);document.body.appendChild(modal);
    $('#peClose').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});
    $('#peGenerate').onclick=async()=>{const b=$('#peGenerate');b.disabled=true;b.textContent='Generating…';notice('Gemini is analyzing the product…');try{const sess=window.session?.access_token?window.session:((await sb().auth.getSession()).data.session);if(!sess)throw Error('Admin session expired. Please log in again.');const r=await fetch('/api/generate-product-description',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${sess.access_token}`},body:JSON.stringify({product:{...(p||{}),name:$('#peName').value,sku:$('#peSku').value,category_name:$('#peCategory').selectedOptions[0]?.textContent,image_url:$('#peImage').value,description:$('#peDescription').value,mrp:$('#peMrp').value,selling_price:$('#pePrice').value,stock:$('#peStock').value}})});const d=await r.json();if(!r.ok)throw Error(d.error||'Generation failed.');$('#peDescription').value=d.description||'';notice('Description generated. Review it before saving.')}catch(e){notice(e.message,'error')}finally{b.disabled=false;b.textContent='✨ Generate with Gemini'}};
    async function save(live){
      const name=$('#peName').value.trim(),category_id=$('#peCategory').value,price=Number($('#pePrice').value),stock=Math.max(0,parseInt($('#peStock').value,10)||0);
      if(!name)return notice('Product name is required.','error');if(!category_id)return notice('Please select a category.','error');if(!Number.isFinite(price)||price<0)return notice('Enter a valid selling price.','error');
      const b=live?$('#peSaveLive'):$('#peSave');b.disabled=true;
      const payload={name,sku:$('#peSku').value.trim()||null,category_id,mrp:Math.max(0,Number($('#peMrp').value)||0),selling_price:price,stock,image_url:$('#peImage').value.trim()||null,description:$('#peDescription').value.trim()||null,featured:$('#peFeatured').checked,active:live,approved_by_admin:live};
      try{let r=edit?await sb().from('products').update(payload).eq('id',p.id):await sb().from('products').insert(payload).select('id').single();if(r.error)throw r.error;notice(live?(edit?'Product updated and LIVE.':'Product created and LIVE.'):(edit?'Product updated.':'Product saved as draft.'));setTimeout(()=>{close();if(typeof window.refreshAdminProducts==='function')window.refreshAdminProducts()},700)}catch(e){notice(e.message,'error')}finally{b.disabled=false}
    }
    $('#peSave').onclick=()=>save(false);$('#peSaveLive').onclick=()=>save(true);
  }
  function enhance(){
    const panel=$('#adminPanel');if(!panel||!panel.querySelector('[data-saveprod]'))return;panel.dataset.productEditorEnhanced='1';
    const heading=panel.querySelector('h2');if(heading&&!panel.querySelector('#addProduct')){const wrap=document.createElement('div');wrap.className='admin-toolbar';wrap.style.marginBottom='12px';wrap.innerHTML='<button id="addProduct" class="btn" type="button">+ Add Product</button><span class="muted">Create products, edit all details, and generate descriptions with Gemini.</span>';heading.after(wrap);$('#addProduct').onclick=add}
    panel.querySelectorAll('[data-saveprod]').forEach(b=>{const id=b.dataset.saveprod;if(panel.querySelector(`[data-edit-product="${id}"]`))return;const e=document.createElement('button');e.className='btn small secondary';e.type='button';e.textContent='Edit';e.dataset.editProduct=id;e.onclick=()=>open(id);b.after(document.createTextNode(' '),e)});
    const reload=$('#prodReload');if(reload)window.refreshAdminProducts=()=>reload.click();
  }
  function start(){if(observerStarted)return;observerStarted=true;new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});setTimeout(enhance,300)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

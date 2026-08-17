/* Nexora-India Phase 1: authoritative Admin Products controller. */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const sb=()=>window.sb;
  let bound=false;
  let currentProducts=[];
  let categories=[];
  let searchTimer=null;

  function notice(text,type='success'){
    const e=$('#phase1Msg');
    if(e)e.innerHTML=`<div class="notice ${type}">${esc(text)}</div>`;
  }
  function isAdmin(){return !!(window.session?.user?.id && window.sb)}

  async function loadCategories(){
    const r=await sb().from('categories').select('id,name,active,sort_order').eq('active',true).order('sort_order').order('name');
    if(r.error)throw r.error;
    categories=r.data||[];
  }

  async function loadProducts(){
    const r=await sb().from('products').select('*').order('created_at',{ascending:false}).limit(200);
    if(r.error)throw r.error;
    currentProducts=r.data||[];
  }

  function categoryName(id){return categories.find(c=>String(c.id)===String(id))?.name||'Uncategorized'}

  function productRows(list){
    if(!list.length)return `<tr><td colspan="8"><div class="panel">No products found.</div></td></tr>`;
    return list.map(p=>`<tr>
      <td>${p.image_url?`<img src="${esc(p.image_url)}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:8px">`:'—'}</td>
      <td><b>${esc(p.name||'Unnamed')}</b><br><span class="muted">${esc(p.sku||'No SKU')}</span></td>
      <td>${esc(categoryName(p.category_id))}</td>
      <td>${money(p.selling_price)}<br><span class="muted">MRP ${money(p.mrp)}</span></td>
      <td>${Number(p.stock)||0}</td>
      <td>${p.active?'Active':'Draft/Hidden'} · ${p.approved_by_admin?'Live':'Not Live'}</td>
      <td>${p.featured?'Yes':'No'}</td>
      <td><button class="btn small" type="button" data-phase1-edit="${esc(p.id)}">Edit</button> <button class="btn small secondary" type="button" data-phase1-toggle="${esc(p.id)}">${p.active?'Hide':'Show'}</button></td>
    </tr>`).join('');
  }

  function renderPanel(){
    const p=$('#adminPanel');
    if(!p)return;
    p.innerHTML=`<div class="between"><div><h2>Products</h2><p class="muted">Phase 1: Add, Edit, Gemini Description, Draft, Live and Hide.</p></div><button id="phase1Add" class="btn" type="button">+ Add Product</button></div>
      <div id="phase1Msg"></div>
      <div class="admin-toolbar"><input id="phase1Search" class="input" placeholder="Search name, SKU or category…"><button id="phase1Reload" class="btn secondary" type="button">Reload</button></div>
      <div class="table-scroll"><table class="admin-table"><thead><tr><th>Image</th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Featured</th><th>Action</th></tr></thead><tbody id="phase1Rows">${productRows(currentProducts)}</tbody></table></div>`;
    $('#phase1Add').onclick=()=>openEditor(null);
    $('#phase1Reload').onclick=()=>refresh();
    $('#phase1Search').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=e.target.value.trim().toLowerCase();const filtered=currentProducts.filter(x=>(`${x.name||''} ${x.sku||''} ${categoryName(x.category_id)}`).toLowerCase().includes(q));$('#phase1Rows').innerHTML=productRows(filtered)},120)};
    p.querySelectorAll('[data-phase1-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.phase1Edit));
    p.querySelectorAll('[data-phase1-toggle]').forEach(b=>b.onclick=()=>toggleProduct(b.dataset.phase1Toggle));
  }

  async function refresh(){
    try{await Promise.all([loadCategories(),loadProducts()]);renderPanel();}
    catch(e){const p=$('#adminPanel');if(p)p.innerHTML=`<div class="notice error">${esc(e.message||'Unable to load products.')}</div>`}
  }

  function editorForm(p){
    const x=p||{};
    return `<div id="phase1Modal" class="modal-backdrop"><div class="modal-card" style="max-width:940px;width:94vw;max-height:92vh;overflow:auto">
      <div class="between"><div><span class="section-kicker">PHASE 1</span><h2>${p?'Edit Product':'Add Product'}</h2></div><button id="phase1Close" class="btn secondary" type="button">Close</button></div>
      <div id="phase1EditorMsg"></div>
      <div class="admin-form">
        <div class="field full"><label>Product Name *</label><input id="p1Name" class="input" value="${esc(x.name)}"></div>
        <div class="field"><label>SKU</label><input id="p1Sku" class="input" value="${esc(x.sku)}"></div>
        <div class="field"><label>Category *</label><select id="p1Category" class="input"><option value="">Select category</option>${categories.map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(x.category_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>MRP ₹</label><input id="p1Mrp" class="input" type="number" min="0" step="0.01" value="${x.mrp??''}"></div>
        <div class="field"><label>Selling Price ₹ *</label><input id="p1Price" class="input" type="number" min="0" step="0.01" value="${x.selling_price??''}"></div>
        <div class="field"><label>Stock *</label><input id="p1Stock" class="input" type="number" min="0" step="1" value="${x.stock??0}"></div>
        <div class="field full"><label>Product Image URL</label><input id="p1Image" class="input" value="${esc(x.image_url)}" placeholder="Public image URL"></div>
        <div class="field full"><label>Description</label><div style="display:flex;gap:8px;align-items:flex-start"><textarea id="p1Desc" class="input" rows="14" style="flex:1">${esc(x.description)}</textarea><button id="p1Gemini" class="btn" type="button">✨ Generate</button></div><small class="muted">Gemini will use the product information and accessible image URL. Review before saving.</small></div>
        <div class="field"><label><input id="p1Featured" type="checkbox" ${x.featured?'checked':''}> Featured</label></div>
        <div class="field"><label><input id="p1Active" type="checkbox" ${x.active?'checked':''}> Active</label></div>
        <div class="field"><label><input id="p1Approved" type="checkbox" ${x.approved_by_admin?'checked':''}> Approved / Live</label></div>
      </div>
      <div class="admin-actions"><button id="p1Draft" class="btn secondary" type="button">Save Draft</button><button id="p1Live" class="btn" type="button">Save & Live</button></div>
    </div></div>`;
  }

  async function openEditor(id){
    let p=null;
    if(id){p=currentProducts.find(x=>String(x.id)===String(id));if(!p){notice('Product not found.','error');return}}
    const old=$('#phase1Modal');if(old)old.remove();
    const wrap=document.createElement('div');wrap.innerHTML=editorForm(p);document.body.appendChild(wrap.firstElementChild);
    const modal=$('#phase1Modal');
    $('#phase1Close').onclick=()=>modal.remove();
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
    $('#p1Gemini').onclick=()=>generateDescription(p);
    $('#p1Draft').onclick=()=>saveProduct(p,false);
    $('#p1Live').onclick=()=>saveProduct(p,true);
  }

  async function generateDescription(p){
    const b=$('#p1Gemini');b.disabled=true;b.textContent='Generating…';
    const msg=$('#phase1EditorMsg');msg.innerHTML='<div class="notice">Gemini is analyzing the product…</div>';
    try{
      const sess=window.session?.access_token?window.session:(await sb().auth.getSession()).data.session;
      if(!sess)throw Error('Admin session expired. Please log in again.');
      const payload={name:$('#p1Name').value.trim(),sku:$('#p1Sku').value.trim(),category_name:$('#p1Category').selectedOptions[0]?.textContent||'',image_url:$('#p1Image').value.trim(),description:$('#p1Desc').value.trim(),mrp:$('#p1Mrp').value,selling_price:$('#p1Price').value,stock:$('#p1Stock').value,product_id:p?.id||null};
      const r=await fetch('/api/generate-product-description',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${sess.access_token}`},body:JSON.stringify({product:payload})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Gemini generation failed.');$('#p1Desc').value=d.description||'';msg.innerHTML='<div class="notice">Description generated. Review it before saving.</div>';
    }catch(e){msg.innerHTML=`<div class="notice error">${esc(e.message||'Generation failed.')}</div>`}finally{b.disabled=false;b.textContent='✨ Generate'}
  }

  async function saveProduct(existing,live){
    const msg=$('#phase1EditorMsg');
    const name=$('#p1Name').value.trim(),category_id=$('#p1Category').value,price=Number($('#p1Price').value),stock=Number($('#p1Stock').value);
    if(!name)return msg.innerHTML='<div class="notice error">Product name is required.</div>';
    if(!category_id)return msg.innerHTML='<div class="notice error">Please select a category.</div>';
    if(!Number.isFinite(price)||price<0)return msg.innerHTML='<div class="notice error">Enter a valid selling price.</div>';
    if(!Number.isInteger(stock)||stock<0)return msg.innerHTML='<div class="notice error">Enter a valid stock quantity.</div>';
    const button=live?$('#p1Live'):$('#p1Draft');button.disabled=true;button.textContent='Saving…';
    const payload={name,sku:$('#p1Sku').value.trim()||null,category_id,mrp:Math.max(0,Number($('#p1Mrp').value)||0),selling_price:price,stock,image_url:$('#p1Image').value.trim()||null,description:$('#p1Desc').value.trim()||null,featured:$('#p1Featured').checked,active:live?true:$('#p1Active').checked,approved_by_admin:live?true:$('#p1Approved').checked};
    try{
      const r=existing?await sb().from('products').update(payload).eq('id',existing.id):await sb().from('products').insert(payload).select('id').single();
      if(r.error)throw r.error;
      msg.innerHTML=`<div class="notice">${live?'Product saved and LIVE.':existing?'Product updated.':'Product saved as draft.'}</div>`;
      setTimeout(()=>{$('#phase1Modal')?.remove();refresh()},500);
    }catch(e){msg.innerHTML=`<div class="notice error">${esc(e.message||'Save failed.')}</div>`}finally{button.disabled=false;button.textContent=live?'Save & Live':'Save Draft'}
  }

  async function toggleProduct(id){
    const p=currentProducts.find(x=>String(x.id)===String(id));if(!p)return;
    const r=await sb().from('products').update({active:!p.active,approved_by_admin:!p.active}).eq('id',id);
    if(r.error)notice(r.error.message,'error');else refresh();
  }

  function bind(){
    if(bound)return;bound=true;
    document.addEventListener('click',e=>{
      const b=e.target.closest('.admin-tabs button[data-tab="products"]');
      if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();
      document.querySelectorAll('.admin-tabs button').forEach(x=>x.classList.toggle('active',x===b));
      refresh();
    },true);
    const obs=new MutationObserver(()=>{
      const tabs=document.querySelector('.admin-tabs');
      if(tabs && !tabs.dataset.phase1Ready){tabs.dataset.phase1Ready='1';const p=tabs.querySelector('button[data-tab="products"]');if(p && location.hash==='#/admin')setTimeout(()=>{p.classList.add('active');refresh()},0)}
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

/* Inject Delivery tab into the existing admin panel without altering its core tabs. */
(function(){
 function inject(){
  if(location.hash!=='#/admin')return;
  const tabs=document.querySelector('.admin-tabs');if(!tabs||tabs.querySelector('[data-tab="delivery"]'))return;
  const b=document.createElement('button');b.dataset.tab='delivery';b.textContent='Delivery';tabs.appendChild(b);
  b.onclick=()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));const p=document.querySelector('#adminPanel');window.renderDeliverySettings?.(p)};
 }
 window.renderDeliverySettings=async function(p){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const r=await window.sb.from('admin_settings').select('delivery_enabled,default_delivery_charge,electrical_delivery_charge,free_delivery_min_amount').limit(1).single();
  if(r.error){p.innerHTML=`<div class="notice error">${esc(r.error.message)}</div>`;return}
  const s=r.data||{};p.innerHTML=`<h2>Delivery Configuration</h2><p class="muted">Server-side defaults. Product-specific delivery charges take priority.</p><div class="admin-form"><div class="field full"><label><input id="delEnabled" type="checkbox" ${s.delivery_enabled!==false?'checked':''}> Enable delivery charges</label></div><div class="field"><label>Default delivery charge (₹)</label><input id="delDefault" class="input" type="number" min="0" step="0.01" value="${Number(s.default_delivery_charge||0)}"></div><div class="field"><label>Electrical delivery charge (₹)</label><input id="delElectrical" class="input" type="number" min="0" step="0.01" value="${Number(s.electrical_delivery_charge||0)}"></div><div class="field full"><label>Free delivery above order value (₹)</label><input id="delFree" class="input" type="number" min="0" step="0.01" value="${Number(s.free_delivery_min_amount||0)}"><small class="muted">0 = no free-delivery threshold.</small></div></div><div class="admin-actions"><button id="saveDelivery" class="btn">Save Delivery Settings</button></div><div id="deliveryMsg"></div>`;
  document.querySelector('#saveDelivery').onclick=async()=>{const payload={delivery_enabled:document.querySelector('#delEnabled').checked,default_delivery_charge:Math.max(0,Number(document.querySelector('#delDefault').value)||0),electrical_delivery_charge:Math.max(0,Number(document.querySelector('#delElectrical').value)||0),free_delivery_min_amount:Math.max(0,Number(document.querySelector('#delFree').value)||0)};const x=await window.sb.from('admin_settings').update(payload).not('id','is',null);document.querySelector('#deliveryMsg').innerHTML=x.error?`<div class="notice error">${esc(x.error.message)}</div>`:'<div class="notice success">Delivery settings saved.</div>'};
 };
 const oldRoute=window.route;window.route=function(){const r=oldRoute?.apply(this,arguments);setTimeout(inject,50);return r};window.addEventListener('hashchange',()=>setTimeout(inject,50));setTimeout(inject,100);
})();
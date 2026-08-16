/* Nexora-India customer account: Profile, My Orders and Security. Logout is intentionally NOT shown inside My Account. */
(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
 let activeTab='profile';

 async function render(){
  if(!window.session){location.hash='#/login';return}
  const app=document.querySelector('#app');
  if(!app)return;
  app.innerHTML=`<div class="account-page"><div class="account-hero"><span class="section-kicker">MY NEXORA</span><h1>My Account</h1><p>Manage your profile, address and orders.</p></div><div class="account-layout"><aside class="account-nav"><button type="button" class="${activeTab==='profile'?'active':''}" data-account-tab="profile">Profile</button><button type="button" class="${activeTab==='orders'?'active':''}" data-account-tab="orders">My Orders</button><button type="button" class="${activeTab==='security'?'active':''}" data-account-tab="security">Security</button></aside><section id="accountPanel"></section></div></div>`;
  const nav=document.querySelector('.account-nav');
  nav?.addEventListener('click',e=>{
   const b=e.target.closest('[data-account-tab]');
   if(!b)return;
   e.preventDefault();e.stopPropagation();
   switchTab(b.dataset.accountTab);
  });
  await switchTab(activeTab);
 }

 async function switchTab(tab){
  activeTab=tab;
  document.querySelectorAll('[data-account-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accountTab===tab));
  const panel=document.querySelector('#accountPanel');
  if(!panel||!window.session||!window.sb)return;
  panel.innerHTML='<div class="account-card"><p>Loading…</p></div>';

  if(tab==='profile'){
   const r=await window.sb.from('profiles').select('full_name,phone,address_line1,address_line2,city,state,pincode').eq('id',window.session.user.id).single();
   const p=r.data||{};
   panel.innerHTML=`<div class="account-card"><h2>Profile details</h2><div class="account-grid"><div class="field"><label>Email</label><input class="input" value="${esc(window.session.user.email)}" disabled></div><div class="field"><label>Mobile</label><input id="acPhone" class="input" value="${esc(p.phone)}"></div><div class="field full"><label>Full name</label><input id="acName" class="input" value="${esc(p.full_name)}"></div><div class="field full"><label>Address line 1</label><input id="acAddress1" class="input" value="${esc(p.address_line1)}"></div><div class="field full"><label>Address line 2</label><input id="acAddress2" class="input" value="${esc(p.address_line2)}"></div><div class="field"><label>City</label><input id="acCity" class="input" value="${esc(p.city)}"></div><div class="field"><label>State</label><input id="acState" class="input" value="${esc(p.state)}"></div><div class="field"><label>Pincode</label><input id="acPincode" class="input" inputmode="numeric" value="${esc(p.pincode)}"></div></div><div class="account-actions"><button id="saveAccount" type="button" class="btn">Save changes</button></div><div id="accountMsg"></div></div>`;
   document.querySelector('#saveAccount')?.addEventListener('click',async()=>{
    const b=document.querySelector('#saveAccount');b.disabled=true;
    try{
     const payload={full_name:document.querySelector('#acName').value.trim(),phone:document.querySelector('#acPhone').value.trim(),address_line1:document.querySelector('#acAddress1').value.trim(),address_line2:document.querySelector('#acAddress2').value.trim(),city:document.querySelector('#acCity').value.trim(),state:document.querySelector('#acState').value.trim(),pincode:document.querySelector('#acPincode').value.trim()};
     const x=await window.sb.from('profiles').update(payload).eq('id',window.session.user.id);
     document.querySelector('#accountMsg').innerHTML=x.error?`<div class="notice error">${esc(x.error.message)}</div>`:'<div class="notice success">Profile and address updated successfully.</div>';
    }catch(e){document.querySelector('#accountMsg').innerHTML=`<div class="notice error">${esc(e.message)}</div>`}finally{b.disabled=false}
   });
  } else if(tab==='orders'){
   const r=await window.sb.from('orders').select('id,order_number,created_at,total_amount,order_status,payment_status,order_items(product_name,quantity,unit_selling_price)').eq('user_id',window.session.user.id).order('created_at',{ascending:false});
   if(r.error){panel.innerHTML=`<div class="account-card"><h2>My Orders</h2><div class="notice error">${esc(r.error.message)}</div></div>`;return}
   const orders=r.data||[];
   panel.innerHTML=`<div class="account-card"><h2>My Orders</h2>${orders.length?orders.map(o=>`<article class="account-order"><div class="account-order-head"><div><b>${esc(o.order_number)}</b><div class="muted">${new Date(o.created_at).toLocaleDateString('en-IN')}</div></div><span class="badge">${esc(o.order_status)}</span></div><div class="account-order-items">${(o.order_items||[]).map(i=>`${esc(i.product_name)} × ${i.quantity} — ${money(Number(i.unit_selling_price)*Number(i.quantity))}`).join('<br>')}</div><div class="account-actions"><b>Total ${money(o.total_amount)}</b><span class="muted">Payment: ${esc(o.payment_status)}</span></div></article>`).join(''):'<div class="account-empty">You have no orders yet.<br><a class="btn" href="#/products" style="margin-top:12px">Start shopping</a></div>'}</div>`;
  } else {
   panel.innerHTML=`<div class="account-card"><h2>Security</h2><p class="muted">Use the password recovery flow to verify your email and create a new password.</p><div class="account-actions"><a class="btn secondary" href="#/forgot">Reset password</a></div></div>`;
  }
 }
 const old=window.route;
 window.route=function(){if(location.hash==='#/account'){activeTab='profile';render();return}return old&&old()};
 window.accountTab=switchTab;
})();

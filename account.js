/* Nexora-India Point 6: customer account UI. */
(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
 async function render(){
  if(!window.session){location.hash='#/login';return}
  const app=document.querySelector('#app');
  app.innerHTML='<div class="account-page"><div class="account-hero"><span class="section-kicker">MY NEXORA</span><h1>My Account</h1><p>Manage your profile and keep track of your orders.</p></div><div class="account-layout"><aside class="account-nav"><button class="active" data-tab="profile">Profile</button><button data-tab="orders">My Orders</button><button data-tab="security">Security</button><button data-tab="logout">Logout</button></aside><section id="accountPanel"></section></div></div>';
  document.querySelectorAll('.account-nav button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  await switchTab('profile');
 }
 async function switchTab(tab){
  document.querySelectorAll('.account-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const panel=document.querySelector('#accountPanel');if(!panel)return;
  if(tab==='logout'){await window.sb?.auth.signOut();location.hash='#/';return}
  if(tab==='profile'){
   const r=await window.sb.from('profiles').select('full_name,phone').eq('id',window.session.user.id).single();
   const p=r.data||{};panel.innerHTML=`<div class="account-card"><h2>Profile details</h2><div class="account-grid"><div class="field"><label>Email</label><input class="input" value="${esc(window.session.user.email)}" disabled></div><div class="field"><label>Mobile</label><input id="acPhone" class="input" value="${esc(p.phone)}"></div><div class="field full"><label>Full name</label><input id="acName" class="input" value="${esc(p.full_name)}"></div></div><div class="account-actions"><button id="saveAccount" class="btn">Save changes</button></div><div id="accountMsg"></div></div>`;
   document.querySelector('#saveAccount').onclick=async()=>{const b=document.querySelector('#saveAccount');b.disabled=true;const x=await window.sb.from('profiles').update({full_name:document.querySelector('#acName').value.trim(),phone:document.querySelector('#acPhone').value.trim()}).eq('id',window.session.user.id);document.querySelector('#accountMsg').innerHTML=x.error?`<div class="notice error">${esc(x.error.message)}</div>`:'<div class="notice success">Profile updated successfully.</div>';b.disabled=false};
  } else if(tab==='orders'){
   const r=await window.sb.from('orders').select('id,order_number,created_at,total_amount,order_status,payment_status,order_items(product_name,quantity,unit_selling_price)').eq('user_id',window.session.user.id).order('created_at',{ascending:false});
   const orders=r.data||[];panel.innerHTML=`<div class="account-card"><h2>My Orders</h2>${orders.length?orders.map(o=>`<article class="account-order"><div class="account-order-head"><div><b>${esc(o.order_number)}</b><div class="muted">${new Date(o.created_at).toLocaleDateString('en-IN')}</div></div><span class="badge">${esc(o.order_status)}</span></div><div class="account-order-items">${(o.order_items||[]).map(i=>`${esc(i.product_name)} × ${i.quantity} — ${money(Number(i.unit_selling_price)*Number(i.quantity))}`).join('<br>')}</div><div class="account-actions"><b>Total ${money(o.total_amount)}</b><span class="muted">Payment: ${esc(o.payment_status)}</span></div></article>`).join(''):'<div class="account-empty">You have no orders yet.<br><a class="btn" href="#/products" style="margin-top:12px">Start shopping</a></div>'}</div>`;
  } else {
   panel.innerHTML=`<div class="account-card"><h2>Security</h2><p class="muted">Your account is protected by Supabase authentication. Use the password-reset flow if you need to change a forgotten password.</p><div class="account-actions"><a class="btn secondary" href="#/forgot">Reset password</a></div></div>`;
  }
 }
 const old=window.route;window.route=function(){if(location.hash==='#/account'){render();return}return old&&old()};
})();
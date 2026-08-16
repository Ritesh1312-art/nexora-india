/* Nexora-India customer account: Profile + My Orders + Security. Logout is header-only. */
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const app=()=>document.querySelector('#app');
  const user=()=>window.session?.user;

  async function render(){
    if(!user()){location.hash='#/login';return}
    const root=app(); if(!root)return;
    root.innerHTML=`<div class="account-page"><div class="account-hero"><span class="section-kicker">MY NEXORA</span><h1>My Account</h1><p>Manage your profile, address and orders.</p></div><div class="account-layout"><aside class="account-nav"><button type="button" class="active" data-tab="profile">Profile</button><button type="button" data-tab="orders">My Orders</button><button type="button" data-tab="security">Security</button></aside><section id="accountPanel"><div class="account-card"><div class="muted">Loading your account…</div></div></section></div></div>`;
    root.querySelectorAll('.account-nav button').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
    await switchTab('profile');
  }

  async function switchTab(tab){
    if(!user())return;
    const buttons=document.querySelectorAll('.account-nav button');
    buttons.forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    const panel=document.querySelector('#accountPanel'); if(!panel)return;
    if(tab==='profile')return renderProfile(panel);
    if(tab==='orders')return renderOrders(panel);
    return renderSecurity(panel);
  }

  async function renderProfile(panel){
    panel.innerHTML='<div class="account-card"><div class="muted">Loading profile…</div></div>';
    let p={},loadError='';
    try{
      const r=await window.sb.from('profiles').select('full_name,phone,address_line1,address_line2,city,state,pincode').eq('id',user().id).maybeSingle();
      if(r.error)loadError=r.error.message; else p=r.data||{};
    }catch(e){loadError=e.message||'Unable to load profile.'}
    const metadata=user().user_metadata||{};
    panel.innerHTML=`<div class="account-card"><h2>Profile details</h2>${loadError?`<div class="notice error">Profile could not be loaded from the database. You can still edit the fields below and try Save changes.<br><small>${esc(loadError)}</small></div>`:''}<div class="account-grid"><div class="field"><label>Email</label><input class="input" value="${esc(user().email)}" disabled></div><div class="field"><label>Mobile</label><input id="acPhone" class="input" value="${esc(p.phone||metadata.phone||'')}"></div><div class="field full"><label>Full name</label><input id="acName" class="input" value="${esc(p.full_name||metadata.full_name||'')}"></div><div class="field full"><label>Address line 1</label><input id="acAddress1" class="input" value="${esc(p.address_line1||'')}"></div><div class="field full"><label>Address line 2</label><input id="acAddress2" class="input" value="${esc(p.address_line2||'')}"></div><div class="field"><label>City</label><input id="acCity" class="input" value="${esc(p.city||'')}"></div><div class="field"><label>State</label><input id="acState" class="input" value="${esc(p.state||'')}"></div><div class="field"><label>Pincode</label><input id="acPincode" class="input" inputmode="numeric" value="${esc(p.pincode||'')}"></div></div><div class="account-actions"><button type="button" id="saveAccount" class="btn">Save changes</button></div><div id="accountMsg"></div></div>`;
    document.querySelector('#saveAccount').addEventListener('click',saveProfile);
  }

  async function saveProfile(){
    const b=document.querySelector('#saveAccount'); if(!b||!user())return;
    const msg=document.querySelector('#accountMsg');b.disabled=true;b.textContent='Saving…';
    const payload={full_name:document.querySelector('#acName').value.trim(),phone:document.querySelector('#acPhone').value.trim(),address_line1:document.querySelector('#acAddress1').value.trim(),address_line2:document.querySelector('#acAddress2').value.trim(),city:document.querySelector('#acCity').value.trim(),state:document.querySelector('#acState').value.trim(),pincode:document.querySelector('#acPincode').value.trim()};
    try{
      let r=await window.sb.from('profiles').update(payload).eq('id',user().id).select().maybeSingle();
      if(r.error)throw r.error;
      if(!r.data){
        const up=await window.sb.from('profiles').upsert({id:user().id,...payload},{onConflict:'id'}).select().maybeSingle();
        if(up.error)throw up.error;
      }
      msg.innerHTML='<div class="notice success">Profile and address updated successfully.</div>';
    }catch(e){msg.innerHTML=`<div class="notice error">${esc(e.message||'Could not save profile.')}</div>`}
    finally{b.disabled=false;b.textContent='Save changes'}
  }

  async function renderOrders(panel){
    panel.innerHTML='<div class="account-card"><div class="muted">Loading orders…</div></div>';
    try{
      const r=await window.sb.from('orders').select('id,order_number,created_at,total_amount,order_status,payment_status,order_items(product_name,quantity,unit_selling_price)').eq('user_id',user().id).order('created_at',{ascending:false});
      if(r.error)throw r.error;const orders=r.data||[];
      panel.innerHTML=`<div class="account-card"><h2>My Orders</h2>${orders.length?orders.map(o=>`<article class="account-order"><div class="account-order-head"><div><b>${esc(o.order_number)}</b><div class="muted">${new Date(o.created_at).toLocaleDateString('en-IN')}</div></div><span class="badge">${esc(o.order_status)}</span></div><div class="account-order-items">${(o.order_items||[]).map(i=>`${esc(i.product_name)} × ${i.quantity} — ${money(Number(i.unit_selling_price)*Number(i.quantity))}`).join('<br>')}</div><div class="account-actions"><b>Total ${money(o.total_amount)}</b><span class="muted">Payment: ${esc(o.payment_status)}</span></div></article>`).join(''):'<div class="account-empty">You have no orders yet.<br><a class="btn" href="#/products" style="margin-top:12px">Start shopping</a></div>'}</div>`;
    }catch(e){panel.innerHTML=`<div class="account-card"><h2>My Orders</h2><div class="notice error">Could not load orders: ${esc(e.message||'Unknown error')}</div></div>`}
  }

  function renderSecurity(panel){panel.innerHTML='<div class="account-card"><h2>Security</h2><p class="muted">Use password recovery to verify your email and create a new password.</p><div class="account-actions"><a class="btn secondary" href="#/forgot">Reset password</a></div></div>'}

  const oldRoute=window.route;
  window.route=function(){if(location.hash==='#/account'){render();return}return oldRoute&&oldRoute()};
})();

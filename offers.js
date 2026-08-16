/* Nexora-India Point 7: customer offer display and eligibility. */
(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
 async function render(){
  const app=document.querySelector('#app');if(!app)return;
  const userId=window.session?.user?.id||null;
  let q=window.sb.from('offers').select('id,name,code,discount_type,discount_value,min_order_amount,max_discount_amount,starts_at,ends_at,active,target_type');
  const r=await q.eq('active',true).order('created_at',{ascending:false});
  const offers=(r.data||[]).filter(o=>{const now=Date.now();return (!o.starts_at||Date.parse(o.starts_at)<=now)&&(!o.ends_at||Date.parse(o.ends_at)>=now)&&(['everyone','all'].includes(String(o.target_type||'everyone').toLowerCase())||!!userId)});
  app.innerHTML=`<div class="offers-page container"><div class="section-head"><span class="section-kicker">SPECIAL OFFERS</span><h1>Offers for you</h1><p>Use an eligible offer code at checkout.</p></div><div class="offer-grid">${offers.length?offers.map(o=>`<article class="offer-card"><div class="offer-badge">${o.discount_type==='percentage'?esc(o.discount_value)+'% OFF':money(o.discount_value)+' OFF'}</div><h2>${esc(o.name)}</h2><div class="offer-code">${esc(o.code)}</div>${o.min_order_amount?`<p>Minimum order ${money(o.min_order_amount)}</p>`:''}${o.max_discount_amount?`<p>Maximum discount ${money(o.max_discount_amount)}</p>`:''}<button class="btn copy-offer" data-code="${esc(o.code)}">Copy code</button></article>`).join(''):'<div class="account-empty">No active offers available right now.</div>'}</div></div>`;
  document.querySelectorAll('.copy-offer').forEach(b=>b.onclick=async()=>{await navigator.clipboard?.writeText(b.dataset.code);const old=b.textContent;b.textContent='Copied ✓';setTimeout(()=>b.textContent=old,1200)});
 }
 const old=window.route;window.route=function(){if(location.hash==='#/offers'){render();return}return old&&old()};
})();
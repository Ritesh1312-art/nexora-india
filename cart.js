/* Nexora-India Point 4: cart UX and validation. */
(function(){
  const esc=window.esc||((v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const money=window.money||((n)=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2}));
  function ps(){return window.products||[]}
  function normalize(){
    window.cart=Array.isArray(window.cart)?window.cart:[];
    window.cart=window.cart.filter(i=>ps().some(p=>p.id===i.id&&p.active!==false&&p.approved_by_admin!==false)).map(i=>({...i,qty:Math.max(1,Number(i.qty)||1)}));
    localStorage.setItem('nexora_cart',JSON.stringify(window.cart));
  }
  function items(){return window.cart.map(i=>{const p=ps().find(x=>x.id===i.id);return p?{...i,p}:null}).filter(Boolean)}
  function deliveryFor(p){return Number(p.electrical_delivery_charge??p.delivery_charge??0)}
  function minQty(p){return Math.max(1,Number(p.electrical_min_order_qty??p.min_order_qty??1))}
  function render(){
    normalize(); const rows=items();
    let subtotal=0,delivery=0;
    rows.forEach(({p,qty})=>{subtotal+=Number(p.selling_price||0)*qty;delivery+=deliveryFor(p)*qty});
    const total=subtotal+delivery;
    document.querySelector('#app').innerHTML=`<div class="cart-page"><div class="cart-head"><div><span class="section-kicker">YOUR SHOPPING CART</span><h1>Cart</h1><p>${rows.length?`${rows.length} product${rows.length===1?'':'s'} in your cart.`:'Your cart is empty.'}</p></div><a class="btn secondary" href="#/products">Continue shopping</a></div>${rows.length?`<div class="cart-layout"><section class="cart-items">${rows.map(({p,qty})=>{const min=minQty(p),stock=Math.max(0,Number(p.stock)||0);const line=Number(p.selling_price||0)*qty;return `<article class="cart-item"><a class="cart-item-img" href="#/product/${encodeURIComponent(p.id)}"><img src="${esc(p.image_url||'https://placehold.co/300x240?text=Nexora-India')}" alt="${esc(p.name)}" loading="lazy"></a><div class="cart-item-main"><div class="cart-item-top"><div><span class="cart-cat">${esc((window.categories||[]).find(c=>c.id===p.category_id)?.name||'Product')}</span><h2>${esc(p.name)}</h2></div><button class="cart-remove" onclick="window.cartRemove('${p.id}')">Remove</button></div><div class="cart-price">${money(p.selling_price)} <span>each</span></div><div class="cart-meta">${min>1?`Minimum ${min} pieces · `:''}${stock>0?`${stock} available`:'Out of stock'}</div><div class="cart-item-bottom"><div class="cart-qty"><button onclick="window.cartQty('${p.id}',-1)">−</button><span>${qty}</span><button onclick="window.cartQty('${p.id}',1)">+</button></div><b>${money(line)}</b></div></div></article>`}).join('')}<button class="btn secondary" onclick="window.cartClear()">Clear cart</button></section><aside class="cart-summary"><h2>Order summary</h2><div><span>Subtotal</span><b>${money(subtotal)}</b></div><div><span>Delivery</span><b>${delivery?money(delivery):'Free'}</b></div><hr><div class="cart-total"><span>Total</span><strong>${money(total)}</strong></div><button class="btn cart-checkout" onclick="location.hash='#/checkout'">Proceed to checkout</button><p class="cart-note">Stock, minimum quantity and final delivery charges are checked again at checkout.</p></aside></div>`:`<div class="cart-empty"><div class="empty-icon">🛒</div><h2>Your cart is empty</h2><p>Add products you like and they will appear here.</p><a class="btn" href="#/products">Browse products</a></div>`}</div>`;
    updateCount();
  }
  function save(){localStorage.setItem('nexora_cart',JSON.stringify(window.cart));updateCount()}
  function updateCount(){const n=(window.cart||[]).reduce((s,x)=>s+Number(x.qty||0),0);const el=document.querySelector('#cartCount');if(el)el.textContent=n}
  window.cartQty=(id,d)=>{const i=window.cart.find(x=>x.id===id),p=ps().find(x=>x.id===id);if(!i||!p)return;const min=minQty(p),stock=Number(p.stock)||0;const next=i.qty+d;if(next<min){i.qty=min}else if(next>stock){i.qty=stock}else{i.qty=next}if(i.qty<=0)window.cart=window.cart.filter(x=>x.id!==id);save();render()};
  window.cartRemove=id=>{window.cart=window.cart.filter(x=>x.id!==id);save();render()};
  window.cartClear=()=>{window.cart=[];save();render()};
  function route(){if((location.hash||'')==='#/cart'){render();return true}return false}
  const oldRoute=window.route;window.route=function(){if(route())return;return oldRoute&&oldRoute()};window.addEventListener('hashchange',route);window.updateCartCount=updateCount;setTimeout(updateCount,0);
})();

const SUPABASE_URL = window.NEXORA_SUPABASE_URL || "";
const SUPABASE_KEY = window.NEXORA_SUPABASE_KEY || "";
let sb = null, products=[], categories=[], cart=JSON.parse(localStorage.getItem("nexora_cart")||"[]"), session=null, admin=false;

const $ = s => document.querySelector(s);
const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});

async function init(){
  try{
    const cfg=await fetch("/api/config").then(r=>r.json());
    if(cfg.url && cfg.key) sb=supabase.createClient(cfg.url,cfg.key);
    if(sb){ const x=await sb.auth.getSession(); session=x.data.session; sb.auth.onAuthStateChange((_e,s)=>{session=s;refreshNav();}); }
  }catch(e){console.error(e)}
  refreshNav(); await loadCatalog(); route();
}
function refreshNav(){
  $("#ordersLink").hidden=!session; $("#accountLink").hidden=!session; $("#logoutBtn").hidden=!session;
}
$("#logoutBtn").onclick=async()=>{if(sb) await sb.auth.signOut(); location.hash="#/";};
window.addEventListener("hashchange",route);

async function api(path, options={}){
  const r=await fetch("/api/"+path,{headers:{"content-type":"application/json",...(options.headers||{})},...options});
  const d=await r.json().catch(()=>({error:"Invalid server response"}));
  if(!r.ok) throw new Error(d.error||"Request failed");
  return d;
}
async function loadCatalog(){
  if(!sb)return;
  const c=await sb.from("categories").select("*").eq("active",true).order("sort_order");
  categories=c.data||[];
  const p=await sb.from("products").select("id,name,slug,description,image_url,selling_price,stock,category_id,product_variants(id,variant_name,attributes,selling_price,stock,active)").eq("active",true).eq("approved_by_admin",true).order("created_at",{ascending:false});
  products=p.data||[];
}
function layout(title,body){return `<div class="container"><div class="between"><h2>${title}</h2><a class="btn secondary" href="#/">Store</a></div>${body}</div>`}
function route(){
  const h=location.hash||"#/";
  if(h==="#/") renderHome();
  else if(h==="#/login") renderLogin();
  else if(h==="#/register") renderRegister();
  else if(h==="#/forgot") renderForgot();
  else if(h==="#/account") renderAccount();
  else if(h==="#/orders") renderOrders();
  else if(h==="#/checkout") renderCheckout();
  else if(h==="#/admin") renderAdmin();
  else renderHome();
}
function renderHome(){
  const cats=categories.map(c=>`<button class="btn secondary" onclick="filterCat('${c.id}')">${esc(c.name)}</button>`).join("");
  const cards=products.map(p=>`<article class="card">
    <img src="${esc(p.image_url||'https://placehold.co/600x500?text=Nexora-India')}" alt="">
    <div class="card-body">
      <div class="muted">${esc(categories.find(c=>c.id===p.category_id)?.name||"")}</div>
      <h3>${esc(p.name)}</h3><div class="price">${money(p.selling_price)}</div>
      <div class="muted">${p.stock>0?p.stock+" available":"Out of stock"}</div>
      <button class="btn" ${p.stock<1?"disabled":""} onclick="addCart('${p.id}')">Add to cart</button>
    </div></article>`).join("");
  $("#app").innerHTML=`<div class="container"><section class="hero"><h1>Nexora-India</h1><p>Smart finds across footwear, daily use, kitchen appliances and artificial jewellery.</p><div class="row">${cats}</div></section><div class="between"><h2>Products</h2><button class="btn secondary" onclick="renderCart()">Cart (${cart.reduce((a,x)=>a+x.qty,0)})</button></div><div class="grid">${cards||"<div class='panel'>No products are live yet. Admin can publish products after review.</div>"}</div><div id="cartArea"></div></div>`;
}
window.filterCat=id=>{const q=products.filter(p=>p.category_id===id);$("#app").querySelector(".grid").innerHTML=q.map(p=>`<article class="card"><img src="${esc(p.image_url||'https://placehold.co/600x500?text=Nexora-India')}"><div class="card-body"><h3>${esc(p.name)}</h3><div class="price">${money(p.selling_price)}</div><button class="btn" onclick="addCart('${p.id}')">Add to cart</button></div></article>`).join("")};
window.addCart=id=>{const p=products.find(x=>x.id===id);if(!p)return;let x=cart.find(i=>i.id===id);if(x)x.qty++;else cart.push({id,qty:1});localStorage.setItem("nexora_cart",JSON.stringify(cart));renderCart();};
window.renderCart=()=>{const area=$("#cartArea")||document.createElement("div"); if(!area.id)area.id="cartArea"; const items=cart.map(i=>{const p=products.find(x=>x.id===i.id);return p?`<div class="between"><span>${esc(p.name)} × ${i.qty}</span><b>${money(p.selling_price*i.qty)}</b></div>`:""}).join(""); const total=cart.reduce((s,i)=>{const p=products.find(x=>x.id===i.id);return s+(p?p.selling_price*i.qty:0)},0);area.innerHTML=`<div class="cart"><div class="between"><b>Cart</b><b>${money(total)}</b></div>${items||"<div>Cart is empty.</div>"}${items?`<div class="row" style="margin-top:10px"><button class="btn" onclick="location.hash='#/checkout'">Checkout</button><button class="btn secondary" onclick="cart=[];localStorage.removeItem('nexora_cart');renderCart()">Clear</button></div>`:""}</div>`;if(!$("#cartArea"))$("#app .container").appendChild(area);};
async function authGuard(){if(!session){location.hash="#/login";return false}return true}
function authForm(title,fields,button,footer){$("#app").innerHTML=layout(title,`<div class="panel" style="max-width:500px">${fields}<button id="submit" class="btn">${button}</button><div style="margin-top:12px">${footer}</div><div id="msg"></div></div>`);}
function renderLogin(){authForm("Login",`<div class="field"><label>Email</label><input id="email" class="input" type="email"></div><div class="field"><label>Password</label><input id="password" class="input" type="password"></div>`,"Login",`<a href="#/forgot">Forgot password?</a> · <a href="#/register">Create account</a>`);$("#submit").onclick=async()=>{try{let r=await sb.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});if(r.error)throw r.error;location.hash="#/"}catch(e){$("#msg").innerHTML=`<div class="notice error">${esc(e.message)}</div>`}};
function renderRegister(){authForm("Create account",`<div class="field"><label>Full name</label><input id="name" class="input"></div><div class="field"><label>Mobile</label><input id="phone" class="input"></div><div class="field"><label>Email</label><input id="email" class="input" type="email"></div><div class="field"><label>Password (8+ characters)</label><input id="password" class="input" type="password"></div>`,"Register",`Already registered? <a href="#/login">Login</a>`);$("#submit").onclick=async()=>{try{const r=await sb.auth.signUp({email:$("#email").value,password:$("#password").value,options:{data:{full_name:$("#name").value,phone:$("#phone").value}}});if(r.error)throw r.error;$("#msg").innerHTML=`<div class="notice success">Registration submitted. Check your email for confirmation if email confirmation is enabled.</div>`}catch(e){$("#msg").innerHTML=`<div class="notice error">${esc(e.message)}</div>`}};
function renderForgot(){authForm("Forgot password",`<div class="field"><label>Email</label><input id="email" class="input" type="email"></div>`,"Send reset email",`<a href="#/login">Back to login</a>`);$("#submit").onclick=async()=>{try{const r=await sb.auth.resetPasswordForEmail($("#email").value,{redirectTo:location.origin+"/#/account"});if(r.error)throw r.error;$("#msg").innerHTML=`<div class="notice success">If that email exists, a reset link has been sent.</div>`}catch(e){$("#msg").innerHTML=`<div class="notice error">${esc(e.message)}</div>`}}}
async function renderAccount(){if(!(await authGuard()))return;const p=await sb.from("profiles").select("*").eq("id",session.user.id).single();$("#app").innerHTML=layout("My Account",`<div class="panel"><p><b>User ID:</b> ${esc(p.data?.user_id)}</p><p><b>Email:</b> ${esc(session.user.email)}</p><div class="field"><label>Name</label><input id="name" class="input" value="${esc(p.data?.full_name)}"></div><div class="field"><label>Mobile</label><input id="phone" class="input" value="${esc(p.data?.phone)}"></div><button class="btn" onclick="saveProfile()">Save</button><div id="msg"></div></div>`)}
window.saveProfile=async()=>{const r=await sb.from("profiles").update({full_name:$("#name").value,phone:$("#phone").value}).eq("id",session.user.id);$("#msg").innerHTML=r.error?`<div class="notice error">${esc(r.error.message)}</div>`:`<div class="notice success">Saved.</div>`};
async function renderOrders(){if(!(await authGuard()))return;const r=await sb.from("orders").select("*,order_items(*)").eq("user_id",session.user.id).order("created_at",{ascending:false});const rows=(r.data||[]).map(o=>`<div class="panel"><div class="between"><b>${esc(o.order_number)}</b><span class="badge">${esc(o.order_status)}</span></div><p>${money(o.total_amount)} · Payment: ${esc(o.payment_status)}</p><div>${(o.order_items||[]).map(i=>`${esc(i.product_name)} × ${i.quantity}`).join("<br>")}</div></div>`).join("");$("#app").innerHTML=layout("My Orders",rows||"<div class='panel'>No orders yet.</div>")}

function renderCheckout(){
  if(!session){location.hash="#/login";return}
  const items=cart.map(i=>{const p=products.find(x=>x.id===i.id);return p?{...i,p}:null}).filter(Boolean);
  const total=items.reduce((s,i)=>s+i.p.selling_price*i.qty,0);
  $("#app").innerHTML=layout("Checkout",`<div class="panel"><div class="notice">Payment method: <b>UPI only</b>. After paying, submit the UTR/reference number for admin verification.</div>
  <div class="field"><label>Name</label><input id="name" class="input"></div>
  <div class="field"><label>Mobile</label><input id="phone" class="input"></div>
  <div class="field"><label>Address</label><textarea id="address" class="input"></textarea></div>
  <div class="field"><label>City</label><input id="city" class="input"></div>
  <div class="field"><label>State</label><input id="state" class="input"></div>
  <div class="field"><label>Pincode</label><input id="pincode" class="input"></div>
  <div class="field"><label>UPI UTR / Reference (optional now; can be submitted after payment)</label><input id="utr" class="input"></div>
  <h3>Total: ${money(total)}</h3>
  <button class="btn" id="place">Place UPI order</button><div id="msg"></div></div>`);
  $("#place").onclick=async()=>{try{const d=await api("order",{method:"POST",body:JSON.stringify({items:items.map(i=>({product_id:i.id,quantity:i.qty})),customer:{name:$("#name").value,phone:$("#phone").value,address_line1:$("#address").value,city:$("#city").value,state:$("#state").value,pincode:$("#pincode").value},utr:$("#utr").value||null})});cart=[];localStorage.removeItem("nexora_cart");$("#msg").innerHTML=`<div class="notice success">Order ${esc(d.order_number)} created. Total ${money(d.total_amount)}. Admin will verify UPI payment after UTR submission.</div>`}catch(e){$("#msg").innerHTML=`<div class="notice error">${esc(e.message)}</div>`}}}

async function renderAdmin(){
  if(admin){return adminDashboard()}
  $("#app").innerHTML=layout("Admin Login",`<div class="panel" style="max-width:480px"><div class="field"><label>Admin password</label><input id="apass" class="input" type="password"></div><button class="btn" id="alogin">Login</button><div id="msg"></div></div>`);
  $("#alogin").onclick=async()=>{try{await api("admin",{method:"POST",body:JSON.stringify({action:"login",password:$("#apass").value})});admin=true;adminDashboard()}catch(e){$("#msg").innerHTML=`<div class="notice error">${esc(e.message)}</div>`}}
}
async function adminCall(action,data={}){return api("admin",{method:"POST",body:JSON.stringify({action,...data})})}
async function adminDashboard(){
  try{
    const [stats,ps,users,orders,offers]=await Promise.all([adminCall("stats"),adminCall("products"),adminCall("users"),adminCall("orders"),adminCall("offers")]);
    $("#app").innerHTML=layout("Nexora-India Admin",`<div class="admin-grid">
      <div class="stat"><span>Products</span><b>${stats.products}</b></div><div class="stat"><span>Users</span><b>${stats.users}</b></div><div class="stat"><span>Orders</span><b>${stats.orders}</b></div><div class="stat"><span>Sales</span><b>${money(stats.sales)}</b></div>
    </div>
    <div class="tabs" style="margin-top:15px"><button class="btn" onclick="adminTab('products')">Products</button><button class="btn secondary" onclick="adminTab('orders')">Orders</button><button class="btn secondary" onclick="adminTab('users')">Users</button><button class="btn secondary" onclick="adminTab('offers')">Offers</button><button class="btn secondary" onclick="cjSync()">CJ Sync</button><button class="btn secondary" onclick="adminLogout()">Logout</button></div>
    <div id="adminTab"></div>`);
    window._adminData={ps:ps||[],users:users||[],orders:orders||[],offers:offers||[]};adminTab("products");
  }catch(e){admin=false;$("#app").innerHTML=layout("Admin",`<div class="notice error">${esc(e.message)}</div>`)}
}
window.adminTab=tab=>{const d=window._adminData||{};if(tab==="products")$("#adminTab").innerHTML=`<div class="panel"><h3>Products</h3><div class="table-wrap"><table class="table"><tr><th>Name</th><th>Source</th><th>Cost</th><th>Price</th><th>Stock</th><th>Live</th><th>Action</th></tr>${d.ps.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.source)}</td><td>${money(p.cost_price)}</td><td>${money(p.selling_price)}</td><td>${p.stock}</td><td>${p.active&&p.approved_by_admin?"Yes":"No"}</td><td><button class="btn" onclick="editProduct('${p.id}')">Edit</button></td></tr>`).join("")}</table></div><div id="editor"></div></div>`;
if(tab==="orders")$("#adminTab").innerHTML=`<div class="panel"><h3>Orders</h3><div class="table-wrap"><table class="table"><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Action</th></tr>${d.orders.map(o=>`<tr><td>${esc(o.order_number)}</td><td>${esc(o.customer_name)}<br>${esc(o.customer_phone)}</td><td>${money(o.total_amount)}</td><td>${esc(o.payment_status)}<br>${esc(o.utr||"")}</td><td>${esc(o.order_status)}</td><td><button class="btn" onclick="verifyOrder('${o.id}')">Verify</button></td></tr>`).join("")}</table></div></div>`;
if(tab==="users")$("#adminTab").innerHTML=`<div class="panel"><h3>Users</h3><div class="table-wrap"><table class="table"><tr><th>User ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th></tr>${d.users.map(u=>`<tr><td>${esc(u.user_id)}</td><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td><td>${new Date(u.created_at).toLocaleString()}</td></tr>`).join("")}</table></div></div>`;
if(tab==="offers")$("#adminTab").innerHTML=`<div class="panel"><h3>Offers</h3><p>Offer records: ${d.offers.length}</p><div class="field"><label>Offer name</label><input id="oname" class="input"></div><div class="field"><label>Code</label><input id="ocode" class="input"></div><div class="field"><label>Discount %</label><input id="odisc" class="input" type="number"></div><button class="btn" onclick="createOffer()">Create offer</button></div>`};
window.editProduct=async id=>{const p=window._adminData.ps.find(x=>x.id===id);$("#editor").innerHTML=`<div class="panel"><h3>Edit ${esc(p.name)}</h3><div class="field"><label>Final selling price</label><input id="price" class="input" type="number" value="${p.selling_price}"></div><div class="field"><label>Stock</label><input id="stock" class="input" type="number" value="${p.stock}"></div><label><input id="live" type="checkbox" ${p.active&&p.approved_by_admin?"checked":""}> Publish live</label><br><button class="btn" style="margin-top:10px" onclick="saveProduct('${id}')">Save</button></div>`};
window.saveProduct=async id=>{await adminCall("update_product",{id,price:Number($("#price").value),stock:Number($("#stock").value),active:$("#live").checked,approved_by_admin:$("#live").checked});adminDashboard()};
window.verifyOrder=async id=>{const status=prompt("Payment status: VERIFIED or REJECTED","VERIFIED");if(!status)return;await adminCall("verify_payment",{order_id:id,status});adminDashboard()};
window.createOffer=async()=>{await adminCall("create_offer",{name:$("#oname").value,code:$("#ocode").value||null,discount_percent:Number($("#odisc").value||0)});adminDashboard()};
window.cjSync=async()=>{try{const d=await adminCall("cj_sync");alert(`CJ sync complete. Imported/updated: ${d.imported||0}`);adminDashboard()}catch(e){alert(e.message)}};
window.adminLogout=async()=>{await adminCall("logout");admin=false;location.hash="#/admin";renderAdmin()};

init();

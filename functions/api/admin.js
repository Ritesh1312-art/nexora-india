import {json,readBody,supabase,signAdmin,validAdmin,telegram,getSupabaseKey} from "./_utils.js";
async function readSupabaseResult(r){const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {ok:r.ok,status:r.status,data};}
export async function onRequestPost({request,env}){
 try{
  const b=await readBody(request);
  if(b.action==="login"){
   if(!env.ADMIN_PASSWORD||!env.JWT_SECRET)return json({error:"Admin secrets are not configured"},500);
   if(b.password!==env.ADMIN_PASSWORD)return json({error:"Invalid password"},401);
   const t=await signAdmin(env);
   return json({ok:true},200,{headers:{"Set-Cookie":`nexora_admin=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`}});
  }
  if(b.action==="logout")return json({ok:true},200,{headers:{"Set-Cookie":"nexora_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"}});
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  if(!env.SUPABASE_URL)return json({error:"SUPABASE_URL is not configured in Cloudflare Pages Functions environment"},500);
  if(!getSupabaseKey(env))return json({error:"SUPABASE_SECRET_KEY is not configured in Cloudflare Pages Functions environment"},500);
  try{new URL(env.SUPABASE_URL)}catch{return json({error:"SUPABASE_URL is invalid in Cloudflare Pages Functions environment"},500)}
  if(b.action==="stats"){
   const checks={
    products:await readSupabaseResult(await supabase(env,"products?select=id&limit=1")),
    profiles:await readSupabaseResult(await supabase(env,"profiles?select=id&limit=1")),
    orders:await readSupabaseResult(await supabase(env,"orders?select=id,total_amount&limit=1"))
   };
   const bad=Object.entries(checks).filter(([,x])=>!x.ok);
   if(bad.length)return json({error:"Supabase query failed",details:bad.map(([name,x])=>({table:name,status:x.status,response:x.data}))},502);
   const [p,u,o]=await Promise.all([supabase(env,"products?select=id"),supabase(env,"profiles?select=id"),supabase(env,"orders?select=id,total_amount")]);
   const ps=await p.json(),us=await u.json(),os=await o.json();
   return json({products:Array.isArray(ps)?ps.length:0,users:Array.isArray(us)?us.length:0,orders:Array.isArray(os)?os.length:0,sales:Array.isArray(os)?os.reduce((s,x)=>s+Number(x.total_amount||0),0):0});
  }
  if(b.action==="products"){const r=await supabase(env,"products?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase products query failed",details:d},502);return json(d)}
  if(b.action==="users"){const r=await supabase(env,"profiles?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase profiles query failed",details:d},502);const out=d.map(x=>({...x,email:null}));const auth=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,{headers:{apikey:getSupabaseKey(env),"Content-Type":"application/json"}});if(auth.ok){const ad=await auth.json();const map=new Map((ad.users||[]).map(x=>[x.id,x.email]));out.forEach(x=>x.email=map.get(x.id)||"")}return json(out)}
  if(b.action==="orders"){const r=await supabase(env,"orders?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase orders query failed",details:d},502);return json(d)}
  if(b.action==="offers"){const r=await supabase(env,"offers?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase offers query failed",details:d},502);return json(d)}
  if(b.action==="update_product"){const r=await supabase(env,`products?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({selling_price:Number(b.price),stock:Number(b.stock),active:!!b.active,approved_by_admin:!!b.approved_by_admin,approved_at:b.approved_by_admin?new Date().toISOString():null})});if(!r.ok)return json({error:await r.text()},500);return json({ok:true})}
  if(b.action==="verify_payment"){const status=String(b.status||"").toUpperCase();if(!["VERIFIED","REJECTED"].includes(status))return json({error:"Invalid status"},400);const payment_status=status==="VERIFIED"?"VERIFIED":"REJECTED";const order_status=status==="VERIFIED"?"PAID":"PENDING_PAYMENT";const r=await supabase(env,`orders?id=eq.${encodeURIComponent(b.order_id)}`,{method:"PATCH",body:JSON.stringify({payment_status,order_status})});if(!r.ok)return json({error:"Order update failed",details:await r.text()},500);await telegram(env,`💳 NEXORA-INDIA PAYMENT ${status}\nOrder: ${b.order_id}`);return json({ok:true})}
  if(b.action==="create_offer"){const r=await supabase(env,"offers",{method:"POST",body:JSON.stringify({name:b.name,code:b.code||null,offer_type:"PERCENTAGE",target_type:"ALL",discount_percent:Number(b.discount_percent||0),active:true,admin_approved:true})});if(!r.ok)return json({error:"Offer creation failed",details:await r.text()},500);return json({ok:true})}
  if(b.action==="cj_sync"){
   if(!env.CJ_ACCESS_TOKEN)return json({error:"CJ_ACCESS_TOKEN is not configured"},400);
   const r=await fetch("https://developers.cjdropshipping.com/api2.0/v1/product/listV2?page=1&size=100",{headers:{"CJ-Access-Token":env.CJ_ACCESS_TOKEN}});
   const d=await r.json();if(!r.ok||d.code!==200)return json({error:"CJ API error",details:d},502);
   const list=[];for(const block of (d.data?.content||[]))for(const p of (block.productList||[]))list.push(p);
   let imported=0;
   for(const p of list){const id=p.id||p.productId;if(!id)continue;const name=p.nameEn||p.productNameEn||"CJ Product";const cost=Number(p.sellPrice||p.nowPrice||0)||0;const payload={name,source:"CJ",source_product_id:String(id),source_sku:p.sku||p.spu||null,image_url:p.bigImage||null,cost_price:cost,suggested_price:Number((cost*1.5).toFixed(2)),selling_price:Number((cost*1.5).toFixed(2)),stock:0,stock_mode:"AUTO",active:false,approved_by_admin:false,last_stock_sync_at:new Date().toISOString()};const q=await supabase(env,`products?source=eq.CJ&source_product_id=eq.${encodeURIComponent(String(id))}&select=id`);const ex=await q.json();if(ex?.[0])await supabase(env,`products?id=eq.${encodeURIComponent(ex[0].id)}`,{method:"PATCH",body:JSON.stringify(payload)});else await supabase(env,"products",{method:"POST",body:JSON.stringify(payload)});imported++}
   await telegram(env,`🔄 Nexora-India CJ sync complete\nImported/updated: ${imported}`);return json({ok:true,imported});
  }
  return json({error:"Unknown admin action"},400);
 }catch(e){return json({error:"Admin API internal error",details:String(e?.message||e)},500)}
}

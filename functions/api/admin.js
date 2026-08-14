import {json,readBody,supabase,signAdmin,validAdmin,telegram} from "./_utils.js";
export async function onRequestPost({request,env}){
 const b=await readBody(request);
 if(b.action==="login"){if(!env.ADMIN_PASSWORD||!env.JWT_SECRET)return json({error:"Admin secrets are not configured"},500);if(b.password!==env.ADMIN_PASSWORD)return json({error:"Invalid password"},401);const t=await signAdmin(env);return json({ok:true},{headers:{"Set-Cookie":`nexora_admin=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`}})}
 if(b.action==="logout")return json({ok:true},{headers:{"Set-Cookie":"nexora_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"}});
 if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
 if(b.action==="stats"){
  const [p,u,o]=await Promise.all([supabase(env,"products?select=id"),supabase(env,"profiles?select=id"),supabase(env,"orders?select=id,total_amount")]);
  const ps=await p.json(),us=await u.json(),os=await o.json();
  return json({products:Array.isArray(ps)?ps.length:0,users:Array.isArray(us)?us.length:0,orders:Array.isArray(os)?os.length:0,sales:Array.isArray(os)?os.reduce((s,x)=>s+Number(x.total_amount||0),0):0});
 }
 if(b.action==="products"){const r=await supabase(env,"products?select=*&order=created_at.desc");return json(await r.json())}
 if(b.action==="users"){const r=await supabase(env,"profiles?select=*&order=created_at.desc");const d=await r.json();const ids=(d||[]).map(x=>x.id);const out=[];for(const x of d||[]){out.push({...x,email:null})}if(ids.length){const auth=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}});if(auth.ok){const ad=await auth.json();const map=new Map((ad.users||[]).map(x=>[x.id,x.email]));out.forEach(x=>x.email=map.get(x.id)||"")}}return json(out)}
 if(b.action==="orders"){const r=await supabase(env,"orders?select=*&order=created_at.desc");return json(await r.json())}
 if(b.action==="offers"){const r=await supabase(env,"offers?select=*&order=created_at.desc");return json(await r.json())}
 if(b.action==="update_product"){const r=await supabase(env,`products?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({selling_price:Number(b.price),stock:Number(b.stock),active:!!b.active,approved_by_admin:!!b.approved_by_admin,approved_at:b.approved_by_admin?new Date().toISOString():null})});if(!r.ok)return json({error:await r.text()},500);return json({ok:true})}
 if(b.action==="verify_payment"){const status=String(b.status||"").toUpperCase();if(!["VERIFIED","REJECTED"].includes(status))return json({error:"Invalid status"},400);const payment_status=status==="VERIFIED"?"VERIFIED":"REJECTED";const order_status=status==="VERIFIED"?"PAID":"PENDING_PAYMENT";await supabase(env,`orders?id=eq.${encodeURIComponent(b.order_id)}`,{method:"PATCH",body:JSON.stringify({payment_status,order_status})});await supabase(env,"payment_records",{method:"POST",body:JSON.stringify({order_id:b.order_id,method:"UPI",amount:0,status:payment_status,verified_at:new Date().toISOString()})});await telegram(env,`💳 NEXORA-INDIA PAYMENT ${status}\nOrder: ${b.order_id}`);return json({ok:true})}
 if(b.action==="create_offer"){const r=await supabase(env,"offers",{method:"POST",body:JSON.stringify({name:b.name,code:b.code||null,offer_type:"PERCENTAGE",target_type:"ALL",discount_percent:Number(b.discount_percent||0),active:true,admin_approved:true})});if(!r.ok)return json({error:await r.text()},500);return json({ok:true})}
 if(b.action==="cj_sync"){
  if(!env.CJ_ACCESS_TOKEN)return json({error:"CJ_ACCESS_TOKEN is not configured"},400);
  const r=await fetch("https://developers.cjdropshipping.com/api2.0/v1/product/listV2?page=1&size=100",{headers:{"CJ-Access-Token":env.CJ_ACCESS_TOKEN}});
  const d=await r.json();if(!r.ok||d.code!==200)return json({error:"CJ API error",details:d},502);
  const list=[];for(const block of (d.data?.content||[]))for(const p of (block.productList||[]))list.push(p);
  let imported=0;
  for(const p of list){
   const id=p.id||p.productId; if(!id)continue;
   const name=p.nameEn||p.productNameEn||"CJ Product";const cost=Number(p.sellPrice||p.nowPrice||0)||0;
   const payload={name,source:"CJ",source_product_id:String(id),source_sku:p.sku||p.spu||null,image_url:p.bigImage||null,cost_price:cost,suggested_price:Number((cost*1.5).toFixed(2)),selling_price:Number((cost*1.5).toFixed(2)),stock:0,stock_mode:"AUTO",active:false,approved_by_admin:false,last_stock_sync_at:new Date().toISOString()};
   const q=await supabase(env,`products?source=eq.CJ&source_product_id=eq.${encodeURIComponent(String(id))}&select=id`);
   const ex=await q.json();
   if(ex?.[0])await supabase(env,`products?id=eq.${encodeURIComponent(ex[0].id)}`,{method:"PATCH",body:JSON.stringify(payload)});
   else await supabase(env,"products",{method:"POST",body:JSON.stringify(payload)});
   imported++;
  }
  await telegram(env,`🔄 Nexora-India CJ sync complete\nImported/updated: ${imported}`);
  return json({ok:true,imported});
 }
 return json({error:"Unknown admin action"},400);
}

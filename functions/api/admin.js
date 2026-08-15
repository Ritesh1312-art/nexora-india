import {json,readBody,supabase,signAdmin,validAdmin,telegram,getSupabaseKey} from "./_utils.js";
import {syncCJ} from "./cj.js";
import {syncDeodap} from "./deodap.js";
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
   const checks={products:await readSupabaseResult(await supabase(env,"products?select=id&limit=1")),profiles:await readSupabaseResult(await supabase(env,"profiles?select=id&limit=1")),orders:await readSupabaseResult(await supabase(env,"orders?select=id,total_amount&limit=1"))};
   const bad=Object.entries(checks).filter(([,x])=>!x.ok);
   if(bad.length)return json({error:"Supabase query failed",details:bad.map(([name,x])=>({table:name,status:x.status,response:x.data}))},502);
   const [p,u,o]=await Promise.all([supabase(env,"products?select=id"),supabase(env,"profiles?select=id"),supabase(env,"orders?select=id,total_amount")]);
   const ps=await p.json(),us=await u.json(),os=await o.json();
   return json({products:Array.isArray(ps)?ps.length:0,users:Array.isArray(us)?us.length:0,orders:Array.isArray(os)?os.length:0,sales:Array.isArray(os)?os.reduce((s,x)=>s+Number(x.total_amount||0),0):0});
  }
  if(b.action==="products"){const r=await supabase(env,"products?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase products query failed",details:d},502);return json(d)}
  if(b.action==="users"){
   const r=await supabase(env,"profiles?select=*&order=created_at.desc");const d=await r.json();
   if(!Array.isArray(d))return json({error:"Supabase profiles query failed",details:d},502);
   const out=d.map(x=>({...x,email:null,last_sign_in_at:null,banned_until:null}));
   const auth=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,{headers:{apikey:getSupabaseKey(env),Authorization:`Bearer ${getSupabaseKey(env)}`,"Content-Type":"application/json"}});
   if(auth.ok){const ad=await auth.json();const map=new Map((ad.users||[]).map(x=>[x.id,x]));out.forEach(x=>{const a=map.get(x.id);if(a){x.email=a.email||"";x.last_sign_in_at=a.last_sign_in_at||null;x.banned_until=a.banned_until||null;}})}
   return json(out);
  }
  if(b.action==="orders"){const r=await supabase(env,"orders?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase orders query failed",details:d},502);return json(d)}
  if(b.action==="offers"){const r=await supabase(env,"offers?select=*&order=created_at.desc");const d=await r.json();if(!Array.isArray(d))return json({error:"Supabase offers query failed",details:d},502);return json(d)}
  if(b.action==="update_product"){const r=await supabase(env,`products?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({selling_price:Number(b.price),stock:Number(b.stock),active:!!b.active,approved_by_admin:!!b.approved_by_admin,approved_at:b.approved_by_admin?new Date().toISOString():null})});if(!r.ok)return json({error:await r.text()},500);return json({ok:true})}
  if(b.action==="verify_payment"){const status=String(b.status||"").toUpperCase();if(!["VERIFIED","REJECTED"].includes(status))return json({error:"Invalid status"},400);const payment_status=status==="VERIFIED"?"VERIFIED":"REJECTED";const order_status=status==="VERIFIED"?"PAID":"PENDING_PAYMENT";const r=await supabase(env,`orders?id=eq.${encodeURIComponent(b.order_id)}`,{method:"PATCH",body:JSON.stringify({payment_status,order_status})});if(!r.ok)return json({error:"Order update failed",details:await r.text()},500);await telegram(env,`💳 NEXORA-INDIA PAYMENT ${status}\nOrder: ${b.order_id}`);return json({ok:true})}
  if(b.action==="create_offer"){
   const target=String(b.target_type||"ALL").toUpperCase();
   const allowed=["ALL","ACTIVE_USERS","INACTIVE_USERS","SELECTED_USERS"];
   if(!allowed.includes(target))return json({error:"Invalid offer target"},400);
   const ids=Array.isArray(b.target_user_ids)?[...new Set(b.target_user_ids.map(String).filter(Boolean))]:[];
   if(target==="SELECTED_USERS"&&!ids.length)return json({error:"Select at least one user for a specific-user offer"},400);
   const body={name:String(b.name||"").trim(),code:String(b.code||"").trim()||null,offer_type:"PERCENTAGE",target_type:target,discount_percent:Number(b.discount_percent||0),active:b.active!==false,admin_approved:true,target_user_ids:target==="SELECTED_USERS"?ids:[]};
   if(!body.name)return json({error:"Offer name is required"},400);
   if(body.discount_percent<=0||body.discount_percent>100)return json({error:"Discount must be between 0 and 100"},400);
   const r=await supabase(env,"offers",{method:"POST",body:JSON.stringify(body)});if(!r.ok)return json({error:"Offer creation failed",details:await r.text()},500);
   return json({ok:true});
  }
  if(b.action==="cj_sync"){
   try{const result=await syncCJ(env,supabase);await telegram(env,`🔄 Nexora-India CJ sync complete\nFootwear: ${result.footwear}\nKitchen Appliances: ${result.kitchen}`);return json({ok:true,...result});}
   catch(e){return json({error:"CJ sync failed",details:String(e?.message||e)},502)}
  }
  if(b.action==="deodap_sync"){
   try{const result=await syncDeodap(env,supabase);await telegram(env,`🔄 Nexora-India DeoDap sync complete\nDaily Use: ${result.daily}\nArtificial Jewellery: ${result.jewellery}`);return json({ok:true,...result});}
   catch(e){return json({error:"DeoDap sync failed",details:String(e?.message||e)},502)}
  }
  return json({error:"Unknown admin action"},400);
 }catch(e){return json({error:"Admin API internal error",details:String(e?.message||e)},500)}
}

import {json,readBody,supabase,validAdmin} from "./_utils.js";

const ALLOWED={PENDING_PAYMENT:["PAYMENT_SUBMITTED","CANCELLED"],PAYMENT_SUBMITTED:["PAID","PENDING_PAYMENT","CANCELLED"],PAID:["PROCESSING","CANCELLED","REFUNDED"],PROCESSING:["SUPPLIER_ORDERED","SHIPPED","CANCELLED"],SUPPLIER_ORDERED:["SHIPPED","CANCELLED"],SHIPPED:["DELIVERED","CANCELLED"],DELIVERED:[],CANCELLED:[],REFUNDED:[]};
const RELEASE=new Set(["CANCELLED","REFUNDED"]);

async function releaseOrderStock(env,orderId,currentStatus,nextStatus){
 // Claim the unreleased reservation first. The conditional update makes
 // concurrent admin requests mutually exclusive, preventing double release.
 const claim=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&order_status=eq.${encodeURIComponent(currentStatus)}&stock_reserved=eq.true&stock_released=eq.false`,{method:"PATCH",body:JSON.stringify({stock_released:true,updated_at:new Date().toISOString()})});
 const claimed=await claim.json().catch(()=>null);
 if(!claim.ok)return {ok:false,error:`Unable to claim reserved stock release: ${JSON.stringify(claimed)}`};
 if(!Array.isArray(claimed)||!claimed[0])return {ok:true,released:false,claimed:false};
 const ir=await supabase(env,`order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_id,quantity`);const items=await ir.json();
 if(!ir.ok||!Array.isArray(items)){
  await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&order_status=eq.${encodeURIComponent(currentStatus)}&stock_released=eq.true`,{method:"PATCH",body:JSON.stringify({stock_released:false,updated_at:new Date().toISOString()})});
  return {ok:false,error:"Unable to load order items for stock release"};
 }
 const release=await supabase(env,"rpc/release_product_stock",{method:"POST",body:JSON.stringify({p_items:items})});
 if(!release.ok){
  await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&order_status=eq.${encodeURIComponent(currentStatus)}&stock_released=eq.true`,{method:"PATCH",body:JSON.stringify({stock_released:false,updated_at:new Date().toISOString()})});
  return {ok:false,error:`Unable to release reserved stock: ${await release.text()}`};
 }
 return {ok:true,released:true,claimed:true};
}

export async function onRequestPost({request,env}){
 try{
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const b=await readBody(request);const orderId=String(b.order_id||"").trim();const next=String(b.order_status||"").toUpperCase();
  if(!orderId||!next)return json({error:"order_id and order_status are required"},400);
  const r=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_status,stock_reserved,stock_released`);const rows=await r.json();
  if(!r.ok||!Array.isArray(rows)||!rows[0])return json({error:"Order not found"},404);
  const current=String(rows[0].order_status||"");if(current===next)return json({ok:true,order_status:next,no_change:true});
  if(!Object.prototype.hasOwnProperty.call(ALLOWED,current)||!ALLOWED[current].includes(next))return json({error:`Invalid order status transition: ${current} → ${next}`},409);

  let stockReleased=!!rows[0].stock_released;
  if(RELEASE.has(next)&&rows[0].stock_reserved&&!rows[0].stock_released){
   const result=await releaseOrderStock(env,orderId,current,next);
   if(!result.ok)return json({error:result.error},500);
   stockReleased=!!result.released||!!rows[0].stock_released;
  }

  const now=new Date().toISOString();
  const patch={order_status:next,updated_at:now};
  const ur=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&order_status=eq.${encodeURIComponent(current)}`,{method:"PATCH",body:JSON.stringify(patch)});
  if(!ur.ok)return json({error:"Order status update failed",details:await ur.text()},500);
  const updated=await ur.json().catch(()=>null);
  if(!Array.isArray(updated)||!updated[0])return json({error:"Order changed concurrently; please refresh and retry"},409);
  return json({ok:true,order_id:orderId,previous_status:current,order_status:next,stock_released:stockReleased});
 }catch(e){return json({error:"Order status API internal error",details:String(e?.message||e)},500)}
}

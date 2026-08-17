import {json,readBody,supabase} from "./_utils.js";

async function bearerUser(request,env){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return null;
 const token=auth.slice(7);const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});if(!r.ok)return null;return r.json();
}
async function reserveAgain(env,items){const r=await supabase(env,"rpc/reserve_product_stock",{method:"POST",body:JSON.stringify({p_items:items})});return {ok:r.ok,data:await r.json().catch(()=>null)};}
async function releaseAgain(env,items){const r=await supabase(env,"rpc/release_product_stock",{method:"POST",body:JSON.stringify({p_items:items})});if(!r.ok)throw new Error(await r.text());}

export async function onRequestPost({request,env}){try{
 const user=await bearerUser(request,env);if(!user)return json({error:"Login required"},401);
 const b=await readBody(request),orderNumber=String(b.order_number||"").trim(),utr=String(b.utr||"").trim();
 if(!orderNumber||!utr)return json({error:"order_number and UTR/reference are required"},400);
 if(!/^[A-Za-z0-9]{6,64}$/.test(utr))return json({error:"Invalid UTR/reference. Use 6–64 letters or numbers."},400);
 const or=await supabase(env,`orders?order_number=eq.${encodeURIComponent(orderNumber)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,order_number,order_status,payment_status,stock_reserved,stock_released`);const orders=await or.json();
 if(!or.ok||!orders?.[0])return json({error:"Order not found"},404);const order=orders[0];
 if(!["PENDING_PAYMENT","PAYMENT_SUBMITTED"].includes(String(order.order_status)))return json({error:`UTR cannot be submitted for order status ${order.order_status}`},409);
 if(order.payment_status==="VERIFIED")return json({error:"Payment is already verified"},409);
 const ir=await supabase(env,`order_items?order_id=eq.${encodeURIComponent(order.id)}&select=product_id,variant_id,quantity`);const items=await ir.json();if(!ir.ok||!Array.isArray(items))return json({error:"Unable to load order items"},500);
 const stockItems=items.map(x=>({product_id:x.product_id,variant_id:x.variant_id||null,quantity:Number(x.quantity||1)}));
 let claimedReleased=false;
 if(order.stock_released){
  const claim=await supabase(env,`orders?id=eq.${encodeURIComponent(order.id)}&user_id=eq.${encodeURIComponent(user.id)}&stock_released=eq.true`,{method:"PATCH",body:JSON.stringify({stock_released:false,updated_at:new Date().toISOString()})});
  const claimed=await claim.json().catch(()=>null);if(!claim.ok)return json({error:"Unable to reserve order stock",details:claimed},500);if(!Array.isArray(claimed)||!claimed[0])return json({error:"Payment submission is already being processed; please retry shortly"},409);claimedReleased=true;
  const rr=await reserveAgain(env,stockItems);
  if(!rr.ok){await supabase(env,`orders?id=eq.${encodeURIComponent(order.id)}&user_id=eq.${encodeURIComponent(user.id)}&stock_released=eq.false`,{method:"PATCH",body:JSON.stringify({stock_released:true,updated_at:new Date().toISOString()})});return json({error:"One or more products are no longer available; please place a new order",details:rr.data},409);}
 }
 const patch={utr,payment_status:"SUBMITTED",order_status:"PAYMENT_SUBMITTED",stock_reserved:true,stock_released:false,updated_at:new Date().toISOString()};
 const ur=await supabase(env,`orders?id=eq.${encodeURIComponent(order.id)}&user_id=eq.${encodeURIComponent(user.id)}&order_status=in.(PENDING_PAYMENT,PAYMENT_SUBMITTED)`,{method:"PATCH",body:JSON.stringify(patch)});
 if(!ur.ok){if(claimedReleased){try{await releaseAgain(env,stockItems)}catch{}}return json({error:"Unable to submit UTR",details:await ur.text()},500)}
 const updated=await ur.json().catch(()=>null);if(!Array.isArray(updated)||!updated[0]){if(claimedReleased){try{await releaseAgain(env,stockItems)}catch{}}return json({error:"Payment submission changed concurrently; please retry"},409)}
 return json({ok:true,order_number:order.order_number,payment_status:"SUBMITTED",order_status:"PAYMENT_SUBMITTED"});
}catch(e){return json({error:"Payment submission error",details:String(e?.message||e)},500)}}

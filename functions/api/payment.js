import {json,readBody,supabase} from "./_utils.js";

async function bearerUser(request,env){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return null;
 const token=auth.slice(7);const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});if(!r.ok)return null;return await r.json();
}

async function reserveAgain(env,items){
 const r=await supabase(env,"rpc/reserve_product_stock",{method:"POST",body:JSON.stringify({p_items:items})});return {ok:r.ok,data:await r.json().catch(()=>null)};
}

async function releaseAgain(env,items){await supabase(env,"rpc/release_product_stock",{method:"POST",body:JSON.stringify({p_items:items})});}

export async function onRequestPost({request,env}){try{
 const user=await bearerUser(request,env);if(!user)return json({error:"Login required"},401);const b=await readBody(request);
 const orderNumber=String(b.order_number||"").trim(),utr=String(b.utr||"").trim();if(!orderNumber||!utr)return json({error:"order_number and UTR/reference are required"},400);if(utr.length<6||utr.length>80)return json({error:"Invalid UTR/reference length"},400);
 const or=await supabase(env,`orders?order_number=eq.${encodeURIComponent(orderNumber)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,order_number,order_status,payment_status,stock_reserved,stock_released`);const orders=await or.json();if(!or.ok||!orders?.[0])return json({error:"Order not found"},404);const order=orders[0];
 if(!["PENDING_PAYMENT","PAYMENT_SUBMITTED"].includes(String(order.order_status)))return json({error:`UTR cannot be submitted for order status ${order.order_status}`},409);
 if(order.payment_status==="VERIFIED")return json({error:"Payment is already verified"},409);
 const ir=await supabase(env,`order_items?order_id=eq.${encodeURIComponent(order.id)}&select=product_id,quantity`);const items=await ir.json();if(!ir.ok||!Array.isArray(items))return json({error:"Unable to load order items"},500);
 const stockItems=items.map(x=>({product_id:x.product_id,quantity:Number(x.quantity||1)}));let reservedNow=false;
 if(order.stock_released){const rr=await reserveAgain(env,stockItems);if(!rr.ok)return json({error:"One or more products are no longer available; please place a new order",details:rr.data},409);reservedNow=true;}
 const patch={utr,payment_status:"SUBMITTED",order_status:"PAYMENT_SUBMITTED",stock_reserved:true,stock_released:false,updated_at:new Date().toISOString()};
 const ur=await supabase(env,`orders?id=eq.${encodeURIComponent(order.id)}&user_id=eq.${encodeURIComponent(user.id)}`,{method:"PATCH",body:JSON.stringify(patch)});
 if(!ur.ok){if(reservedNow)await releaseAgain(env,stockItems);return json({error:"Unable to submit UTR",details:await ur.text()},500)}
 return json({ok:true,order_number:order.order_number,payment_status:"SUBMITTED",order_status:"PAYMENT_SUBMITTED"});
}catch(e){return json({error:"Payment submission error",details:String(e?.message||e)},500)}}
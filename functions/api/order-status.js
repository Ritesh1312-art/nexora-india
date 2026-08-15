import {json,readBody,supabase,validAdmin} from "./_utils.js";

const ALLOWED={PENDING_PAYMENT:["PAYMENT_SUBMITTED","CANCELLED"],PAYMENT_SUBMITTED:["PAID","PENDING_PAYMENT","CANCELLED"],PAID:["PROCESSING","CANCELLED","REFUNDED"],PROCESSING:["SUPPLIER_ORDERED","SHIPPED","CANCELLED"],SUPPLIER_ORDERED:["SHIPPED","CANCELLED"],SHIPPED:["DELIVERED","CANCELLED"],DELIVERED:[],CANCELLED:[],REFUNDED:[]};
const RELEASE=new Set(["CANCELLED","REFUNDED"]);

export async function onRequestPost({request,env}){
 try{
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const b=await readBody(request);const orderId=String(b.order_id||"").trim();const next=String(b.order_status||"").toUpperCase();
  if(!orderId||!next)return json({error:"order_id and order_status are required"},400);
  const r=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_status,stock_reserved,stock_released`);const rows=await r.json();
  if(!r.ok||!Array.isArray(rows)||!rows[0])return json({error:"Order not found"},404);
  const current=String(rows[0].order_status||"");if(current===next)return json({ok:true,order_status:next,no_change:true});
  if(!Object.prototype.hasOwnProperty.call(ALLOWED,current)||!ALLOWED[current].includes(next))return json({error:`Invalid order status transition: ${current} → ${next}`},409);
  const now=new Date().toISOString();
  const patch={order_status:next,updated_at:now};
  if(RELEASE.has(next)&&rows[0].stock_reserved&&!rows[0].stock_released){
   const rr=await supabase(env,`order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_id,quantity`);const items=await rr.json();
   if(!rr.ok||!Array.isArray(items))return json({error:"Unable to load order items for stock release"},500);
   for(const item of items){
    if(!item.product_id)continue;
    const pr=await supabase(env,`products?id=eq.${encodeURIComponent(item.product_id)}&select=id,stock`);const products=await pr.json();
    if(!Array.isArray(products)||!products[0])continue;
    const stock=Math.max(0,Number(products[0].stock||0)+Number(item.quantity||0));
    await supabase(env,`products?id=eq.${encodeURIComponent(item.product_id)}`,{method:"PATCH",body:JSON.stringify({stock,updated_at:now})});
   }
   patch.stock_released=true;
  }
  const ur=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}`,{method:"PATCH",body:JSON.stringify(patch)});
  if(!ur.ok)return json({error:"Order status update failed",details:await ur.text()},500);
  return json({ok:true,order_id:orderId,previous_status:current,order_status:next,stock_released:!!patch.stock_released});
 }catch(e){return json({error:"Order status API internal error",details:String(e?.message||e)},500)}
}

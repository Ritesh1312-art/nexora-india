import {json,readBody,supabase,validAdmin} from "./_utils.js";

const ALLOWED=new Set(["PENDING","ORDERED","SHIPPED","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED"]);
const TRANSITIONS={PENDING:new Set(["ORDERED","SHIPPED","CANCELLED"]),ORDERED:new Set(["SHIPPED","CANCELLED"]),SHIPPED:new Set(["IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED"]),IN_TRANSIT:new Set(["OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED"]),OUT_FOR_DELIVERY:new Set(["DELIVERED","CANCELLED","RETURNED"]),DELIVERED:new Set(["RETURNED"]),CANCELLED:new Set([]),RETURNED:new Set([])};
const ORDER_STATUS={SHIPPED:"SHIPPED",IN_TRANSIT:"SHIPPED",OUT_FOR_DELIVERY:"SHIPPED",DELIVERED:"DELIVERED",CANCELLED:"CANCELLED",RETURNED:"REFUNDED"};

export async function onRequestPost({request,env}){
 try{
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const b=await readBody(request),supplierOrderId=String(b.supplier_order_id||"").trim();
  if(!supplierOrderId)return json({error:"supplier_order_id is required"},400);
  const current=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(supplierOrderId)}&select=id,order_id,status,tracking_number,tracking_url,shipped_at,delivered_at`);
  const rows=await current.json().catch(()=>null);
  if(!current.ok||!Array.isArray(rows)||!rows[0])return json({error:"Supplier order not found"},404);
  const supplier=rows[0],orderId=supplier.order_id,currentStatus=String(supplier.status||"PENDING").toUpperCase();
  const orderRes=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&select=id,shipping_status,tracking_number,tracking_url,carrier,shipped_at,delivered_at,order_status`);
  const orderRows=await orderRes.json().catch(()=>null);
  if(!orderRes.ok||!Array.isArray(orderRows)||!orderRows[0])return json({error:"Customer order not found"},404);
  const currentOrder=orderRows[0];
  const status=String(b.shipping_status||b.status||currentOrder.shipping_status||"PENDING").toUpperCase();
  if(!ALLOWED.has(status))return json({error:"Invalid shipping status"},400);
  if(status!==currentStatus&&!TRANSITIONS[currentStatus]?.has(status))return json({error:`Invalid shipping transition: ${currentStatus} → ${status}`},409);
  const now=new Date().toISOString();
  const tracking_number=b.tracking_number==null?(currentOrder.tracking_number||supplier.tracking_number||null):String(b.tracking_number).trim()||null;
  const tracking_url=b.tracking_url==null?(currentOrder.tracking_url||supplier.tracking_url||null):String(b.tracking_url).trim()||null;
  const carrier=b.carrier==null?(currentOrder.carrier||null):String(b.carrier).trim()||null;
  if(["SHIPPED","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED"].includes(status)&&!tracking_number)return json({error:"Tracking number is required for this shipping status"},400);
  const shippedAt=(status==="SHIPPED"||status==="IN_TRANSIT"||status==="OUT_FOR_DELIVERY"||status==="DELIVERED")?(currentOrder.shipped_at||now):currentOrder.shipped_at||null;
  const deliveredAt=status==="DELIVERED"?(currentOrder.delivered_at||now):currentOrder.delivered_at||null;
  const sr=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(supplierOrderId)}&status=eq.${encodeURIComponent(currentStatus)}`,{method:"PATCH",body:JSON.stringify({status,tracking_number,tracking_url,shipped_at:shippedAt,delivered_at:deliveredAt,updated_at:now})});
  if(!sr.ok)return json({error:"Supplier tracking update failed",details:await sr.text()},500);
  const mapped=ORDER_STATUS[status];
  const orderPatch={shipping_status:status,tracking_number,tracking_url,carrier,shipped_at:shippedAt,delivered_at:deliveredAt,updated_at:now};
  if(mapped)orderPatch.order_status=mapped;
  const or=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}`,{method:"PATCH",body:JSON.stringify(orderPatch)});
  if(!or.ok)return json({error:"Customer tracking update failed",details:await or.text()},500);
  return json({ok:true,supplier_order_id:supplierOrderId,order_id:orderId,shipping_status:status,tracking_number,tracking_url,carrier});
 }catch(e){return json({error:"Shipping API internal error",details:String(e?.message||e)},500)}
}

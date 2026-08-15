import {json,supabase,validAdmin} from "./_utils.js";

const CJ_BASE="https://developers.cjdropshipping.com/api2.0/v1";
async function token(env){if(env.CJ_ACCESS_TOKEN)return String(env.CJ_ACCESS_TOKEN).trim();if(!env.CJ_API_KEY)throw new Error("CJ credentials are not configured");const r=await fetch(`${CJ_BASE}/authentication/getAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:String(env.CJ_API_KEY).trim()})});const d=await r.json().catch(()=>({}));if(!r.ok||d.code!==200||!d.data?.accessToken)throw new Error(`CJ authentication failed: ${String(d.message||JSON.stringify(d))}`);return d.data.accessToken;}
async function getOrder(t,id){const r=await fetch(`${CJ_BASE}/shopping/order/getOrderDetail?orderId=${encodeURIComponent(id)}`,{headers:{"CJ-Access-Token":t}});const d=await r.json().catch(()=>({}));if(!r.ok||d.code!==200)throw new Error(`CJ order lookup failed (${d.code||r.status}): ${String(d.message||JSON.stringify(d))}`);return d.data||{};}
function orderStatus(s){const x=String(s||"").toUpperCase();return ({SHIPPED:"SHIPPED",DELIVERED:"DELIVERED",CANCELLED:"CANCELLED",PROCESSING:"PROCESSING",UNSHIPPED:"PROCESSING"})[x]||null;}

export async function onRequestPost({request,env}){
 try{
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const b=await request.json().catch(()=>({}));
  const q=b.supplier_order_id?`id=eq.${encodeURIComponent(String(b.supplier_order_id))}`:"status=not.in.(DELIVERED,CANCELLED)&supplier_external_order_id=not.is.null";
  const sr=await supabase(env,`supplier_orders?${q}&select=id,order_id,supplier_external_order_id,status`);const rows=await sr.json();
  if(!sr.ok||!Array.isArray(rows))return json({error:"Unable to load CJ supplier orders"},500);
  const t=await token(env);let updated=0,failed=0;
  for(const so of rows){
   try{
    const d=await getOrder(t,so.supplier_external_order_id);const status=orderStatus(d.orderStatus||d.status),track=String(d.trackNumber||d.trackingNumber||"").trim();
    const patch={tracking_number:track||null,tracking_url:d.trackingUrl||null,carrier:d.trackingProvider||d.logisticName||null,tracking_status:d.orderStatus||d.status||null,tracking_last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    if(status)patch.status=status;
    const ur=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(so.id)}`,{method:"PATCH",body:JSON.stringify(patch)});if(!ur.ok)throw new Error("supplier order update failed");
    const op={shipping_status:d.orderStatus||d.status||null,tracking_number:track||null,tracking_url:d.trackingUrl||null,carrier:d.trackingProvider||d.logisticName||null};
    if(status==="SHIPPED")Object.assign(op,{order_status:"SHIPPED",shipped_at:new Date().toISOString()});
    if(status==="DELIVERED")Object.assign(op,{order_status:"DELIVERED",delivered_at:new Date().toISOString()});
    await supabase(env,`orders?id=eq.${encodeURIComponent(so.order_id)}`,{method:"PATCH",body:JSON.stringify(op)});updated++;
   }catch(e){failed++;await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(so.id)}`,{method:"PATCH",body:JSON.stringify({last_submission_error:String(e?.message||e),tracking_last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()})}).catch(()=>{});}
  }
  return json({ok:true,checked:rows.length,updated,failed});
 }catch(e){return json({error:"CJ tracking sync failed",details:String(e?.message||e)},500)}
}

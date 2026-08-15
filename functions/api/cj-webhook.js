import {json,supabase} from "./_utils.js";

function statusMap(n){const m={0:"NOT_AVAILABLE",1:"WAREHOUSE_SHIPPED",2:"FORWARDER_RECEIVED",3:"RETURN_INITIATED",4:"FORWARDER_DISPATCHED",5:"INTERNATIONAL_TRANSIT",6:"ARRIVED_DESTINATION",7:"CUSTOMS_INITIATED",8:"CUSTOMS_COMPLETED",9:"LAST_MILE",10:"OUT_FOR_DELIVERY",11:"READY_FOR_PICKUP",12:"DELIVERED",13:"DELIVERY_EXCEPTION",14:"RETURN"};return m[Number(n)]||null;}
async function validSignature(raw,sign,openId){
 if(!sign||!openId)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(openId)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
 let bin="";for(const b of new Uint8Array(digest))bin+=String.fromCharCode(b);
 return btoa(bin)===sign;
}

export async function onRequestPost({request,env}){
 try{
  const raw=await request.text();
  const openId=String(env.CJ_OPEN_ID||"").trim();
  if(!openId)return json({error:"CJ webhook signing secret is not configured"},500);
  if(!(await validSignature(raw,request.headers.get("sign")||"",openId)))return json({error:"Invalid CJ webhook signature"},401);
  const body=JSON.parse(raw);
  if(!body||body.type!=="LOGISTIC")return json({ok:true,ignored:true});
  const p=body.params||{};
  const cjId=String(p.orderId||"").trim(),track=String(p.trackingNumber||"").trim();
  if(!cjId&&!track)return json({ok:true,ignored:true});
  const q=cjId?`or=(supplier_external_order_id.eq.${encodeURIComponent(cjId)},supplier_order_number.eq.${encodeURIComponent(cjId)})&select=id,order_id`:`tracking_number=eq.${encodeURIComponent(track)}&select=id,order_id`;
  const sr=await supabase(env,`supplier_orders?${q}`);const rows=await sr.json();
  if(!sr.ok)return json({error:"Supplier lookup failed"},500);
  if(!Array.isArray(rows)||!rows.length)return json({ok:true,unmatched:true});
  const status=statusMap(p.trackingStatus),now=new Date().toISOString();
  const patch={tracking_number:track||null,tracking_url:p.trackingUrl||null,carrier:p.trackingProvider||p.logisticName||null,tracking_status:status||String(p.trackingStatus||""),tracking_last_checked_at:now,updated_at:now};
  if(Number(p.trackingStatus)===10)patch.status="SHIPPED";
  if(Number(p.trackingStatus)===12)patch.status="DELIVERED";
  if(Number(p.trackingStatus)===13||Number(p.trackingStatus)===14)patch.status="EXCEPTION";
  for(const row of rows){
   await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(row.id)}`,{method:"PATCH",body:JSON.stringify(patch)});
   const orderPatch={shipping_status:status||String(p.trackingStatus||""),tracking_number:track||null,tracking_url:p.trackingUrl||null,carrier:p.trackingProvider||p.logisticName||null};
   if(Number(p.trackingStatus)===10)Object.assign(orderPatch,{order_status:"SHIPPED",shipped_at:now});
   if(Number(p.trackingStatus)===12)Object.assign(orderPatch,{order_status:"DELIVERED",delivered_at:now});
   await supabase(env,`orders?id=eq.${encodeURIComponent(row.order_id)}`,{method:"PATCH",body:JSON.stringify(orderPatch)});
  }
  return json({ok:true,updated:rows.length});
 }catch(e){return json({error:"CJ webhook processing failed",details:String(e?.message||e)},500)}
}

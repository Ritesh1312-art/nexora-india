import {json,readBody,supabase,validAdmin} from "./_utils.js";

const ALLOWED = new Set(["PENDING","ORDERED","SHIPPED","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED"]);
const ORDER_STATUS = {SHIPPED:"SHIPPED",IN_TRANSIT:"SHIPPED",OUT_FOR_DELIVERY:"SHIPPED",DELIVERED:"DELIVERED",CANCELLED:"CANCELLED"};

export async function onRequestPost({request,env}) {
  try {
    if(!(await validAdmin(request,env))) return json({error:"Admin login required"},401);
    const b=await readBody(request);
    const supplierOrderId=String(b.supplier_order_id||"").trim();
    if(!supplierOrderId) return json({error:"supplier_order_id is required"},400);

    const current=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(supplierOrderId)}&select=id,order_id,status,shipping_status,tracking_number,tracking_url,carrier`);
    const rows=await current.json().catch(()=>null);
    if(!current.ok||!Array.isArray(rows)||!rows[0]) return json({error:"Supplier order not found"},404);

    const status=String(b.shipping_status||b.status||rows[0].shipping_status||"PENDING").toUpperCase();
    if(!ALLOWED.has(status)) return json({error:"Invalid shipping status"},400);
    const now=new Date().toISOString();
    const patch={
      shipping_status:status,
      carrier:b.carrier==null?rows[0].carrier:String(b.carrier).trim()||null,
      tracking_number:b.tracking_number==null?rows[0].tracking_number:String(b.tracking_number).trim()||null,
      tracking_url:b.tracking_url==null?rows[0].tracking_url:String(b.tracking_url).trim()||null,
      shipped_at:status==="SHIPPED"||status==="IN_TRANSIT"||status==="OUT_FOR_DELIVERY"?(rows[0].shipped_at||now):null,
      delivered_at:status==="DELIVERED"?(rows[0].delivered_at||now):null,
      updated_at:now
    };
    const ur=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(supplierOrderId)}`,{method:"PATCH",body:JSON.stringify(patch)});
    if(!ur.ok) return json({error:"Shipping update failed",details:await ur.text()},500);

    const mapped=ORDER_STATUS[status];
    if(mapped){
      const orderPatch={order_status:mapped,updated_at:now};
      const or=await supabase(env,`orders?id=eq.${encodeURIComponent(rows[0].order_id)}`,{method:"PATCH",body:JSON.stringify(orderPatch)});
      if(!or.ok) return json({error:"Supplier shipping updated but customer order status update failed",details:await or.text()},500);
    }
    return json({ok:true,supplier_order_id:supplierOrderId,order_id:rows[0].order_id,shipping_status:status,tracking_number:patch.tracking_number,tracking_url:patch.tracking_url,carrier:patch.carrier});
  }catch(e){return json({error:"Shipping API internal error",details:String(e?.message||e)},500)}
}

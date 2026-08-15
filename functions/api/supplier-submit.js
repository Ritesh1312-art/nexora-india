import {json,readBody,supabase,validAdmin} from "./_utils.js";

const CJ_BASE="https://developers.cjdropshipping.com/api2.0/v1";

async function cjToken(env){
  if(env.CJ_ACCESS_TOKEN) return String(env.CJ_ACCESS_TOKEN).trim();
  if(!env.CJ_API_KEY) throw new Error("CJ credentials are not configured");
  const r=await fetch(`${CJ_BASE}/authentication/getAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:String(env.CJ_API_KEY).trim()})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.code!==200||!d.data?.accessToken) throw new Error(`CJ authentication failed: ${String(d.message||JSON.stringify(d))}`);
  return d.data.accessToken;
}

async function cjFetch(token,path,opts={}){
  const r=await fetch(`${CJ_BASE}${path}`,{...opts,headers:{"CJ-Access-Token":token,"Content-Type":"application/json",...(opts.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.code!==200||d.result===false) throw new Error(`CJ API failed (${d.code||r.status}): ${String(d.message||JSON.stringify(d))}`);
  return d;
}

async function submitCJ(env,supabase,supplierOrderId){
  const sr=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(supplierOrderId)}&select=id,order_id,supplier_id,status,supplier_external_order_id,submission_attempts`);
  const s=await sr.json();
  if(!sr.ok||!Array.isArray(s)||!s[0]) throw new Error("Supplier order not found");
  const so=s[0];
  if(so.supplier_external_order_id) return {already_submitted:true,external_order_id:so.supplier_external_order_id};
  const or=await supabase(env,`orders?id=eq.${encodeURIComponent(so.order_id)}&select=id,order_number,customer_name,customer_email,customer_phone,address_line1,address_line2,city,state,pincode,landmark,customer_notes,payment_status`);
  const od=await or.json();
  if(!or.ok||!Array.isArray(od)||!od[0]) throw new Error("Customer order not found");
  const order=od[0];
  if(String(order.payment_status).toUpperCase()!=="VERIFIED") throw new Error("Customer payment must be VERIFIED before supplier submission");

  const ir=await supabase(env,`order_items?order_id=eq.${encodeURIComponent(order.id)}&select=id,product_id,quantity,sku,product_name`);
  const items=await ir.json();
  if(!ir.ok||!Array.isArray(items)||!items.length) throw new Error("Order has no items");
  const pids=[...new Set(items.map(x=>x.product_id).filter(Boolean))];
  const pr=await supabase(env,`products?id=in.(${pids.map(encodeURIComponent).join(",")})&select=id,source,source_product_id,source_sku,source_url`);
  const products=await pr.json();
  if(!pr.ok||!Array.isArray(products)) throw new Error("Unable to load supplier product mapping");
  const map=new Map(products.map(x=>[x.id,x]));
  const cjItems=items.map(x=>({item:x,p:map.get(x.product_id)})).filter(x=>String(x.p?.source||"").toUpperCase()==="CJ");
  if(!cjItems.length) throw new Error("No CJ products are attached to this supplier order");

  const token=await cjToken(env);
  const productsForOrder=[];
  for(const {item,p} of cjItems){
    const sku=String(p.source_sku||item.sku||"").trim();
    if(!sku) throw new Error(`CJ SKU missing for ${item.product_name}`);
    const vd=await cjFetch(token,`/product/variant/query?variantSku=${encodeURIComponent(sku)}&countryCode=CN`);
    const variants=Array.isArray(vd.data)?vd.data:[];
    const v=variants[0];
    if(!v?.vid) throw new Error(`CJ variant not found for ${sku}`);
    productsForOrder.push({vid:v.vid,quantity:Math.max(1,Number(item.quantity||1)),storeLineItemId:String(item.id)});
  }

  const freight=await cjFetch(token,"/logistic/freightCalculate",{method:"POST",body:JSON.stringify({startCountryCode:"CN",endCountryCode:"IN",zip:String(order.pincode||""),products:productsForOrder.map(x=>({vid:x.vid,quantity:x.quantity}))})});
  const options=Array.isArray(freight.data)?freight.data.filter(x=>x?.logisticName):[];
  if(!options.length) throw new Error("CJ returned no available shipping method for this destination");
  options.sort((a,b)=>Number(a.logisticPrice||a.totalPostageFee||Infinity)-Number(b.logisticPrice||b.totalPostageFee||Infinity));
  const logisticsName=options[0].logisticName;

  const body={
    orderNumber:String(order.order_number),
    shippingZip:String(order.pincode||""),
    shippingCountry:"India",
    shippingCountryCode:"IN",
    shippingProvince:String(order.state||""),
    shippingCity:String(order.city||""),
    shippingPhone:String(order.customer_phone||""),
    shippingCustomerName:String(order.customer_name||""),
    shippingAddress:String(order.address_line1||""),
    shippingAddress2:String(order.address_line2||order.landmark||""),
    email:String(order.customer_email||""),
    remark:String(order.customer_notes||"Nexora-India order"),
    payType:3,
    shopAmount:Number(0),
    logisticName:logisticsName,
    fromCountryCode:"CN",
    platform:"Api",
    shopLogisticsType:2,
    orderFlow:1,
    products:productsForOrder
  };
  const result=await cjFetch(token,"/shopping/order/createOrderV2",{method:"POST",body:JSON.stringify(body)});
  const externalId=result.data?.orderId||result.data?.shipmentOrderId||result.data?.orderNumber;
  if(!externalId) throw new Error("CJ accepted the request but returned no supplier order ID");
  const now=new Date().toISOString();
  const patch={supplier_external_order_id:String(externalId),supplier_order_number:String(result.data?.orderNumber||externalId),status:"CREATED_UNPAID",supplier_notes:JSON.stringify({cj_order_id:externalId,logistics_name:logisticsName,shipping_cost_usd:Number(options[0].logisticPrice||options[0].totalPostageFee||0),request_id:result.requestId||null}),submission_attempts:Number(so.submission_attempts||0)+1,last_submission_error:null,submitted_at:now,updated_at:now};
  const ur=await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(supplierOrderId)}`,{method:"PATCH",body:JSON.stringify(patch)});
  if(!ur.ok) throw new Error(`CJ order created but local supplier order update failed: ${await ur.text()}`);
  return {already_submitted:false,external_order_id:String(externalId),logistics_name:logisticsName,payable_status:"CREATED_UNPAID"};
}

export async function onRequestPost({request,env}){
  try{
    if(!(await validAdmin(request,env))) return json({error:"Admin login required"},401);
    const b=await readBody(request);
    const id=String(b.supplier_order_id||"").trim();
    if(!id) return json({error:"supplier_order_id is required"},400);
    try{
      const result=await submitCJ(env,supabase,id);
      return json({ok:true,...result});
    }catch(e){
      const msg=String(e?.message||e);
      try{await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({submission_attempts:1,last_submission_error:msg,updated_at:new Date().toISOString()})});}catch{}
      return json({error:"CJ supplier submission failed",details:msg},502);
    }
  }catch(e){return json({error:"Supplier submission API internal error",details:String(e?.message||e)},500)}
}

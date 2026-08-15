import {json,supabase,validAdmin} from "./_utils.js";

const CJ_BASE="https://developers.cjdropshipping.com/api2.0/v1";

async function getToken(env){
 const key=String(env.CJ_API_KEY||"").trim();
 if(key){const r=await fetch(`${CJ_BASE}/authentication/getAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})});const d=await r.json().catch(()=>({}));if(r.ok&&d.code===200&&d.data?.accessToken)return d.data.accessToken;}
 const token=String(env.CJ_ACCESS_TOKEN||"").trim();if(token)return token;
 throw new Error("CJ credentials are not configured");
}

async function cj(t,path,opts={}){const r=await fetch(`${CJ_BASE}${path}`,{...opts,headers:{"CJ-Access-Token":t,"Content-Type":"application/json",...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||d.code!==200||d.result===false)throw new Error(`CJ API ${path} failed (${d.code||r.status}): ${String(d.message||JSON.stringify(d))}`);return d;}

async function variantBySku(t,sku){const d=await cj(t,`/product/variant/query?variantSku=${encodeURIComponent(sku)}&countryCode=CN`);const v=Array.isArray(d.data)?d.data[0]:null;if(!v?.vid)throw new Error(`CJ variant not found for SKU ${sku}`);return v;}

async function chooseLogistics(t,products,pincode){
 const candidates=[];
 for(const p of products){
  const d=await cj(t,"/logistic/freightCalculate",{method:"POST",body:JSON.stringify({startCountryCode:"CN",endCountryCode:"IN",zip:String(pincode||""),products:[{quantity:Number(p.quantity),vid:p.vid}]})});
  const names=(Array.isArray(d.data)?d.data:[]).map(x=>x.logisticName).filter(Boolean);if(!names.length)throw new Error(`CJ returned no shipping method for SKU ${p.sku}`);candidates.push(names);
 }
 const common=candidates[0].find(n=>candidates.every(a=>a.includes(n)));return common||candidates[0][0];
}

export async function submitCJOrder(env,orderId){
 const t=await getToken(env);
 const or=await supabase(env,`orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_number,customer_name,customer_email,customer_phone,address_line1,address_line2,city,state,pincode,customer_notes`);const orders=await or.json();if(!or.ok||!orders?.[0])throw new Error("Order not found");const order=orders[0];
 const sr=await supabase(env,`supplier_orders?order_id=eq.${encodeURIComponent(orderId)}&supplier_external_order_id=is.null&status=eq.PENDING&select=id,supplier_id,supplier_notes`);const suppliers=await sr.json();
 if(!sr.ok||!Array.isArray(suppliers))throw new Error("Unable to load pending supplier orders");
 const results=[];
 for(const so of suppliers){
  const meta=JSON.parse(so.supplier_notes||"{}");if(String(meta.source).toUpperCase()!=="CJ")continue;
  const items=Array.isArray(meta.items)?meta.items:[];if(!items.length)continue;
  const variants=[];for(const item of items){const sku=String(item.sku||"").trim();if(!sku)throw new Error(`CJ SKU missing for ${item.product_name||item.product_id}`);const v=await variantBySku(t,sku);variants.push({...item,vid:v.vid,sku});}
  const logisticName=await chooseLogistics(t,variants,order.pincode);
  const payload={orderNumber:String(order.order_number),shippingZip:String(order.pincode),shippingCountry:"India",shippingCountryCode:"IN",shippingProvince:String(order.state),shippingCity:String(order.city),shippingPhone:String(order.customer_phone),shippingCustomerName:String(order.customer_name),shippingAddress:String(order.address_line1),shippingAddress2:String(order.address_line2||""),email:String(order.customer_email||""),remark:String(order.customer_notes||"Nexora-India order"),logisticName,fromCountryCode:"CN",platform:"Api",shopLogisticsType:2,orderFlow:1,payType:env.CJ_AUTO_PAY==="true"?2:3,products:variants.map(x=>({vid:x.vid,quantity:Number(x.quantity),storeLineItemId:String(x.order_item_id)}))};
  const d=await cj(t,"/shopping/order/createOrderV3",{method:"POST",body:JSON.stringify(payload)});const data=d.data||{};const external=String(data.orderId||data.shipmentOrderId||data.orderNumber||"");if(!external)throw new Error("CJ created the order but returned no order identifier");
  const status=env.CJ_AUTO_PAY==="true"?"PROCESSING":"CREATED";
  await supabase(env,`supplier_orders?id=eq.${encodeURIComponent(so.id)}`,{method:"PATCH",body:JSON.stringify({supplier_external_order_id:external,supplier_order_number:String(data.orderNumber||external),status,submitted_at:new Date().toISOString(),ordered_at:new Date().toISOString(),submission_attempts:1,last_submission_error:null,retryable:false,next_retry_at:null,updated_at:new Date().toISOString(),supplier_notes:JSON.stringify({...meta,cj_logistic_name:logisticName,cj_create_response:{orderId:data.orderId,shipmentOrderId:data.shipmentOrderId,orderStatus:data.orderStatus}})})});
  results.push({supplier_order_id:so.id,external_order_id:external,status});
 }
 return {submitted:results.length,results};
}

export async function onRequestPost({request,env}){try{if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);const b=await request.json().catch(()=>({}));if(!b.order_id)return json({error:"order_id is required"},400);return json({ok:true,...await submitCJOrder(env,b.order_id)});}catch(e){return json({error:"CJ order submission failed",details:String(e?.message||e)},502)}}

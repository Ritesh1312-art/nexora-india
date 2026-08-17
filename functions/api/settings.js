import {json,readBody,supabase,validAdmin} from "./_utils.js";

const PUBLIC_FIELDS='id,store_name,store_email,upi_id,currency,guest_checkout_enabled,user_registration_enabled,store_enabled,delivery_enabled,default_delivery_charge,electrical_delivery_charge,free_delivery_min_amount,updated_at';

export async function onRequestGet({request,env}){
  // This endpoint is an admin API. The storefront reads only PUBLIC_FIELDS directly
  // through the Supabase public/RLS path; never expose supplier automation/profit flags here.
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const r=await supabase(env,`admin_settings?id=eq.true&select=${PUBLIC_FIELDS}`);
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return json({error:"Unable to load settings",details:d},500);
  return json(Array.isArray(d)?(d[0]||{}):d);
}

export async function onRequestPost({request,env}){
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const b=await readBody(request);
  const allowed={};
  for(const k of ['store_name','store_email','telegram_username','upi_id','currency','guest_checkout_enabled','user_registration_enabled','store_enabled','auto_product_import_enabled','auto_stock_sync_enabled','auto_publish_products','minimum_profit_amount','minimum_profit_percent','delivery_enabled','default_delivery_charge','electrical_delivery_charge','free_delivery_min_amount'])if(Object.prototype.hasOwnProperty.call(b,k))allowed[k]=b[k];
  allowed.updated_at=new Date().toISOString();
  const r=await supabase(env,"admin_settings?id=eq.true",{method:"PATCH",body:JSON.stringify(allowed)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return json({error:"Unable to save settings",details:d},500);
  return json(Array.isArray(d)?(d[0]||{}):d);
}

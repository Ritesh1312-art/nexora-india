import {json,readBody,supabase,getSupabaseKey} from "./_utils.js";

export async function getUserId(request,env){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return null;
 const token=auth.slice(7).trim();if(!token)return null;
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:getSupabaseKey(env),Authorization:`Bearer ${token}`}});if(!r.ok)return null;
 const u=await r.json().catch(()=>null);return u?.id||null;
}

export async function eligible(offer,userId,env){
 const now=Date.now();if(!offer.active||!offer.admin_approved)return false;
 if(new Date(offer.starts_at).getTime()>now)return false;if(offer.ends_at&&new Date(offer.ends_at).getTime()<now)return false;
 if(offer.max_uses!=null&&Number(offer.used_count)>=Number(offer.max_uses))return false;
 const target=String(offer.target_type||"ALL").toUpperCase();if(target==="ALL")return true;if(!userId)return false;
 if(target==="SELECTED_USERS"){const r=await supabase(env,`offer_targets?offer_id=eq.${encodeURIComponent(offer.id)}&user_id=eq.${encodeURIComponent(userId)}&select=user_id`);const d=await r.json();return r.ok&&Array.isArray(d)&&d.length>0;}
 const pr=await supabase(env,`profiles?id=eq.${encodeURIComponent(userId)}&select=id,is_active,is_blocked`);const p=(await pr.json())?.[0];if(!p)return false;
 if(target==="ACTIVE_USERS")return !!p.is_active&&!p.is_blocked;if(target==="INACTIVE_USERS")return !p.is_active||!!p.is_blocked;
 const ur=await supabase(env,`orders?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=3`);const orders=await ur.json();const count=Array.isArray(orders)?orders.length:0;
 if(target==="NEW_USERS"||target==="NO_ORDER_USERS")return count===0;if(target==="EXISTING_CUSTOMERS")return count>0;if(target==="REPEAT_CUSTOMERS")return count>=2;return false;
}

export async function validateOffer({code,subtotal,quantity,userId,env}){
 const normalized=String(code||"").trim().toUpperCase(),amount=Number(subtotal||0),qty=Math.max(0,Number(quantity||0));
 if(!normalized)return {valid:false,error:"Offer code is required"};
 if(!Number.isFinite(amount)||amount<0)return {valid:false,error:"Invalid subtotal"};
 const r=await supabase(env,`offers?code=eq.${encodeURIComponent(normalized)}&select=*&limit=1`);const rows=await r.json();
 if(!r.ok||!Array.isArray(rows)||!rows[0])return {valid:false,error:"Invalid or unavailable offer code"};
 const offer=rows[0];if(!await eligible(offer,userId,env))return {valid:false,error:"You are not eligible for this offer"};
 if(qty<Number(offer.min_quantity||1))return {valid:false,error:`Minimum quantity is ${offer.min_quantity||1}`};
 if(amount<Number(offer.min_order_amount||0))return {valid:false,error:`Minimum order amount is ₹${Number(offer.min_order_amount||0).toFixed(2)}`};
 if(userId&&offer.max_uses_per_user!=null){const ur=await supabase(env,`offer_usage?offer_id=eq.${encodeURIComponent(offer.id)}&user_id=eq.${encodeURIComponent(userId)}&select=id`);const used=await ur.json();if(Array.isArray(used)&&used.length>=Number(offer.max_uses_per_user))return {valid:false,error:"Offer usage limit reached for this account"};}
 let discount=String(offer.offer_type)==="FLAT"?Number(offer.discount_amount||0):amount*(Number(offer.discount_percent||0)/100);
 if(offer.max_discount_amount!=null)discount=Math.min(discount,Number(offer.max_discount_amount));discount=Math.max(0,Math.min(discount,amount));
 return {valid:true,offer_id:offer.id,code:offer.code,discount_amount:Number(discount.toFixed(2)),discount_percent:Number(offer.discount_percent||0),final_subtotal:Number((amount-discount).toFixed(2))};
}

export async function onRequestPost({request,env}){
 try{const b=await readBody(request),userId=await getUserId(request,env);const result=await validateOffer({code:b.code,subtotal:b.subtotal,quantity:b.quantity,userId,env});return json(result,result.valid?200:400)}
 catch(e){return json({valid:false,error:"Offer validation failed",details:String(e?.message||e)},500)}
}

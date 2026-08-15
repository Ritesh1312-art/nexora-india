import {json,readBody,supabase,telegram} from "./_utils.js";
import {validateOffer} from "./offer.js";

export async function onRequestPost({request,env}) {
  const auth=request.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return json({error:"Login required"},401);
  const token=auth.slice(7);
  const user=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
  if(!user.ok)return json({error:"Invalid session"},401);
  const u=await user.json(), b=await readBody(request);
  if(!Array.isArray(b.items)||!b.items.length)return json({error:"Cart is empty"},400);
  const ids=[...new Set(b.items.map(x=>x.product_id).filter(Boolean))];
  const r=await supabase(env,`products?id=in.(${ids.map(encodeURIComponent).join(",")})&active=eq.true&approved_by_admin=eq.true&select=id,name,sku,cost_price,selling_price,stock,min_order_qty,delivery_charge`);
  const ps=await r.json();
  if(!Array.isArray(ps))return json({error:"Unable to load products"},500);
  let subtotal=0,cost=0,totalQty=0,items=[];
  for(const line of b.items){
    const p=ps.find(x=>x.id===line.product_id),qty=Math.max(1,Number(line.quantity||1));
    if(!p)return json({error:"A product is unavailable"},400);
    if(Number(p.stock)<qty)return json({error:`Insufficient stock for ${p.name}`},400);
    if(qty<Number(p.min_order_qty||1))return json({error:`Minimum order quantity for ${p.name} is ${p.min_order_qty||1}`},400);
    subtotal+=Number(p.selling_price)*qty;cost+=Number(p.cost_price)*qty;totalQty+=qty;
    items.push({product_id:p.id,product_name:p.name,sku:p.sku,quantity:qty,unit_selling_price:p.selling_price,unit_cost_price:p.cost_price,total_selling_price:Number(p.selling_price)*qty,total_cost_price:Number(p.cost_price)*qty});
  }
  const c=b.customer||{};if(!c.name||!c.phone||!c.address_line1||!c.city||!c.state||!c.pincode)return json({error:"Complete customer address is required"},400);
  let discount=0,offerId=null,offerCode=null;
  if(b.offer_code){
    const offer=await validateOffer({code:b.offer_code,subtotal,quantity:totalQty,userId:u.id,env});
    if(!offer.valid)return json({error:offer.error},400);
    discount=offer.discount_amount;offerId=offer.offer_id;offerCode=offer.code;
  }
  const shipping=items.reduce((sum,line)=>{const p=ps.find(x=>x.id===line.product_id);return sum+Number(p?.delivery_charge||0);},0);
  const total=Math.max(0,Number((subtotal-discount+shipping).toFixed(2)));
  const orderBody={user_id:u.id,customer_name:c.name,customer_email:u.email||null,customer_phone:c.phone,address_line1:c.address_line1,address_line2:c.address_line2||null,city:c.city,state:c.state,pincode:c.pincode,landmark:c.landmark||null,subtotal,discount_amount:discount,shipping_amount:shipping,total_amount:total,estimated_supplier_cost:cost,estimated_profit:Number((total-cost).toFixed(2)),offer_id:offerId,offer_code:offerCode,payment_method:"UPI",payment_status:b.utr?"SUBMITTED":"PENDING",utr:b.utr||null,order_status:b.utr?"PAYMENT_SUBMITTED":"PENDING_PAYMENT"};
  const or=await supabase(env,"orders",{method:"POST",body:JSON.stringify(orderBody)});const od=await or.json();if(!or.ok)return json({error:od?.message||"Order creation failed"},500);
  const order=od[0];
  const ir=await supabase(env,"order_items",{method:"POST",body:JSON.stringify(items.map(x=>({...x,order_id:order.id})))});if(!ir.ok)return json({error:"Order created but item save failed"},500);
  await telegram(env,`🛍️ NEXORA-INDIA NEW ORDER\nOrder: ${order.order_number}\nCustomer: ${c.name}\nPhone: ${c.phone}\nAmount: ₹${total}\nDiscount: ₹${discount}\nPayment: ${order.payment_status}\nUTR: ${b.utr||"not submitted"}`);
  return json({ok:true,order_number:order.order_number,total_amount:total,discount_amount:discount});
}

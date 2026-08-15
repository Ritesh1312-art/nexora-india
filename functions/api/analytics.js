import {json,supabase,validAdmin} from "./_utils.js";

export async function onRequestGet({request,env}){
 try{
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  const [ordersR,productsR,usersR,suppliersR]=await Promise.all([
   supabase(env,"orders?select=id,total_amount,payment_status,order_status,created_at"),
   supabase(env,"products?select=id,active,approved_by_admin,stock,source"),
   supabase(env,"profiles?select=id,created_at"),
   supabase(env,"supplier_orders?select=id,status,shipping_status,created_at")
  ]);
  const [orders,products,users,supplierOrders]=await Promise.all([ordersR.json(),productsR.json(),usersR.json(),suppliersR.json()]);
  if(!Array.isArray(orders)||!Array.isArray(products)||!Array.isArray(users)||!Array.isArray(supplierOrders))return json({error:"Analytics query failed"},502);
  const paid=orders.filter(o=>o.payment_status==="VERIFIED");
  const revenue=paid.reduce((s,o)=>s+Number(o.total_amount||0),0);
  const pendingPayments=orders.filter(o=>o.payment_status==="PENDING"||o.payment_status==="SUBMITTED").length;
  const activeProducts=products.filter(p=>p.active&&p.approved_by_admin).length;
  const lowStock=products.filter(p=>Number(p.stock||0)<=5&&p.active&&p.approved_by_admin).length;
  return json({orders:orders.length,revenue:Number(revenue.toFixed(2)),paid_orders:paid.length,pending_payments:pendingPayments,users:users.length,products:products.length,active_products:activeProducts,low_stock_products:lowStock,supplier_orders:supplierOrders.length,supplier_pending:supplierOrders.filter(s=>["PENDING","ORDERED"].includes(String(s.status||"").toUpperCase())).length,supplier_shipped:supplierOrders.filter(s=>["SHIPPED","IN_TRANSIT","OUT_FOR_DELIVERY"].includes(String(s.shipping_status||"").toUpperCase())).length});
 }catch(e){return json({error:"Analytics API internal error",details:String(e?.message||e)},500)}
}

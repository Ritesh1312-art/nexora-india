import {json,readBody,validAdmin} from "./_utils.js";
import {submitCJOrder} from "./cj-submit-order.js";

export async function onRequestPost({request,env}){
  try{
    if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
    const b=await readBody(request);
    const orderId=String(b.order_id||"").trim();
    if(!orderId)return json({error:"order_id is required"},400);
    const result=await submitCJOrder(env,orderId);
    return json({ok:true,...result});
  }catch(e){
    return json({error:"Supplier retry failed",details:String(e?.message||e)},502);
  }
}

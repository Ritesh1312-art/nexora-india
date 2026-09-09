import {json,readBody,supabase,validAdmin,getSupabaseKey} from "./_utils.js";
import {syncCJRobust} from "./cj-sync-v2.js";
import {syncDeodap} from "./deodap.js";

const CJ=["Footwear","Kitchen Appliances","Clothes","Fitness","Pet"];
const DEODAP=["Artificial Jewellery","Daily Use","Car Accessories","Electrical Appliances","Mobile Accessories"];
const names=[...CJ,...DEODAP];

export async function onRequestPost({request,env}){
 try{
  if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);
  if(!env.SUPABASE_URL||!getSupabaseKey(env))return json({error:"Server database configuration is incomplete"},500);
  const b=await readBody(request),action=String(b.action||"");
  if(action!=="sync_category")return json({error:"Use sync_category with a category index (0-9)."},400);
  const index=Number(b.index);
  if(!Number.isInteger(index)||index<0||index>=names.length)return json({error:"Invalid supplier category index"},400);
  const name=names[index],source=index<5?"CJ":"DeoDap";
  try{
   if(index<5){
    const r=await syncCJRobust(env,(e,q,o)=>supabase(e,q,o),index);
    return json({ok:true,name,source,count:Number(r.imported||0),status:"done",warnings:r.warnings||[]});
   }
   const r=await syncDeodap(env,(e,q,o)=>supabase(e,q,o),{cursor:(index-5)*100000});
   return json({ok:true,name,source,count:Number(r.imported||0),status:"done",warnings:r.warnings||[],skipped_no_stock:Number(r.skipped_no_stock||0)});
  }catch(e){
   return json({ok:false,name,source,count:0,status:"failed",error:String(e?.message||e)},502);
  }
 }catch(e){return json({error:"Supplier sync failed",details:String(e?.message||e)},500)}
}

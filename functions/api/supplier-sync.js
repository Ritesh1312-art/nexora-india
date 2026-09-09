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
  if(action!=="sync_all")return json({error:"Unknown supplier sync action"},400);
  const results=[],errors=[];let total=0;
  for(let i=0;i<5;i++){
   try{const r=await syncCJRobust(env,(e,q,o)=>supabase(e,q,o),i);const n=Number(r.imported||0);total+=n;results.push({name:CJ[i],source:"CJ",count:n,status:"done",warnings:r.warnings||[]})}
   catch(e){results.push({name:CJ[i],source:"CJ",count:0,status:"failed",error:String(e?.message||e)});errors.push(`CJ / ${CJ[i]}: ${String(e?.message||e)}`)}
  }
  for(let i=0;i<5;i++){
   try{const r=await syncDeodap(env,(e,q,o)=>supabase(e,q,o),{cursor:i*100000});const n=Number(r.imported||0);total+=n;results.push({name:DEODAP[i],source:"DeoDap",count:n,status:"done",warnings:r.warnings||[],skipped_no_stock:Number(r.skipped_no_stock||0)})}
   catch(e){results.push({name:DEODAP[i],source:"DeoDap",count:0,status:"failed",error:String(e?.message||e)});errors.push(`DeoDap / ${DEODAP[i]}: ${String(e?.message||e)}`)}
  }
  return json({ok:errors.length===0,total,completed:results.filter(x=>x.status==="done").length,failed:results.filter(x=>x.status==="failed").length,results,errors});
 }catch(e){return json({error:"Supplier sync failed",details:String(e?.message||e)},500)}
}

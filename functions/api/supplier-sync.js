import {json,readBody,supabase,validAdmin,getSupabaseKey} from "./_utils.js";
import {syncCJRobust} from "./cj-sync-v2.js";
import {syncDeodap, syncDeodapCategory} from "./deodap.js";

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
   const keyByIndex={0:"footwear",1:"kitchen",2:"clothes",3:"fitness",4:"pet",5:"jewellery",6:"daily",7:"car",8:"electrical",9:"mobile"};
   const key=keyByIndex[index],dual=new Set(["clothes","fitness","pet","electrical","mobile"]);
   const results=[],errors=[];
   const run=async(label,fn)=>{try{const r=await fn();results.push({source:label,result:r});}catch(e){errors.push(`${label}: ${String(e?.message||e)}`)}};
   if(index<5 || dual.has(key)) await run("CJ",()=>syncCJRobust(env,(e,q,o)=>supabase(e,q,o),key));
   if(index>=5 || dual.has(key)) await run("DeoDap",()=>syncDeodapCategory(env,(e,q,o)=>supabase(e,q,o),key));
   const count=results.reduce((n,x)=>n+Number(x.result?.imported||0),0),warnings=results.flatMap(x=>x.result?.warnings||[]).concat(errors);
   if(count>0)return json({ok:true,name,source:results.map(x=>x.source).join("+"),count,status:"done",warnings});
   return json({ok:false,name,source,count:0,status:"failed",error:warnings.join(" | ")||"No products imported from configured suppliers",warnings});
  }catch(e){
   return json({ok:false,name,source,count:0,status:"failed",error:String(e?.message||e)},502);
  }
 }catch(e){return json({error:"Supplier sync failed",details:String(e?.message||e)},500)}
}

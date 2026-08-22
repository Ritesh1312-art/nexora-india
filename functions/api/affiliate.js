import {json,readBody,supabase} from "./_utils.js";

// Nexora-India affiliate API.
//  GET  /api/affiliate?track=CODE   → count a referral click (public, no user data exposed)
//  POST {action:"join"}             → logged-in user joins the program (idempotent)
//  POST {action:"my"}               → my code, link stats and earnings
//  POST {action:"update_upi"}       → save my payout UPI id
// All DB writes use the service role; direct table inserts are blocked by RLS.

async function bearerUser(request,env){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return null;
 const token=auth.slice(7);
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
 if(!r.ok)return null;return r.json();
}
const CODE_RE=/^[A-Za-z0-9-]{4,24}$/;
function newCode(){return "NX"+crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function affiliateByUser(env,userId){
 // 3-tier fallback + retries: a stale prod shape (missing commission_percent
 // before the 2026-08-22 migration) or a transient network error must never
 // surface as a dead-end "Affiliate API error".
 const tiers=[
  "id,user_id,code,display_name,payout_upi,status,commission_percent,created_at",
  "id,user_id,code,display_name,payout_upi,status,created_at",
  "id,user_id,code,display_name,payout_upi,status"
 ];
 let lastErr=null;
 for(const cols of tiers){
  for(let attempt=0;attempt<2;attempt++){
   try{
    const r=await supabase(env,`affiliates?user_id=eq.${encodeURIComponent(userId)}&select=${cols}&limit=1`);
    const d=await r.json().catch(()=>null);
    if(r.ok)return Array.isArray(d)?(d[0]||null):null;
    lastErr=d;
    // Schema-level failure → drop the missing column and try the next tier.
    if(/commission_percent|does not exist|schema cache/i.test(String(d?.message||"")))break;
    if(attempt===0)await sleep(300);
   }catch(e){lastErr=e;if(attempt===0)await sleep(300);}
  }
 }
 throw new Error("Unable to load affiliate profile"+(lastErr?`: ${String(lastErr?.message||lastErr||"")}`:""));
}
async function storeDefault(env){
 const r=await supabase(env,"admin_settings?select=affiliate_enabled,affiliate_commission_percent&limit=1");
 const d=await r.json().catch(()=>null);
 const row=Array.isArray(d)&&d[0]?d[0]:{};
 return {enabled:row.affiliate_enabled!==false,percent:Number(row.affiliate_commission_percent||0)};
}

export async function onRequestGet({request,env}){
 try{
  // Codes are canonical uppercase (joined codes are generated uppercase).
  const url=new URL(request.url),code=String(url.searchParams.get("track")||"").trim().toUpperCase();
  if(!CODE_RE.test(code))return json({error:"Invalid code"},400);
  const r=await supabase(env,`affiliates?code=eq.${encodeURIComponent(code)}&status=eq.active&select=id&limit=1`);
  const d=await r.json().catch(()=>null);
  const aff=Array.isArray(d)?d[0]:null;
  if(!aff)return json({ok:false},404);
  await supabase(env,"affiliate_clicks",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({affiliate_id:aff.id})});
  return json({ok:true});
 }catch(e){return json({error:"Track error",details:String(e?.message||e)},500)}
}

export async function onRequestPost({request,env}){
 try{
  const user=await bearerUser(request,env);
  if(!user)return json({error:"Login required"},401);
  const b=await readBody(request),a=String(b.action||"").toLowerCase();
  const settings=await storeDefault(env);

  if(a==="join"){
   if(!settings.enabled)return json({error:"Affiliate program is currently paused"},409);
   const existing=await affiliateByUser(env,user.id);
   if(existing)return json({ok:true,affiliate:existing,already:true});
   const name=String(user.user_metadata?.full_name||user.email||"Affiliate").slice(0,80);
   // Retry a handful of times on the (astronomically rare) code collision.
   let created=null,lastErr=null;
   for(let i=0;i<5&&!created;i++){
    const r=await supabase(env,"affiliates",{method:"POST",body:JSON.stringify({user_id:user.id,code:newCode(),display_name:name})});
    const d=await r.json().catch(()=>null);
    if(r.ok&&Array.isArray(d)&&d[0])created=d[0];else lastErr=d;
   }
   if(!created)return json({error:"Could not create your affiliate account",details:lastErr},500);
   return json({ok:true,affiliate:created});
  }

  if(a==="my"){
   const aff=await affiliateByUser(env,user.id);
   if(!aff)return json({affiliate:null,enabled:settings.enabled,percent:settings.percent});
   const [clicks,refs]=await Promise.all([
    supabase(env,`affiliate_clicks?affiliate_id=eq.${encodeURIComponent(aff.id)}&select=id`,{headers:{Prefer:"count=exact"}}),
    supabase(env,`affiliate_referrals?affiliate_id=eq.${encodeURIComponent(aff.id)}&select=id,order_id,order_number,order_amount,commission_amount,status,created_at&order=created_at.desc&limit=200`)
   ]);
   const clickCount=Number(clicks.headers.get("content-range")?.split("/")[1])||0;
   const refRows=await refs.json().catch(()=>null);
   const list=Array.isArray(refRows)?refRows:[];
   const sum=(st)=>list.filter(x=>x.status===st).reduce((s,x)=>s+Number(x.commission_amount||0),0);
   return json({affiliate:aff,enabled:settings.enabled,store_percent:settings.percent,stats:{
    clicks:clickCount,orders:list.length,
    pending:Number(sum("PENDING").toFixed(2)),
    qualified:Number(sum("QUALIFIED").toFixed(2)),
    paid:Number(sum("PAID").toFixed(2))
   },referrals:list});
  }

  if(a==="update_upi"){
   const upi=String(b.upi||"").trim();
   if(upi&&!/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(upi))return json({error:"Invalid UPI id format (example: name@okhdfcbank)"},400);
   const aff=await affiliateByUser(env,user.id);
   if(!aff)return json({error:"Join the affiliate program first"},404);
   const r=await supabase(env,`affiliates?id=eq.${encodeURIComponent(aff.id)}`,{method:"PATCH",body:JSON.stringify({payout_upi:upi||null,updated_at:new Date().toISOString()})});
   if(!r.ok)return json({error:"Unable to save UPI id"},500);
   return json({ok:true});
  }

  return json({error:"Unknown affiliate action"},400);
 }catch(e){return json({error:"Affiliate API error",details:String(e?.message||e)},500)}
}

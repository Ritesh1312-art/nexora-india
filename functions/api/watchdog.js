import {json,supabase,telegram} from "./_utils.js";
import {syncDeodap} from "./deodap.js";

// Nexora-India watchdog: called by the Cloudflare cron worker
// (worker/watchdog-scheduler.js, "30 3,15 * * *").
//  - verifies Supabase health and key operational counters
//  - optionally runs the DeoDap supplier sync (WATCHDOG_DEODAP_SYNC=true)
//  - sends a Telegram report and returns a JSON summary
//
// Access is gated by WATCHDOG_SECRET (query param ?secret= or Bearer header).
// If WATCHDOG_SECRET is not configured the endpoint refuses to run (fail-closed).

function constantEq(a,b){let diff=(a.length||0)^(b.length||0);const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}

async function authorized(request,env){
 const secret=typeof env.WATCHDOG_SECRET==="string"?env.WATCHDOG_SECRET.trim():"";
 if(!secret)return {ok:false,error:"WATCHDOG_SECRET is not configured. Refusing to run the watchdog."};
 const auth=request.headers.get("Authorization")||"";
 let provided="";
 try{
  const url=new URL(request.url);
  provided=(auth.startsWith("Bearer ")?auth.slice(7).trim():url.searchParams.get("secret")||"").trim();
 }catch{return {ok:false,error:"Invalid watchdog request"}}
 if(!provided)return {ok:false,error:"Missing watchdog secret"};
 if(!constantEq(provided,secret))return {ok:false,error:"Invalid watchdog secret"};
 return {ok:true};
}

async function list(env,path){
 try{
  const r=await supabase(env,path);
  if(!r.ok)return {ok:false,rows:[]};
  const d=await r.json().catch(()=>null);
  return {ok:true,rows:Array.isArray(d)?d:[]};
 }catch{return {ok:false,rows:[]}}
}

export async function onRequest(context){
 const {request,env}=context;
 try{
  if(request.method!=="GET"&&request.method!=="POST")return json({error:"Use GET or POST"},405);
  const auth=await authorized(request,env);
  if(!auth.ok)return json({ok:false,error:auth.error},403);

  const report={ts:new Date().toISOString(),supabase:"unknown",counts:{},issues:[],deodap:null};
  const fail=env=>{
   if(!env.SUPABASE_URL)return "SUPABASE_URL missing";
   return null;
  };
  const missing=fail(env);
  if(missing){
   report.supabase="unconfigured";
   report.issues.push(missing);
  }else{
   // 1) Supabase health check
   const health=await list(env,"products?select=id&limit=1");
   report.supabase=health.ok?"ok":"unreachable";
   if(!health.ok)report.issues.push("Supabase REST unreachable or misconfigured");
   if(report.supabase==="ok"){
    // 2) Operational counters
    const [live,lowStock,pendingPayments,staleOrders,openTickets,stuckSupplier]=await Promise.all([
     list(env,"products?select=id&active=eq.true&approved_by_admin=eq.true"),
     list(env,"products?select=id,stock&active=eq.true&approved_by_admin=eq.true"),
     list(env,"orders?select=id&payment_status=in.(PENDING,SUBMITTED)"),
     list(env,`orders?select=id,created_at&payment_status=eq.PENDING&created_at=lt.${new Date(Date.now()-24*60*60*1000).toISOString()}`),
     list(env,"support_tickets?select=id&status=in.(open,in_progress)"),
     list(env,"supplier_orders?select=id,status,last_submission_error&status=in.(PENDING,SUBMITTING)")
    ]);
    report.counts={
     live_products:live.rows.length,
     low_stock_products:lowStock.rows.filter(x=>Number(x.stock||0)<=5).length,
     pending_payments:pendingPayments.rows.length,
     stale_pending_orders_24h:staleOrders.rows.length,
     open_support_tickets:openTickets.rows.length,
     stuck_supplier_orders:stuckSupplier.rows.length
    };
    if(live.rows.length===0)report.issues.push("No live products published");
    if(pendingPayments.rows.length>20)report.issues.push(`${pendingPayments.rows.length} payments waiting for verification`);
    if(staleOrders.rows.length>0)report.issues.push(`${staleOrders.rows.length} unpaid orders pending for over 24h`);
    if(openTickets.rows.length>10)report.issues.push(`${openTickets.rows.length} support tickets open`);
    if(stuckSupplier.rows.length>0)report.issues.push(`${stuckSupplier.rows.length} supplier orders stuck in PENDING/SUBMITTING`);
   }
   // 3) Optional DeoDap sync — chunked: continue from the returned cursor for
   // at most 6 slices so one watchdog invocation stays inside the Cloudflare
   // subrequest/CPU budget while still finishing the whole collection list.
   if(String(env.WATCHDOG_DEODAP_SYNC||"").toLowerCase()==="true"&&report.supabase==="ok"){
    try{
     let cursor=0,slices=0,acc={daily:0,jewellery:0,imported:0},last=null;
     while(slices<6){
      last=await syncDeodap(env,supabase,{cursor});
      acc.daily+=last.daily||0;acc.jewellery+=last.jewellery||0;acc.imported+=last.imported||0;
      slices++;
      if(last.done)break;
      cursor=last.cursor;
     }
     report.deodap={ok:true,daily:acc.daily,jewellery:acc.jewellery,imported:acc.imported,slices,done:!!last?.done};
     if(!last?.done)report.issues.push(`DeoDap sync not finished in ${slices} watchdog slices (continue in next run)`);
    }catch(e){
     report.deodap={ok:false,error:String(e?.message||e)};
     report.issues.push(`DeoDap sync failed: ${String(e?.message||e)}`);
    }
   }
  }
  // 4) Telegram report
  const c=report.counts;
  const lines=[
   "🐕 NEXORA-INDIA WATCHDOG",
   `Supabase: ${report.supabase}`,
   `Live products: ${c.live_products??"-"} · Low stock: ${c.low_stock_products??"-"}`,
   `Pending payments: ${c.pending_payments??"-"} · Stale orders (24h): ${c.stale_pending_orders_24h??"-"}`,
   `Open tickets: ${c.open_support_tickets??"-"} · Stuck supplier orders: ${c.stuck_supplier_orders??"-"}`
  ];
  if(report.deodap)lines.push(`DeoDap sync: ${report.deodap.ok?`ok (daily ${report.deodap.daily}, jewellery ${report.deodap.jewellery}, imported ${report.deodap.imported})`:"FAILED — "+report.deodap.error}`);
  if(report.issues.length)lines.push("",...report.issues.map(x=>`⚠️ ${x}`));
  else lines.push("","✅ No issues detected");
  await telegram(env,lines.join("\n"));
  return json({ok:report.issues.length===0,report});
 }catch(e){
  return json({ok:false,error:"Watchdog run failed",details:String(e?.message||e)},500);
 }
}

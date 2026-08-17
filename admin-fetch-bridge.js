(()=>{'use strict';
const original=window.fetch.bind(window);
const readOnlyAdminActions=new Set(['stats','products','users','orders','offers']);
const readOnlyOpsActions=new Set(['categories','reviews','support','shipping_orders','settings']);
const fallbackFor=(action)=>{
 if(action==='stats') return {products:0,users:0,orders:0,sales:0};
 if(action==='settings') return {};
 return [];
};
const safeResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
const safeReadFallback=async(r,action)=>{let d={};try{d=await r.json()}catch{};const detail=d.details?` — ${String(d.details)}`:'';window.__adminDataWarnings.push(`${action}: server returned ${r.status}${detail}`);return safeResponse(fallbackFor(action));};
window.__adminDataWarnings=[];
window.fetch=async(input,init={})=>{
 const url=typeof input==='string'?input:input?.url||'';
 if(init?.body){
  let body=null; try{body=JSON.parse(init.body)}catch{}
  if(url.endsWith('/api/admin')&&body?.action==='verify_payment'){
   const headers=new Headers(init.headers||{});
   return original('/api/admin-payment',{...init,body:JSON.stringify({order_id:body.order_id,status:body.status}),headers});
  }
  if(url.endsWith('/api/admin')&&body?.action==='cj_sync'){
   try{return await original(input,init)}catch(e){return new Response(JSON.stringify({error:`CJ sync request failed — ${e?.message||'network error'}`}),{status:502,headers:{'content-type':'application/json'}})}
  }
  if(url.endsWith('/api/admin')&&body?.action==='deodap_sync'){
   try{return await original(input,init)}catch(e){return new Response(JSON.stringify({error:`DeoDap sync request failed — ${e?.message||'network error'}`}),{status:502,headers:{'content-type':'application/json'}})}
  }
  const isAdminRead=url.endsWith('/api/admin')&&readOnlyAdminActions.has(body?.action);
  const isOpsRead=url.endsWith('/api/admin-ops')&&readOnlyOpsActions.has(body?.action);
  if(isAdminRead||isOpsRead){
   try{
    const r=await original(input,init);
    if(r.ok)return r;
    return safeReadFallback(r,body.action);
   }catch(e){
    window.__adminDataWarnings.push(`${body.action}: ${e?.message||'request failed'}`);
    return safeResponse(fallbackFor(body.action));
   }
  }
 }
 return original(input,init);
};
const showWarnings=()=>{
 if(!window.__adminDataWarnings?.length)return;
 const dash=document.querySelector('#dash'); if(!dash)return;
 const existing=document.querySelector('#adminDataWarning');
 const text=window.__adminDataWarnings.join(' | ');
 if(existing){existing.textContent=`Admin data warning: ${text}`;return;}
 const box=document.createElement('div');box.id='adminDataWarning';box.className='notice error';box.textContent=`Admin data warning: ${text}`;dash.prepend(box);
};
new MutationObserver(showWarnings).observe(document.documentElement,{childList:true,subtree:true});
})();
export const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...(extra.headers||{})}});
export async function readBody(req){try{return await req.json()}catch{return {}}}
export function getSupabaseKey(env){return env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||""}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function supabase(env,path,opts={}){
 const key=getSupabaseKey(env);
 if(!env.SUPABASE_URL)return new Response(JSON.stringify({error:"SUPABASE_URL is not configured"}),{status:500,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
 if(!key)return new Response(JSON.stringify({error:"SUPABASE_SECRET_KEY is not configured"}),{status:500,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
 const headers={"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation",...(opts.headers||{})};
 const request={...opts,headers};
 const first=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,request);
 if(first.status!==401)return first;
 try{
  const body=await first.clone().json().catch(()=>null);
  const msg=String(body?.message||body?.error||"").toLowerCase();
  const isFuture=body?.code==="PGRST303"||msg.includes("jwt issued at future");
  if(!isFuture)return first;
  await sleep(1500);
  return await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,request);
 }catch{return first}
}
export function b64u(bytes){let s="";if(typeof bytes==="string")s=bytes;else s=String.fromCharCode(...new Uint8Array(bytes));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
export function unb64u(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return atob(s)}
export async function signAdmin(env){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.JWT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const payload=b64u(new TextEncoder().encode(JSON.stringify({sub:"admin",iat:Date.now(),exp:Date.now()+8*60*60*1000})));const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));return `${payload}.${b64u(sig)}`}
export async function validAdmin(req,env){const c=req.headers.get("Cookie")||"";const m=c.match(/nexora_admin=([^;]+)/);if(!m)return false;try{const [p,s]=m[1].split(".");const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.JWT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);const ok=await crypto.subtle.verify("HMAC",key,Uint8Array.from(unb64u(s),c=>c.charCodeAt(0)),new TextEncoder().encode(p));if(!ok)return false;const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(unb64u(p),c=>c.charCodeAt(0))));return data.sub==="admin"&&data.exp>Date.now()}catch{return false}}
export async function telegram(env,text){if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;try{await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})})}catch{}}

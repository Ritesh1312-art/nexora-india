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
export async function rateLimit(request,env,route,limit,windowSeconds){
 // Trust only CF-Connecting-IP (set by Cloudflare and not spoofable by the
 // client). X-Forwarded-For is client-controlled and would let an attacker
 // rotate IPs to bypass login/API rate limits.
 const ip=(request.headers.get("CF-Connecting-IP")||"").split(",")[0].trim().slice(0,128)||"unknown";
 const raw=`nexora-rate:${route}:${ip}`;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
 const key=b64u(digest);
 let r;
 try{
  r=await supabase(env,"rpc/consume_api_rate_limit",{method:"POST",body:JSON.stringify({p_key:key,p_limit:limit,p_window_seconds:windowSeconds})});
 }catch{
  // Fail-open: the limiter backend (Supabase) is unreachable — allow traffic.
  return {allowed:true,failOpen:true,retryAfter:0};
 }
 // Fail-open: if the rate-limit counter (Supabase RPC) is unreachable we must
 // not take the whole store/admin offline. Availability wins over limiting.
 if(!r.ok)return {allowed:true,failOpen:true,retryAfter:0};
 const d=await r.json().catch(()=>null);const row=Array.isArray(d)?d[0]:d;
 return {allowed:row?.allowed===true,failOpen:false,retryAfter:Math.max(1,Number(row?.retry_after_seconds||1))};
}
export async function verifyAdminPassword(password,storedHash){
 if(typeof password!=="string"||!password||typeof storedHash!=="string")return false;
 const parts=storedHash.split("$");
 if(parts.length!==4||parts[0]!=="pbkdf2-sha256")return false;
 const iterations=Number(parts[1]);
 if(!Number.isInteger(iterations)||iterations<100000||iterations>1000000)return false;
 try{
  const salt=Uint8Array.from(atob(parts[2]),c=>c.charCodeAt(0));
  const expected=Uint8Array.from(atob(parts[3]),c=>c.charCodeAt(0));
  if(salt.length<16||expected.length!==32)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations,hash:"SHA-256"},key,256);
  const actual=new Uint8Array(bits);let diff=actual.length^expected.length;
  for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];
  return diff===0;
 }catch{return false}
}
export function b64u(bytes){let s="";if(typeof bytes==="string")s=bytes;else s=String.fromCharCode(...new Uint8Array(bytes));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
// Admin credential lookup: the PBKDF2 hash (ADMIN_PASSWORD_HASH) is the
// preferred credential. A plain ADMIN_PASSWORD value is accepted as a
// fallback when no hash is configured (handy for dev/staging setups).
export function getAdminPasswordHash(env){
 const hash=typeof env.ADMIN_PASSWORD_HASH==="string"?env.ADMIN_PASSWORD_HASH.trim():"";
 const plain=typeof env.ADMIN_PASSWORD==="string"?env.ADMIN_PASSWORD.trim():"";
 return {hash,plain};
}
function constantTimeStringEq(a,b){let diff=(a.length||0)^(b.length||0);const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
export async function checkAdminPassword(env,password){
 const value=typeof password==="string"?password:"";
 if(!value)return false;
 const cfg=getAdminPasswordHash(env);
 if(cfg.hash)return verifyAdminPassword(value,cfg.hash);
 if(cfg.plain)return constantTimeStringEq(value,cfg.plain);
 return false;
}
export function unb64u(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return atob(s)}
export async function signAdmin(env){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.JWT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const now=Date.now();const payload=b64u(new TextEncoder().encode(JSON.stringify({sub:"admin",iat:now,exp:now+8*60*60*1000})));const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));return `${payload}.${b64u(sig)}`}
export async function validAdmin(req,env){
 const cookie=req.headers.get("Cookie")||"";
 const cookieMatch=cookie.match(/(?:^|;\s*)nexora_admin=([^;]+)/);
 const auth=req.headers.get("Authorization")||"";
 const bearer=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
 const token=bearer||cookieMatch?.[1]||"";
 if(!token)return false;
 try{
  const [p,s]=token.split(".");
  if(!p||!s)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.JWT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const ok=await crypto.subtle.verify("HMAC",key,Uint8Array.from(unb64u(s),c=>c.charCodeAt(0)),new TextEncoder().encode(p));
  if(!ok)return false;
  const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(unb64u(p),c=>c.charCodeAt(0))));
  return data.sub==="admin"&&Number(data.exp)>Date.now();
 }catch{return false}
}
// SSRF guard for admin-supplied image URLs (Gemini description generation).
// Blocks non-http(s) protocols, localhost/internal hostnames and private,
// loopback, link-local and unspecified IP literals so a URL cannot be used to
// probe Cloudflare metadata endpoints or internal services.
export function isSafePublicUrl(value){
 let u;try{u=new URL(String(value||""))}catch{return false}
 if(!["http:","https:"].includes(u.protocol))return false;
 const host=u.hostname.toLowerCase();
 if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".lan"))return false;
 if(host==="0.0.0.0"||host==="[::]")return false;
 const ipv4=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if(ipv4){
  const a=+ipv4[1],b=+ipv4[2],c=+ipv4[3],d=+ipv4[4];
  if(a>255||b>255||c>255||d>255)return false;
  if(a===127)return false;                                   // loopback
  if(a===10)return false;                                    // private
  if(a===172&&b>=16&&b<=31)return false;                     // private
  if(a===192&&b===168)return false;                          // private
  if(a===169&&b===254)return false;                          // link-local (metadata)
  if(a===100&&b>=64&&b<=127)return false;                    // CGNAT
  if(a===192&&b===0&&c===0)return false;                     // IETF special
  if(a===198&&(b===18||b===19))return false;                 // benchmarking
  if(a>=224)return false;                                    // multicast/reserved
  return true;
 }
 const ipv6=host.startsWith("[")&&host.endsWith("]")?host.slice(1,-1):host;
 if(ipv6.includes(":")){
  const h=ipv6.toLowerCase();
  if(h==="::1")return false;                                 // loopback
  if(h==="::")return false;                                  // unspecified
  if(/^f[cd]/.test(h))return false;                          // fc00::/7 unique-local
  if(/^fe[89ab]/.test(h))return false;                       // fe80::/10 link-local
  return true;
 }
 return true;
}
function sanitizeTelegram(text){return String(text??"")
 .replace(/(^|\n)(Customer|Name|Phone|Email|Address|Address Line 1|Address Line 2|City|State|Pincode|Landmark)\s*:\s*[^\n]*/gi,"$1$2: [REDACTED]")
 .replace(/(^|\n)UTR\s*:\s*[^\n]*/gi,"$1UTR: [REDACTED]")
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[REDACTED_EMAIL]")
 .replace(/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g,"[REDACTED_PHONE]");}
export async function telegram(env,text){if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;try{await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:sanitizeTelegram(text)})})}catch{}}

import {json,rateLimit} from "./api/_utils.js";

export async function onRequest(context){
  const {request}=context;
  const url=new URL(request.url);
  const path=url.pathname;
  if(!path.startsWith("/api/"))return context.next();
  if(request.method==="OPTIONS")return context.next();

  let limit=120;
  let windowSeconds=60;
  let sensitive=false;

  if(path==="/api/admin"||path==="/api/admin-login"){
    sensitive=true;
    if(request.method==="POST" && (path==="/api/admin-login" || path==="/api/admin")){
      limit=5;
      windowSeconds=15*60;
    }else{
      limit=60;
      windowSeconds=60;
    }
  }else if(path==="/api/order"){
    sensitive=true;
    limit=10;
    windowSeconds=60;
  }else if(path==="/api/payment"){
    sensitive=true;
    limit=20;
    windowSeconds=60;
  }else if(path.startsWith("/api/admin-")){
    sensitive=true;
    limit=60;
    windowSeconds=60;
  }

  const result=await rateLimit(request,context.env,path,limit,windowSeconds);
  if(!result.allowed){
    if(result.failClosed && sensitive)return json({error:"Rate limiting service unavailable"},503,{headers:{"retry-after":String(result.retryAfter)}});
    if(!result.failClosed)return json({error:"Too many requests. Please try again later."},429,{headers:{"retry-after":String(result.retryAfter),"cache-control":"no-store"}});
  }
  return context.next();
}

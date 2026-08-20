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
  let bucket=path;

  if(path==="/api/admin"||path==="/api/admin-login"){
    sensitive=true;
    let action="";
    if(request.method==="POST"){
      try{action=String((await request.clone().json())?.action||"").toLowerCase()}catch{}
    }
    if(path==="/api/admin-login" || action==="login"){
      limit=5;
      windowSeconds=15*60;
      bucket=`${path}:login`;
    }else{
      limit=60;
      windowSeconds=60;
      bucket=`${path}:${action||"request"}`;
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

  const result=await rateLimit(request,context.env,bucket,limit,windowSeconds);
  if(!result.allowed){
    // rateLimit() fails open when the limiter backend is unavailable, so a
    // 429 here always means the client actually exceeded its limit.
    return json({error:"Too many requests. Please try again later."},429,{headers:{"retry-after":String(result.retryAfter),"cache-control":"no-store"}});
  }
  return context.next();
}

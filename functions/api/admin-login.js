import {json,readBody,signAdmin} from "./_utils.js";

export async function onRequestPost({request,env}){
  try{
    const body=await readBody(request);
    const password=typeof body?.password==="string"?body.password:"";
    if(!env.ADMIN_PASSWORD||!env.JWT_SECRET){
      return json({ok:false,error:"Admin secrets are not configured"},500);
    }
    if(!password || password!==env.ADMIN_PASSWORD){
      return json({ok:false,error:"Invalid password"},401);
    }
    const token=await signAdmin(env);
    const cookie=`nexora_admin=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`;
    return json({ok:true,token},200,{headers:{"Set-Cookie":cookie}});
  }catch(e){
    return json({ok:false,error:String(e?.message||e)},500);
  }
}

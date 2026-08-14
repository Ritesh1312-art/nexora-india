import {json,readBody,supabase,validAdmin} from "./_utils.js";
export async function onRequestGet({env}){const r=await supabase(env,"admin_settings?id=eq.true&select=*");return json((await r.json())[0]||{})}
export async function onRequestPost({request,env}){if(!(await validAdmin(request,env)))return json({error:"Admin login required"},401);const b=await readBody(request);const r=await supabase(env,"admin_settings?id=eq.true",{method:"PATCH",body:JSON.stringify(b)});return json(await r.json())}

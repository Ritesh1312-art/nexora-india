import {json,supabase,getSupabaseKey} from "./_utils.js";

export async function onRequestGet({env}){
 try{
  if(!env.SUPABASE_URL||!getSupabaseKey(env)) return json({error:"Server database configuration is incomplete"},500);
  const r=await supabase(env,"admin_settings?select=store_name,telegram_username&limit=1");
  const d=await r.json().catch(()=>null);
  if(!r.ok) return json({error:"Unable to load store support settings",details:d},502);
  return json({store_name:d?.[0]?.store_name||"Nexora-India",telegram_username:d?.[0]?.telegram_username||""});
 }catch(e){
  return json({error:"Unable to load store support settings",details:String(e?.message||e)},500);
 }
}

import {json} from "./_utils.js";
export async function onRequestGet({env}){return json({url:env.SUPABASE_URL,key:env.SUPABASE_ANON_KEY})}

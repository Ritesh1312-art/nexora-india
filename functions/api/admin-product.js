import {json,readBody,supabase,validAdmin} from './_utils.js';

const clean=v=>String(v??'').trim();
const slugify=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/[_\s]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,120);
function num(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}

async function saveProduct(env,b){
 const id=clean(b.id),name=clean(b.name),slug=slugify(b.slug||name);
 if(!name||!slug)return json({error:'Product name and slug are required'},400);
 const selling=num(b.selling_price),mrp=num(b.mrp),cost=num(b.cost_price),stock=Math.max(0,Math.floor(num(b.stock))),minOrder=Math.max(1,Math.floor(num(b.min_order_qty,1)));
 if(selling<0||mrp<0||cost<0)return json({error:'Prices cannot be negative'},400);
 if(mrp>0&&selling>mrp)return json({error:'Selling price cannot exceed MRP'},400);
 const requestedLive=!!b.live;
 if(requestedLive&&stock<1)return json({error:'A product cannot be published live with zero stock. Add available stock or save it as draft.'},400);
 const payload={name,slug,sku:clean(b.sku)||null,description:clean(b.description)||null,image_url:clean(b.image_url)||null,gallery:Array.isArray(b.gallery)?b.gallery.filter(Boolean).slice(0,12):[],category_id:clean(b.category_id)||null,mrp,selling_price:selling,cost_price:cost,stock,min_order_qty:minOrder,delivery_charge:Math.max(0,num(b.delivery_charge)),electrical_mrp:b.electrical_mrp===null||b.electrical_mrp===''?null:Math.max(0,num(b.electrical_mrp)),electrical_delivery_charge:b.electrical_delivery_charge===null||b.electrical_delivery_charge===''?null:Math.max(0,num(b.electrical_delivery_charge)),source:'MANUAL',active:requestedLive,approved_by_admin:requestedLive,approved_at:requestedLive?new Date().toISOString():null,updated_at:new Date().toISOString()};
 const path=id?`products?id=eq.${encodeURIComponent(id)}`:'products';
 const r=await supabase(env,path,{method:id?'PATCH':'POST',body:JSON.stringify(payload)});const d=await r.json().catch(()=>null);
 if(!r.ok)return json({error:'Product save failed',details:d},400);
 return json({ok:true,product:Array.isArray(d)?d[0]||null:d});
}

async function generateDescription(env,b){
 if(!env.GEMINI_API_KEY)return json({error:'GEMINI_API_KEY is not configured in Cloudflare Pages Functions.'},503);
 const name=clean(b.name),category=clean(b.category),sku=clean(b.sku),imageUrl=clean(b.image_url);
 if(!name)return json({error:'Product name is required for Gemini generation.'},400);
 const prompt=`You are an expert Indian e-commerce product copywriter. Create a highly useful, factual product description for a store product.\nProduct name: ${name}\nCategory: ${category||'Not specified'}\nSKU: ${sku||'Not specified'}\nImage URL: ${imageUrl||'Not provided'}\n\nRules: Do not invent specifications, certifications, dimensions, materials, warranty, health claims, compatibility, or performance facts that are not supported by the supplied information. If information is uncertain, omit it. Write in clear customer-friendly English. Return only the final description, with a short opening paragraph followed by concise bullet points for key known features/benefits and a short 'Important' note when information is missing or should be confirmed. Avoid markdown tables and avoid mentioning that you are an AI.`;
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:1200}})});
 const d=await r.json().catch(()=>null);if(!r.ok)return json({error:'Gemini generation failed',details:d},502);
 const text=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();if(!text)return json({error:'Gemini returned no description'},502);return json({ok:true,description:text,model:'gemini-2.5-flash'});
}

export async function onRequestPost({request,env}){try{if(!(await validAdmin(request,env)))return json({error:'Admin login required'},401);const b=await readBody(request);if(b.action==='generate_description')return generateDescription(env,b);if(b.action==='save_product')return saveProduct(env,b);return json({error:'Unknown admin-product action'},400)}catch(e){return json({error:'Admin product operation failed',details:String(e?.message||e)},500)}}

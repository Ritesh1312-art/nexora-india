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
 let sourceFields={source:'MANUAL',supplier_id:null,source_product_id:null,source_sku:null};
 let existingDescription='';
 if(id){const old=await supabase(env,`products?id=eq.${encodeURIComponent(id)}&select=source,supplier_id,source_product_id,source_sku,description`);const rows=await old.json().catch(()=>null);if(!old.ok||!Array.isArray(rows)||!rows[0])return json({error:'Product not found'},404);sourceFields={source:rows[0].source||'MANUAL',supplier_id:rows[0].supplier_id||null,source_product_id:rows[0].source_product_id||null,source_sku:rows[0].source_sku||null};existingDescription=clean(rows[0].description);}
 const suppliedDescription=clean(b.description);
 const description=suppliedDescription||existingDescription||null;
 const payload={name,slug,sku:clean(b.sku)||null,description,image_url:clean(b.image_url)||null,gallery:Array.isArray(b.gallery)?b.gallery.filter(Boolean).slice(0,12):[],category_id:clean(b.category_id)||null,mrp,selling_price:selling,cost_price:cost,stock,min_order_qty:minOrder,delivery_charge:Math.max(0,num(b.delivery_charge)),electrical_mrp:b.electrical_mrp===null||b.electrical_mrp===''?null:Math.max(0,num(b.electrical_mrp)),electrical_delivery_charge:b.electrical_delivery_charge===null||b.electrical_delivery_charge===''?null:Math.max(0,num(b.electrical_delivery_charge)),...sourceFields,active:requestedLive,approved_by_admin:requestedLive,approved_at:requestedLive?new Date().toISOString():null,updated_at:new Date().toISOString()};
 const path=id?`products?id=eq.${encodeURIComponent(id)}`:'products';
 const r=await supabase(env,path,{method:id?'PATCH':'POST',body:JSON.stringify(payload)});const d=await r.json().catch(()=>null);
 if(!r.ok)return json({error:'Product save failed',details:d},400);
 return json({ok:true,product:Array.isArray(d)?d[0]||null:d});
}

async function fetchImageForGemini(imageUrl){
 if(!imageUrl)return null;
 try{
  const u=new URL(imageUrl);if(!['http:','https:'].includes(u.protocol))return null;
  const r=await fetch(u.toString(),{redirect:'follow',headers:{accept:'image/*'}});
  if(!r.ok)return null;
  const type=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!type.startsWith('image/'))return null;
  const len=Number(r.headers.get('content-length')||0);if(len>5_000_000)return null;
  const buf=await r.arrayBuffer();if(buf.byteLength>5_000_000)return null;
  let binary='';const bytes=new Uint8Array(buf);for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return {mime_type:type,data:btoa(binary)};
 }catch{return null}
}

async function generateDescription(env,b){
 if(!env.GEMINI_API_KEY)return json({error:'GEMINI_API_KEY is not configured in Cloudflare Pages Functions.'},503);
 const name=clean(b.name),category=clean(b.category),sku=clean(b.sku),imageUrl=clean(b.image_url),existing=clean(b.existing_description),supplierDescription=clean(b.supplier_description);
 if(!name)return json({error:'Product name is required for Gemini generation.'},400);
 const image=await fetchImageForGemini(imageUrl);
 const prompt=`You are an expert Indian e-commerce product copywriter. Create a highly useful, factual product description for this store product.\nProduct name: ${name}\nCategory: ${category||'Not specified'}\nSKU: ${sku||'Not specified'}\nExisting supplier description: ${supplierDescription||'Not available'}\nExisting store description: ${existing||'Not available'}\n${image?'A product image is attached. Carefully inspect the visible product, packaging, labels, colours, shape and other clearly visible details.':'No product image could be analysed.'}\n\nRules: Use supplier information when supplied, and improve its clarity without changing facts. Use the image only for details that are genuinely visible. Do not invent specifications, certifications, dimensions, materials, warranty, health claims, compatibility, performance facts, quantities or technical details. If information is uncertain, omit it or say it should be confirmed. Write clear customer-friendly English for an Indian e-commerce store. Return only the final description: a short opening paragraph, concise bullet points for known features/benefits, and a short Important note only when necessary. No markdown table and do not mention AI.`;
 const parts=[{text:prompt}];if(image)parts.push({inline_data:image});
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0.2,maxOutputTokens:1400}})});
 const d=await r.json().catch(()=>null);if(!r.ok)return json({error:'Gemini generation failed',details:d},502);
 const text=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();if(!text)return json({error:'Gemini returned no description'},502);return json({ok:true,description:text,model:'gemini-2.5-flash',image_analyzed:!!image});
}

export async function onRequestPost({request,env}){try{if(!(await validAdmin(request,env)))return json({error:'Admin login required'},401);const b=await readBody(request);if(b.action==='generate_description')return generateDescription(env,b);if(b.action==='save_product')return saveProduct(env,b);return json({error:'Unknown admin-product action'},400)}catch(e){return json({error:'Admin product operation failed',details:String(e?.message||e)},500)}}

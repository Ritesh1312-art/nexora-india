const DEODAP_BASE = "https://deodap.in";
const DEFAULT_DAILY_COLLECTIONS=["kitchen-home-appliances","cleaning-housekeeping","household-supplies","office-supplies","stationery-school-supplies","health-care","home-utilities-safety"];
const JEWELLERY_COLLECTIONS=["jewellery","jewellery-accessories","womens-jewellery","mens-jewellery"];
// Chunked sync: one invocation processes a few collections (slice) so the
// Cloudflare Functions subrequest/CPU budget is never exceeded. Cursor is the
// next collection index (0-based) to process.
const DEFAULT_COLLECTIONS_PER_RUN=6;
function stripHtml(value){return String(value||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,5000)}
function moneyNumber(value){const n=Number(String(value??"").replace(/[^0-9.\-]/g,""));return Number.isFinite(n)?n:0}
function imageUrl(p){const raw=p.images?.[0]?.src||p.featured_image?.src||p.variants?.[0]?.featured_image?.src||null;if(!raw)return null;return String(raw).startsWith("//")?`https:${raw}`:String(raw)}
async function fetchCollection(handle){const u=`${DEODAP_BASE}/collections/${encodeURIComponent(handle)}/products.json?limit=250`;const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"Nexora-India/1.0"}});const d=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(d.products))throw new Error(`collection '${handle}' unavailable (${r.status})`);return d.products}
async function fetchCollectionSafe(handle){try{return await fetchCollection(handle)}catch{return []}}
function findCategory(categories,aliases){const wanted=aliases.map(x=>x.toLowerCase());return categories.find(c=>wanted.includes(String(c.name||"").trim().toLowerCase()))?.id||null}
function bySlug(categories,s){return categories.find(c=>String(c.slug||"").toLowerCase()===s)?.id||null}
function availabilityForProduct(p){const variants=Array.isArray(p.variants)?p.variants:[];const quantities=variants.map(v=>Number(v.inventory_quantity)).filter(Number.isFinite).filter(n=>n>=0);if(quantities.length)return{available:quantities.some(n=>n>0),stock:Math.max(0,...quantities),authoritative:true};const flags=variants.map(v=>v.available).filter(v=>typeof v==="boolean");if(flags.length)return{available:flags.some(Boolean),stock:0,authoritative:false};if(typeof p.available==="boolean")return{available:p.available,stock:0,authoritative:false};return{available:null,stock:null,authoritative:false}}
function payloadForProduct(p,categoryIdValue,isExisting,opts={}){const v=p.variants?.[0]||{},price=moneyNumber(v.price||p.price||0),suggested=Number((price*1.5).toFixed(2)),availability=availabilityForProduct(p);const row={name:p.title||"DeoDap Product",slug:p.handle||null,description:stripHtml(p.body_html),source:"DEODAP",source_product_id:String(p.id),source_sku:v.sku||null,category_id:categoryIdValue,image_url:imageUrl(p),cost_price:price,suggested_price:suggested,selling_price:suggested,...(availability.stock!=null?{stock:availability.stock}:{}),stock_mode:"AUTO",last_stock_sync_at:new Date().toISOString()};if(!isExisting){// New supplier products stay unpublished for admin review unless the admin
 // has enabled auto_publish_products in Store settings.
 if(opts.publish===true){row.active=true;row.approved_by_admin=true;row.approved_at=new Date().toISOString()}else{row.active=false;row.approved_by_admin=false}
 // Optional per-supplier default delivery charge (DEODAP_DELIVERY_CHARGE env).
 // Only applied to newly imported rows so admin edits are never overwritten.
 const dc=Number(opts.deliveryCharge||0);if(dc>0)row.delivery_charge=dc}else{// Existing products: refresh cost/stock/image but NEVER overwrite the admin's
 // edited selling/suggested prices on re-sync.
 delete row.suggested_price;delete row.selling_price}return row}
async function upsertBatch(env,supabase,rows){if(!rows.length)return;const r=await supabase(env,"products?on_conflict=source,source_product_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});if(!r.ok)throw new Error(`Supabase DeoDap batch upsert failed (${r.status}): ${await r.text()}`)}
async function getExistingProductIds(env,supabase){const r=await supabase(env,"products?select=source_product_id&source=eq.DEODAP");const d=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(d))throw new Error(`Could not load existing DeoDap products before sync: ${JSON.stringify(d)}`);return new Set(d.map(x=>String(x.source_product_id||"")).filter(Boolean))}

export async function syncDeodap(env,supabase,opts={}){
 const perRun=Math.max(1,Math.min(20,Number(env.DEODAP_COLLECTIONS_PER_RUN)||DEFAULT_COLLECTIONS_PER_RUN));
 const maxPerCategory=Math.max(1,Math.min(100,Number(env.DEODAP_MAX_PER_CATEGORY)||40));
 const warnings=[];
 const catRes=await supabase(env,"categories?select=id,name,slug&active=eq.true");
 const categories=await catRes.json();
 if(!Array.isArray(categories))throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);
 const dailyId=bySlug(categories,"daily-use")||bySlug(categories,"daily-use-products")||findCategory(categories,["Daily Use Products","Daily Use","Daily Use Items","Daily Essentials"]),jewelleryId=findCategory(categories,["Artificial Jewellery","Artificial Jewelry","Jewellery","Jewelry"]);
 if(!dailyId||!jewelleryId)throw new Error(`DeoDap category mapping missing. Need Daily Use Products/Daily Use and Artificial Jewellery. Found: ${categories.map(c=>c.name).join(", ")}`);
 const existingIds=await getExistingProductIds(env,supabase);
 let autoPublish=false;
 try{const sr=await supabase(env,"admin_settings?select=auto_publish_products&limit=1");const sd=await sr.json().catch(()=>null);autoPublish=sr.ok&&Array.isArray(sd)&&sd[0]?sd[0].auto_publish_products===true:false}catch{}
 // Owner decision: DeoDap imports carry a ₹199 default delivery charge.
 // DEODAP_DELIVERY_CHARGE env overrides it; applies to newly imported rows only.
 const deodapDc=String(env.DEODAP_DELIVERY_CHARGE??"").trim();
 const importOpts={publish:autoPublish,deliveryCharge:deodapDc===""?199:(Number(deodapDc)||0)};
 const dailyHandles=String(env.DEODAP_DAILY_COLLECTIONS||DEFAULT_DAILY_COLLECTIONS.join(",")).split(",").map(x=>x.trim()).filter(Boolean),jewelleryHandles=String(env.DEODAP_JEWELLERY_COLLECTIONS||JEWELLERY_COLLECTIONS.join(",")).split(",").map(x=>x.trim()).filter(Boolean);
 const collections=[...jewelleryHandles.map(handle=>({handle,group:"jewellery"})),...dailyHandles.map(handle=>({handle,group:"daily"}))];
 const startIndex=Math.max(0,Math.floor(Number(opts.cursor)||0));
 const endIndex=Math.min(collections.length,startIndex+perRun);
 const rows={jewellery:[],daily:[]},seen=new Set(),jewelleryIds=new Set();
 for(let i=startIndex;i<endIndex;i++){
  const {handle,group}=collections[i];
  let products=[];
  try{products=await fetchCollection(handle)}catch(e){warnings.push(`collection '${handle}': ${String(e?.message||e)}`);continue}
  for(const p of products){
   if(rows[group].length>=maxPerCategory)break;
   const id=String(p.id||"");
   if(!id||seen.has(id)||(group==="daily"&&jewelleryIds.has(id)))continue;
   seen.add(id);
   if(group==="jewellery")jewelleryIds.add(id);
   rows[group].push(payloadForProduct(p,group==="jewellery"?jewelleryId:dailyId,existingIds.has(id),importOpts));
  }
 }
 const importedRows=[...rows.jewellery,...rows.daily];
 await upsertBatch(env,supabase,importedRows);
 const done=endIndex>=collections.length;
 const imported=rows.daily.length+rows.jewellery.length;
 if(!imported&&startIndex===0&&collections.length===0)throw new Error("No DeoDap collections are configured.");
 return{daily:rows.daily.length,jewellery:rows.jewellery.length,imported,auto_publish:autoPublish,done,cursor:done?null:endIndex,warnings,errors:warnings};
}

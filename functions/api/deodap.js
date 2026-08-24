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
function payloadForProduct(p,categoryIdValue,ex,opts={}){
 const v=p.variants?.[0]||{},price=moneyNumber(v.price||p.price||0),suggested=Number((price*1.5).toFixed(2)),availability=availabilityForProduct(p);
 // Deodap (Shopify) mostly runs UNTRACKED inventory: variants carry only an
 // `available` flag and no quantity. available:true then means "fulfilled on
 // demand" — map it to a default stock (env-tunable) instead of the old 0
 // which made every Deodap product show "Currently unavailable" and blocked
 // the zero-stock live rule.
 if(availability.available===true&&!availability.authoritative)availability.stock=Math.max(1,Number(opts.untrackedStock||25));
 const exSell=ex?ex.sell:undefined;
 // STOCK GATE (owner rule): only confirmed-in-stock products are imported.
 if(availability.available!==true){
  // New product with no confirmed stock → never imported.
  if(ex===undefined)return null;
  // Existing product now confirmed out-of-stock → zero it and auto-delist
  // into drafts. Site turant mirror hoti hai; stock wapas aane pe niche
  // wala relist rule use dobara live kar dega (agar approved hai).
  const oos={name:p.title||"DeoDap Product",source:"DEODAP",source_product_id:String(p.id),stock:0,stock_mode:"AUTO",last_stock_sync_at:new Date().toISOString()};
  if(ex.active)oos.active=false;
  return oos;
 }
 const row={name:p.title||"DeoDap Product",slug:p.handle||null,description:stripHtml(p.body_html),source:"DEODAP",source_product_id:String(p.id),source_sku:v.sku||null,category_id:categoryIdValue,image_url:imageUrl(p),cost_price:price,suggested_price:suggested,selling_price:suggested,...(availability.stock!=null?{stock:availability.stock}:{}),stock_mode:"AUTO",last_stock_sync_at:new Date().toISOString()};if(exSell===undefined){// New supplier products stay unpublished for admin review unless the admin
 // has enabled auto_publish_products in Store settings.
 if(opts.publish===true){row.active=true;row.approved_by_admin=true;row.approved_at=new Date().toISOString()}else{row.active=false;row.approved_by_admin=false}
 // Optional per-supplier default delivery charge (DEODAP_DELIVERY_CHARGE env).
 // Only applied to newly imported rows so admin edits are never overwritten.
 const dc=Number(opts.deliveryCharge||0);if(dc>0)row.delivery_charge=dc}else if(Number(exSell)>0){// Existing products with a REAL price: refresh cost/stock/image
 // but NEVER overwrite the admin's edited selling/suggested prices on re-sync.
 delete row.suggested_price;delete row.selling_price}
 // exSell 0/missing = old ₹0-sync bug — row keeps selling/suggested so re-sync heals them.
 // Stock wapas aane par approved product ko apne aap relist karo.
 if(ex!==undefined&&!ex.active&&ex.approved)row.active=true;
 return row}
// PostgREST bulk-upsert requires every object in ONE POST to carry the SAME
// keys (PGRST102 "All object keys must match"). Price-preserve rows (exSell>0)
// drop the selling/suggested keys while heal/new rows keep them — so rows are
// grouped by their exact key-set and each group is POSTed separately.
async function upsertBatch(env,supabase,rows){
 if(!rows.length)return;
 const groups=new Map();
 for(const row of rows){
  const sig=Object.keys(row).sort().join(" ");
  const g=groups.get(sig);if(g)g.push(row);else groups.set(sig,[row]);
 }
 for(const group of groups.values()){
  const r=await supabase(env,"products?on_conflict=source,source_product_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(group)});
  if(!r.ok){const text=await r.text();throw new Error(`Supabase DeoDap batch upsert failed (${r.status}): ${text}`);}
 }
}
async function getExistingProducts(env,supabase){const r=await supabase(env,"products?select=source_product_id,selling_price,active,approved_by_admin&source=eq.DEODAP");const d=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(d))throw new Error(`Could not load existing DeoDap products before sync: ${JSON.stringify(d)}`);const m=new Map();for(const x of d){const k=String(x.source_product_id||"");if(k&&!m.has(k))m.set(k,{sell:Number(x.selling_price||0)||0,active:x.active===true,approved:x.approved_by_admin===true})}return m}

export async function syncDeodap(env,supabase,opts={}){
 const perRun=Math.max(1,Math.min(20,Number(env.DEODAP_COLLECTIONS_PER_RUN)||DEFAULT_COLLECTIONS_PER_RUN));
 const maxPerCategory=Math.max(1,Math.min(100,Number(env.DEODAP_MAX_PER_CATEGORY)||40));
 const warnings=[];
 const catRes=await supabase(env,"categories?select=id,name,slug&active=eq.true");
 const categories=await catRes.json();
 if(!Array.isArray(categories))throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);
 const dailyId=bySlug(categories,"daily-use")||bySlug(categories,"daily-use-products")||findCategory(categories,["Daily Use Products","Daily Use","Daily Use Items","Daily Essentials"]),jewelleryId=findCategory(categories,["Artificial Jewellery","Artificial Jewelry","Jewellery","Jewelry"]);
 if(!dailyId||!jewelleryId)throw new Error(`DeoDap category mapping missing. Need Daily Use Products/Daily Use and Artificial Jewellery. Found: ${categories.map(c=>c.name).join(", ")}`);
 const existingPrices=await getExistingProducts(env,supabase);
 let autoPublish=false;
 try{const sr=await supabase(env,"admin_settings?select=auto_publish_products&limit=1");const sd=await sr.json().catch(()=>null);autoPublish=sr.ok&&Array.isArray(sd)&&sd[0]?sd[0].auto_publish_products===true:false}catch{}
 // Owner decision: DeoDap imports carry a ₹199 default delivery charge.
 // DEODAP_DELIVERY_CHARGE env overrides it; applies to newly imported rows only.
 const deodapDc=String(env.DEODAP_DELIVERY_CHARGE??"").trim();
 const importOpts={publish:autoPublish,deliveryCharge:deodapDc===""?199:(Number(deodapDc)||0),untrackedStock:Math.max(1,Number(env.DEODAP_DEFAULT_STOCK||25)||25)};
 const dailyHandles=String(env.DEODAP_DAILY_COLLECTIONS||DEFAULT_DAILY_COLLECTIONS.join(",")).split(",").map(x=>x.trim()).filter(Boolean),jewelleryHandles=String(env.DEODAP_JEWELLERY_COLLECTIONS||JEWELLERY_COLLECTIONS.join(",")).split(",").map(x=>x.trim()).filter(Boolean);
 const collections=[...jewelleryHandles.map(handle=>({handle,group:"jewellery"})),...dailyHandles.map(handle=>({handle,group:"daily"}))];
 const startIndex=Math.max(0,Math.floor(Number(opts.cursor)||0));
 const endIndex=Math.min(collections.length,startIndex+perRun);
 const rows={jewellery:[],daily:[]},seen=new Set(),jewelleryIds=new Set();
 let skippedNoStock=0;
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
   const built=payloadForProduct(p,group==="jewellery"?jewelleryId:dailyId,existingPrices.get(id),importOpts);
   if(built)rows[group].push(built);else skippedNoStock++;
  }
 }
 const importedRows=[...rows.jewellery,...rows.daily];
 await upsertBatch(env,supabase,importedRows);
 const done=endIndex>=collections.length;
 const imported=rows.daily.length+rows.jewellery.length;
 if(!imported&&startIndex===0&&collections.length===0)throw new Error("No DeoDap collections are configured.");
 return{daily:rows.daily.length,jewellery:rows.jewellery.length,imported,skipped_no_stock:skippedNoStock,auto_publish:autoPublish,done,cursor:done?null:endIndex,warnings,errors:warnings};
}

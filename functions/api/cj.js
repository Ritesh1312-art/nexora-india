// CJ authentication: CJ_API_KEY is the source credential; access tokens are generated server-side.
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
// Chunked sync moves the whole catalogue through one keyword "slice" per
// invocation so a single Cloudflare Pages Function subrequest count stays far
// below the platform limit (~50). Cursor = keywordIndex*100000 + offset.
const CURSOR_STEP = 100000;

// USD→INR conversion at sync time. Priority: CJ_USD_INR_RATE env override →
// live market rate (free FX API, no key) → 90 fallback. An LLM (Gemini etc.)
// is deliberately NOT used — it cannot quote a reliable current rate.
async function usdInrRate(env){const override=Number(env.CJ_USD_INR_RATE||0);if(override>0)return override;try{const r=await fetch("https://open.er-api.com/v6/latest/USD",{headers:{Accept:"application/json"}});const d=await r.json().catch(()=>null);const v=Number(d?.rates?.INR);if(r.ok&&v>0)return v}catch{}return 90}

async function requestTokenFromApiKey(apiKey){const r=await fetch(`${CJ_BASE}/authentication/getAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey})});const d=await r.json().catch(()=>({}));if(r.ok&&d.code===200&&d.data?.accessToken)return {accessToken:d.data.accessToken,refreshToken:d.data.refreshToken||null};const code=d.code!=null?`code ${d.code}`:`HTTP ${r.status}`;const e=new Error(`CJ API-key authentication failed (${code}): ${String(d.message||JSON.stringify(d))}`);e.cjCode=d.code;e.requestId=d.requestId;throw e;}
async function logoutToken(token){if(!token)return;try{await fetch(`${CJ_BASE}/authentication/logout`,{method:"POST",headers:{"CJ-Access-Token":token}});}catch{}}
async function refreshToken(refreshToken){const r=await fetch(`${CJ_BASE}/authentication/refreshAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken})});const d=await r.json().catch(()=>({}));if(r.ok&&d.code===200&&d.data?.accessToken)return d.data.accessToken;return null;}
async function getAccessToken(env,forceNew=false){const configuredKey=String(env.CJ_API_KEY||"").trim(),configuredAccess=String(env.CJ_ACCESS_TOKEN||"").trim(),configuredRefresh=String(env.CJ_REFRESH_TOKEN||"").trim();if(configuredKey){try{return (await requestTokenFromApiKey(configuredKey)).accessToken}catch(e){if(!configuredRefresh&&!configuredAccess)throw e;}}if(!forceNew&&configuredRefresh){const token=await refreshToken(configuredRefresh);if(token)return token;}if(configuredAccess)return configuredAccess;if(configuredKey)throw new Error("CJ API-key authentication failed. The configured CJ_API_KEY was rejected by CJ.");throw new Error("CJ credentials are missing. Configure CJ_API_KEY or CJ_ACCESS_TOKEN.");}
function categoryId(categories,aliases){const wanted=aliases.map(x=>x.toLowerCase());return categories.find(c=>wanted.includes(String(c.name||"").trim().toLowerCase()))?.id||null;}
function textOf(p){return [p.nameEn,p.threeCategoryName,p.twoCategoryName,p.oneCategoryName].filter(Boolean).join(" ").toLowerCase();}
const GROUPS={footwear:{aliases:["Footwear","Shoes","Footwear Products"],keywords:["shoes","sneakers","sandals","slippers","boots","loafers","heels","flats","running shoes","footwear"]},kitchen:{aliases:["Kitchen Appliances","Kitchen appliance","Kitchen & Home Appliances"],keywords:["kitchen appliance","blender","mixer grinder","mixer","juicer","chopper","air fryer","electric kettle","kettle","toaster","sandwich maker","rice cooker","coffee maker","food processor","induction","electric cooker"]}};
async function searchProducts(token,keyword,page=1,size=100){const u=new URL(`${CJ_BASE}/product/listV2`);u.searchParams.set("page",String(page));u.searchParams.set("size",String(size));u.searchParams.set("keyWord",keyword);u.searchParams.set("features","enable_category");const r=await fetch(u,{headers:{"CJ-Access-Token":token}});const d=await r.json().catch(()=>({}));if(!r.ok||d.code!==200){const code=d.code!=null?`code ${d.code}`:`HTTP ${r.status}`;const e=new Error(`CJ product query failed for ${keyword} (${code}): ${String(d.message||JSON.stringify(d))}`);e.cjCode=d.code;e.requestId=d.requestId;throw e;}return (d.data?.content||[]).flatMap(x=>x.productList||[]);}
async function inventoryByProductId(token,pid){const u=new URL(`${CJ_BASE}/product/stock/getInventoryByPid`);u.searchParams.set("pid",String(pid));const r=await fetch(u,{headers:{"CJ-Access-Token":token}});const d=await r.json().catch(()=>({}));if(!r.ok||d.code!==200)return null;const inventories=Array.isArray(d.data?.inventories)?d.data.inventories:[];const totals=inventories.map(x=>Number(x.totalInventoryNum)).filter(Number.isFinite).filter(n=>n>=0);if(totals.length)return Math.max(0,...totals);const variants=Array.isArray(d.data?.variantInventories)?d.data.variantInventories:[];const variantTotals=variants.flatMap(v=>Array.isArray(v.inventory)?v.inventory:[]).map(x=>Number(x.totalInventory)).filter(Number.isFinite).filter(n=>n>=0);return variantTotals.length?Math.max(0,...variantTotals):null;}
async function upsertBatch(env,supabase,rows){if(!rows.length)return;const r=await supabase(env,"products?on_conflict=source,source_product_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});if(!r.ok){const text=await r.text();throw new Error(`Supabase CJ batch upsert failed (${r.status}): ${text}`);}}
async function getExistingProductIds(env,supabase){const r=await supabase(env,"products?select=source_product_id&source=eq.CJ");const d=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(d))throw new Error(`Could not load existing CJ products before sync: ${JSON.stringify(d)}`);return new Set(d.map(x=>String(x.source_product_id||"")).filter(Boolean));}
function parseCursor(raw){const n=Number(raw||0);if(!Number.isFinite(n)||n<0)return {keywordIndex:0,offset:0};return {keywordIndex:Math.floor(n/CURSOR_STEP),offset:n%CURSOR_STEP};}

export async function syncCJ(env,supabase,opts={}){
 // Per-run budgets are env-tunable so the operator can raise/lower the slice
 // size without a deploy. Defaults keep subrequests well under the CF limit.
 const kwPerRun=Math.max(1,Math.min(26,Number(env.CJ_SYNC_KEYWORDS_PER_RUN)||6));
 const invPerRun=Math.max(0,Math.min(20,Number(env.CJ_SYNC_INVENTORY_PER_RUN)||5));
 const maxPerCategory=Math.max(1,Math.min(100,Number(env.CJ_SYNC_MAX_PER_CATEGORY)||40));
 const pageSize=Math.max(10,Math.min(100,Number(env.CJ_SYNC_PAGE_SIZE)||100));
 const queries=[...GROUPS.footwear.keywords.map(keyword=>["footwear",keyword]),...GROUPS.kitchen.keywords.map(keyword=>["kitchen",keyword])];
 const start=parseCursor(opts.cursor);
 const endIndex=Math.min(queries.length,start.keywordIndex+kwPerRun);
 const warnings=[];
 let token=await getAccessToken(env);
 const catRes=await supabase(env,"categories?select=id,name,slug&active=eq.true");
 const categories=await catRes.json();
 if(!Array.isArray(categories))throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);
 const footwearCategory=categoryId(categories,GROUPS.footwear.aliases),kitchenCategory=categoryId(categories,GROUPS.kitchen.aliases);
 if(!footwearCategory||!kitchenCategory)throw new Error(`CJ category mapping missing. Need Footwear and Kitchen Appliances. Found: ${categories.map(c=>c.name).join(", ")}`);
 const existingIds=await getExistingProductIds(env,supabase);
 let autoPublish=false;
 try{const sr=await supabase(env,"admin_settings?select=auto_publish_products&limit=1");const sd=await sr.json().catch(()=>null);autoPublish=sr.ok&&Array.isArray(sd)&&sd[0]?sd[0].auto_publish_products===true:false}catch{}
 const supplierDeliveryCharge=Number(env.CJ_DELIVERY_CHARGE||0)||0;
 const inrRate=await usdInrRate(env);
 const seen=new Set(),rows={footwear:[],kitchen:[]};
 let inventoryBudget=invPerRun;
 let keywordIndex=start.keywordIndex,offset=start.offset,cursor=null;
 for(;keywordIndex<endIndex;keywordIndex++){
  const [group,keyword]=queries[keywordIndex];
  if(rows[group].length>=maxPerCategory){offset=0;continue;}
  let products=null;
  try{
   products=await searchProducts(token,keyword,Math.floor(offset/pageSize)+1,pageSize);
  }catch(e){
   // Token expiry (CJ 1600001): one key refresh + retry; any other keyword
   // failure is tolerated so one bad keyword never kills the whole sync.
   if(Number(e?.cjCode)===1600001){
    const key=String(env.CJ_API_KEY||"").trim();
    if(key){
     try{await logoutToken(token);token=(await requestTokenFromApiKey(key)).accessToken;products=await searchProducts(token,keyword,Math.floor(offset/pageSize)+1,pageSize);}
     catch(e2){warnings.push(`${keyword}: ${String(e2?.message||e2)}`);offset=0;continue;}
    }else{warnings.push(`${keyword}: CJ token expired and no CJ_API_KEY configured`);offset=0;continue;}
   }
   warnings.push(`${keyword}: ${String(e?.message||e)}`);offset=0;continue;
  }
  for(const p of products){
   if(rows[group].length>=maxPerCategory)break;
   const id=p.id||p.productId;
   if(!id||seen.has(String(id)))continue;
   const text=textOf(p);
   const isMatch=group==="footwear"?/(shoe|footwear|sneaker|sandal|slipper|boot|loafer|heel|flat|running shoes)/i.test(text):/(kitchen|appliance|blender|mixer|juicer|chopper|air fryer|kettle|toaster|sandwich maker|rice cooker|coffee maker|food processor|induction|electric cooker)/i.test(text);
   if(!isMatch)continue;
   seen.add(String(id));
   const costUsd=Number(p.nowPrice||p.discountPrice||p.sellPrice||0)||0,cost=Number((costUsd*inrRate).toFixed(2)),listStock=Math.max(0,Number(p.warehouseInventoryNum||p.totalVerifiedInventory||0)||0),categoryIdValue=group==="footwear"?footwearCategory:kitchenCategory;
   const payload={name:p.nameEn||"CJ Product",source:"CJ",source_product_id:String(id),source_sku:p.sku||p.spu||null,category_id:categoryIdValue,image_url:p.bigImage||p.productImage||p.imageUrl||null,cost_price:cost,suggested_price:Number((cost*1.5).toFixed(2)),selling_price:Number((cost*1.5).toFixed(2)),stock:listStock,stock_mode:"AUTO",last_stock_sync_at:new Date().toISOString()};
   if(!existingIds.has(String(id))){
    // New supplier products stay unpublished for admin review unless
    // auto_publish_products is enabled in Store settings.
    if(autoPublish){payload.active=true;payload.approved_by_admin=true;payload.approved_at=new Date().toISOString()}else{payload.active=false;payload.approved_by_admin=false;}
    // Optional per-supplier default delivery charge (CJ_DELIVERY_CHARGE env);
    // applied only to new rows so admin edits are never overwritten.
    if(supplierDeliveryCharge>0)payload.delivery_charge=supplierDeliveryCharge;
   }else{
    // Existing products: refresh cost/stock/image but NEVER overwrite the
    // admin's edited selling/suggested prices on re-sync.
    delete payload.suggested_price;delete payload.selling_price;
   }
   const item={payload,pid:String(id)};
   if(inventoryBudget>0){inventoryBudget--;const stock=await inventoryByProductId(token,item.pid);if(stock!==null)item.payload.stock=Math.max(0,stock);}
   rows[group].push(item);
  }
  if(products.length===pageSize&&rows[group].length<maxPerCategory){
   // Keyword page may have more results — resume on the next page next run.
   cursor=keywordIndex*100000+offset+products.length;
   break;
  }
  offset=0;
 }
 const all=[...rows.footwear,...rows.kitchen].map(x=>x.payload);
 await upsertBatch(env,supabase,all);
 const done=!cursor&&keywordIndex>=queries.length;
 if(!done&&!cursor)cursor=keywordIndex*100000+0;
 return {footwear:rows.footwear.length,kitchen:rows.kitchen.length,imported:all.length,auto_publish:autoPublish,done,cursor,warnings,errors:warnings};
}

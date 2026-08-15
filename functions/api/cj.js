// CJ authentication: CJ_API_KEY is the source credential; access tokens are generated server-side.
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function requestTokenFromApiKey(apiKey){
  const r=await fetch(`${CJ_BASE}/authentication/getAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey})});
  const d=await r.json().catch(()=>({}));
  if(r.ok&&d.code===200&&d.data?.accessToken)return {accessToken:d.data.accessToken,refreshToken:d.data.refreshToken||null};
  const code=d.code!=null?`code ${d.code}`:`HTTP ${r.status}`;
  const e=new Error(`CJ API-key authentication failed (${code}): ${String(d.message||JSON.stringify(d))}`);e.cjCode=d.code;e.requestId=d.requestId;throw e;
}

async function logoutToken(token){
  if(!token)return;
  try{await fetch(`${CJ_BASE}/authentication/logout`,{method:"POST",headers:{"CJ-Access-Token":token}});}catch{}
}

async function refreshToken(refreshToken){
  const r=await fetch(`${CJ_BASE}/authentication/refreshAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken})});
  const d=await r.json().catch(()=>({}));
  if(r.ok&&d.code===200&&d.data?.accessToken)return d.data.accessToken;
  return null;
}

async function getAccessToken(env,forceNew=false){
  const configuredKey=String(env.CJ_API_KEY||"").trim();
  const configuredAccess=String(env.CJ_ACCESS_TOKEN||"").trim();
  const configuredRefresh=String(env.CJ_REFRESH_TOKEN||"").trim();

  // The API Key is the source of truth. Always try it first when present so an
  // old/expired refresh token cannot silently override a newly configured key.
  if(configuredKey){
    try{return (await requestTokenFromApiKey(configuredKey)).accessToken;}catch(e){
      if(!configuredRefresh&&!configuredAccess)throw e;
    }
  }

  if(!forceNew&&configuredRefresh){
    const token=await refreshToken(configuredRefresh);
    if(token)return token;
  }

  if(configuredAccess)return configuredAccess;
  if(configuredKey)throw new Error("CJ API-key authentication failed. The configured CJ_API_KEY was sent directly to CJ and CJ rejected it. Make sure Cloudflare Production has the full API Key copied with the CJ API page Copy icon and that the API entry is Activated.");
  throw new Error("CJ credentials are missing. Configure CJ_API_KEY with the active CJ API Key, or CJ_ACCESS_TOKEN as a fallback.");
}

function categoryId(categories,aliases){const wanted=aliases.map(x=>x.toLowerCase());return categories.find(c=>wanted.includes(String(c.name||"").trim().toLowerCase()))?.id||null;}
function textOf(p){return [p.nameEn,p.threeCategoryName,p.twoCategoryName,p.oneCategoryName].filter(Boolean).join(" ").toLowerCase();}
const GROUPS={
 footwear:{aliases:["Footwear","Shoes","Footwear Products"],keywords:["shoes","sneakers","sandals","slippers","boots","loafers","heels","flats","running shoes","footwear"]},
 kitchen:{aliases:["Kitchen Appliances","Kitchen appliance","Kitchen & Home Appliances"],keywords:["kitchen appliance","blender","mixer grinder","mixer","juicer","chopper","air fryer","electric kettle","kettle","toaster","sandwich maker","rice cooker","coffee maker","food processor","induction","electric cooker"]}
};

async function searchProducts(token,keyword){
 const u=new URL(`${CJ_BASE}/product/listV2`);u.searchParams.set("page","1");u.searchParams.set("size","100");u.searchParams.set("keyWord",keyword);u.searchParams.set("features","enable_category");
 const r=await fetch(u,{headers:{"CJ-Access-Token":token}});const d=await r.json().catch(()=>({}));
 if(!r.ok||d.code!==200){const code=d.code!=null?`code ${d.code}`:`HTTP ${r.status}`;const requestId=d.requestId?`, requestId ${d.requestId}`:"";const e=new Error(`CJ product query failed for ${keyword} (${code}${requestId}): ${String(d.message||JSON.stringify(d))}`);e.cjCode=d.code;e.requestId=d.requestId;throw e;}
 return (d.data?.content||[]).flatMap(x=>x.productList||[]);
}

async function upsertBatch(env,supabase,rows){
 if(!rows.length)return;const r=await supabase(env,"products?on_conflict=source,source_product_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
 if(!r.ok){const text=await r.text();throw new Error(`Supabase CJ batch upsert failed (${r.status}). Ensure products has a unique constraint on (source, source_product_id). ${text}`);}
}

export async function syncCJ(env,supabase){
 let token=await getAccessToken(env);
 const catRes=await supabase(env,"categories?select=id,name&active=eq.true");const categories=await catRes.json();
 if(!Array.isArray(categories))throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);
 const footwearCategory=categoryId(categories,GROUPS.footwear.aliases),kitchenCategory=categoryId(categories,GROUPS.kitchen.aliases);
 if(!footwearCategory||!kitchenCategory)throw new Error(`CJ category mapping missing. Need store categories: Footwear and Kitchen Appliances. Found: ${categories.map(c=>c.name).join(", ")}`);

 const runQueries=async(currentToken)=>{
  const seen=new Set(),rows={footwear:[],kitchen:[]},queries=[...GROUPS.footwear.keywords.map(keyword=>["footwear",keyword]),...GROUPS.kitchen.keywords.map(keyword=>["kitchen",keyword])];
  const MAX_PRODUCTS_TOTAL=40;
  for(const [group,keyword] of queries){
   if(rows.footwear.length+rows.kitchen.length>=MAX_PRODUCTS_TOTAL)break;
   const products=await searchProducts(currentToken,keyword);
   for(const p of products){
    if(rows.footwear.length+rows.kitchen.length>=MAX_PRODUCTS_TOTAL)break;
    const id=p.id||p.productId;if(!id||seen.has(String(id)))continue;const text=textOf(p);
    const isMatch=group==="footwear"?/(shoe|footwear|sneaker|sandal|slipper|boot|loafer|heel|flat)/i.test(text):/(kitchen|appliance|blender|mixer|juicer|chopper|air fryer|kettle|toaster|sandwich maker|rice cooker|coffee maker|food processor|induction|electric cooker)/i.test(text);
    if(!isMatch)continue;seen.add(String(id));
    const costUsd=Number(p.nowPrice||p.discountPrice||p.sellPrice||0)||0,rate=Number(env.CJ_USD_INR_RATE||90)||90,cost=Number((costUsd*rate).toFixed(2));
    const stock=Math.max(0,Number(p.warehouseInventoryNum||p.totalVerifiedInventory||0)||0),categoryIdValue=group==="footwear"?footwearCategory:kitchenCategory;
    rows[group].push({name:p.nameEn||"CJ Product",source:"CJ",source_product_id:String(id),source_sku:p.sku||p.spu||null,category_id:categoryIdValue,image_url:p.bigImage||p.productImage||p.imageUrl||null,cost_price:cost,suggested_price:Number((cost*1.5).toFixed(2)),selling_price:Number((cost*1.5).toFixed(2)),stock,stock_mode:"AUTO",active:false,approved_by_admin:false,last_stock_sync_at:new Date().toISOString()});
   }
  }
  return rows;
 };

 let rows;
 try{rows=await runQueries(token);}catch(e){
  if(Number(e?.cjCode)!==1600001)throw e;
  // A product call rejected the token. Re-authenticate once using the full API key.
  const key=String(env.CJ_API_KEY||"").trim();
  if(!key)throw new Error("CJ returned 1600001 (invalid access token) and no CJ_API_KEY is configured.");
  await logoutToken(token);
  token=(await requestTokenFromApiKey(key)).accessToken;
  try{rows=await runQueries(token);}catch(e2){
   if(Number(e2?.cjCode)===1600001)throw new Error(`CJ still rejects the newly issued access token (1600001). CJ rejected the API credential itself. Request ID: ${e2.requestId||e.requestId||"n/a"}`);
   throw e2;
  }
 }
 await upsertBatch(env,supabase,[...rows.footwear,...rows.kitchen]);
 return {footwear:rows.footwear.length,kitchen:rows.kitchen.length,imported:rows.footwear.length+rows.kitchen.length};
}

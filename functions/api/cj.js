const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function getAccessToken(env) {
  const apiKey = String(env.CJ_API_KEY || "").trim();
  const fallbackToken = String(env.CJ_ACCESS_TOKEN || "").trim();

  if (apiKey) {
    const r = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.code === 200 && d.data?.accessToken) return d.data.accessToken;

    // If an older but still-valid access token is configured, do not let a bad/new
    // API-key variable prevent the integration from working.
    if (fallbackToken) return fallbackToken;

    const msg = String(d.message || "Invalid CJ API key");
    const code = d.code != null ? `code ${d.code}` : `HTTP ${r.status}`;
    const requestId = d.requestId ? `, requestId ${d.requestId}` : "";
    throw new Error(`CJ authentication failed (${code}${requestId}): ${msg}. CJ_API_KEY must be the full active API Key copied from CJ.`);
  }

  if (fallbackToken) return fallbackToken;
  throw new Error("CJ credentials are not configured. Set CJ_API_KEY to the full active API Key from CJ (preferred), or CJ_ACCESS_TOKEN as a legacy fallback.");
}

function categoryId(categories, aliases) {
  const wanted = aliases.map(x => x.toLowerCase());
  const exact = categories.find(c => wanted.includes(String(c.name || "").trim().toLowerCase()));
  return exact?.id || null;
}

function textOf(p) {
  return [p.nameEn, p.threeCategoryName, p.twoCategoryName, p.oneCategoryName].filter(Boolean).join(" ").toLowerCase();
}

const GROUPS = {
  footwear: {
    aliases: ["Footwear", "Shoes", "Footwear Products"],
    keywords: ["shoes", "sneakers", "sandals", "slippers", "boots", "loafers", "heels", "flats", "running shoes", "footwear"]
  },
  kitchen: {
    aliases: ["Kitchen Appliances", "Kitchen appliance", "Kitchen & Home Appliances"],
    keywords: ["kitchen appliance", "blender", "mixer grinder", "mixer", "juicer", "chopper", "air fryer", "electric kettle", "kettle", "toaster", "sandwich maker", "rice cooker", "coffee maker", "food processor", "induction", "electric cooker"]
  }
};

async function searchProducts(token, keyword) {
  const u = new URL(`${CJ_BASE}/product/listV2`);
  u.searchParams.set("page", "1");
  u.searchParams.set("size", "100");
  u.searchParams.set("keyWord", keyword);
  u.searchParams.set("features", "enable_category");
  const r = await fetch(u, {
    headers: { "CJ-Access-Token": token }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 200) {
    const code = d.code != null ? `code ${d.code}` : `HTTP ${r.status}`;
    const requestId = d.requestId ? `, requestId ${d.requestId}` : "";
    throw new Error(`CJ product query failed for ${keyword} (${code}${requestId}): ${String(d.message || JSON.stringify(d))}`);
  }
  return (d.data?.content || []).flatMap(x => x.productList || []);
}

async function upsertBatch(env, supabase, rows) {
  if (!rows.length) return;
  const r = await supabase(
    env,
    "products?on_conflict=source,source_product_id",
    {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    }
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase CJ batch upsert failed (${r.status}). Ensure products has a unique constraint on (source, source_product_id). ${text}`);
  }
}

export async function syncCJ(env, supabase) {
  const token = await getAccessToken(env);
  const catRes = await supabase(env, "categories?select=id,name&active=eq.true");
  const categories = await catRes.json();
  if (!Array.isArray(categories)) throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);

  const footwearCategory = categoryId(categories, GROUPS.footwear.aliases);
  const kitchenCategory = categoryId(categories, GROUPS.kitchen.aliases);
  if (!footwearCategory || !kitchenCategory) {
    throw new Error(`CJ category mapping missing. Need store categories: Footwear and Kitchen Appliances. Found: ${categories.map(c => c.name).join(", ")}`);
  }

  const seen = new Set();
  const rows = { footwear: [], kitchen: [] };
  const queries = [
    ...GROUPS.footwear.keywords.map(keyword => ["footwear", keyword]),
    ...GROUPS.kitchen.keywords.map(keyword => ["kitchen", keyword])
  ];

  // Keep the sync safely below the Cloudflare Workers Free external-subrequest limit.
  const MAX_PRODUCTS_TOTAL = 40;
  for (const [group, keyword] of queries) {
    if (rows.footwear.length + rows.kitchen.length >= MAX_PRODUCTS_TOTAL) break;
    const products = await searchProducts(token, keyword);
    for (const p of products) {
      if (rows.footwear.length + rows.kitchen.length >= MAX_PRODUCTS_TOTAL) break;
      const id = p.id || p.productId;
      if (!id || seen.has(String(id))) continue;
      const text = textOf(p);
      const isMatch = group === "footwear"
        ? /(shoe|footwear|sneaker|sandal|slipper|boot|loafer|heel|flat)/i.test(text)
        : /(kitchen|appliance|blender|mixer|juicer|chopper|air fryer|kettle|toaster|sandwich maker|rice cooker|coffee maker|food processor|induction|electric cooker)/i.test(text);
      if (!isMatch) continue;
      seen.add(String(id));

      const costUsd = Number(p.nowPrice || p.discountPrice || p.sellPrice || 0) || 0;
      const rate = Number(env.CJ_USD_INR_RATE || 90) || 90;
      const cost = Number((costUsd * rate).toFixed(2));
      const stock = Math.max(0, Number(p.warehouseInventoryNum || p.totalVerifiedInventory || 0) || 0);
      const categoryIdValue = group === "footwear" ? footwearCategory : kitchenCategory;
      rows[group].push({
        name: p.nameEn || "CJ Product",
        source: "CJ",
        source_product_id: String(id),
        source_sku: p.sku || p.spu || null,
        category_id: categoryIdValue,
        image_url: p.bigImage || p.productImage || p.imageUrl || null,
        cost_price: cost,
        suggested_price: Number((cost * 1.5).toFixed(2)),
        selling_price: Number((cost * 1.5).toFixed(2)),
        stock,
        stock_mode: "AUTO",
        active: false,
        approved_by_admin: false,
        last_stock_sync_at: new Date().toISOString()
      });
    }
  }

  await upsertBatch(env, supabase, [...rows.footwear, ...rows.kitchen]);
  return { footwear: rows.footwear.length, kitchen: rows.kitchen.length, imported: rows.footwear.length + rows.kitchen.length };
}

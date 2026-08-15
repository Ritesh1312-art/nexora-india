const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function getAccessToken(env) {
  const apiKey = String(env.CJ_API_KEY || "").trim();
  if (apiKey) {
    const r = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.code !== 200 || !d.data?.accessToken) {
      const msg = String(d.message || "Invalid CJ API key");
      const code = d.code != null ? `code ${d.code}` : `HTTP ${r.status}`;
      const requestId = d.requestId ? `, requestId ${d.requestId}` : "";
      throw new Error(`CJ authentication failed (${code}${requestId}): ${msg}. CJ_API_KEY must contain the full active API Key copied from CJ, not an access token.`);
    }
    return d.data.accessToken;
  }
  const accessToken = String(env.CJ_ACCESS_TOKEN || "").trim();
  if (accessToken) return accessToken;
  throw new Error("CJ_API_KEY is not configured");
}

function categoryId(categories, aliases) {
  const wanted = aliases.map(x => x.toLowerCase());
  const exact = categories.find(c => wanted.includes(String(c.name || "").trim().toLowerCase()));
  if (exact) return exact.id;
  return null;
}

function textOf(p) {
  return [p.nameEn, p.threeCategoryName, p.twoCategoryName, p.oneCategoryName].filter(Boolean).join(" ").toLowerCase();
}

const GROUPS = {
  footwear: {
    aliases: ["Footwear", "Shoes", "Footwear Products"],
    keywords: ["shoes", "footwear", "sneakers", "sandals", "slippers", "boots", "loafers", "heels", "flats", "running shoes"]
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
    headers: {
      "CJ-Access-Token": token,
      "Authorization": `Bearer ${token}`
    }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 200) {
    const code = d.code != null ? `code ${d.code}` : `HTTP ${r.status}`;
    const requestId = d.requestId ? `, requestId ${d.requestId}` : "";
    throw new Error(`CJ product query failed for ${keyword} (${code}${requestId}): ${String(d.message || JSON.stringify(d))}`);
  }
  return (d.data?.content || []).flatMap(x => x.productList || []);
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
  const imported = { footwear: 0, kitchen: 0 };
  const queries = [
    ...GROUPS.footwear.keywords.map(keyword => ["footwear", keyword]),
    ...GROUPS.kitchen.keywords.map(keyword => ["kitchen", keyword])
  ];

  for (const [group, keyword] of queries) {
    const products = await searchProducts(token, keyword);
    for (const p of products) {
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
      const payload = {
        name: p.nameEn || "CJ Product",
        source: "CJ",
        source_product_id: String(id),
        source_sku: p.sku || p.spu || null,
        category_id: categoryIdValue,
        image_url: p.bigImage || null,
        cost_price: cost,
        suggested_price: Number((cost * 1.5).toFixed(2)),
        selling_price: Number((cost * 1.5).toFixed(2)),
        stock,
        stock_mode: "AUTO",
        active: false,
        approved_by_admin: false,
        last_stock_sync_at: new Date().toISOString()
      };
      const q = await supabase(env, `products?source=eq.CJ&source_product_id=eq.${encodeURIComponent(String(id))}&select=id`);
      const existing = await q.json();
      if (existing?.[0]) {
        await supabase(env, `products?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await supabase(env, "products", { method: "POST", body: JSON.stringify(payload) });
      }
      imported[group]++;
    }
  }
  return { footwear: imported.footwear, kitchen: imported.kitchen, imported: imported.footwear + imported.kitchen };
}

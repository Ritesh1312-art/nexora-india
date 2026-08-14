const DEODAP_BASE = "https://deodap.in";

const DEFAULT_DAILY_COLLECTIONS = [
  "home-kitchen",
  "cleaning-supplies",
  "clean-home-essentials",
  "stationery",
  "office-products",
  "health-care-items",
  "household-appliances"
];
const JEWELLERY_COLLECTIONS = ["jewellery"];

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
}

function moneyNumber(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchCollection(handle) {
  const u = `${DEODAP_BASE}/collections/${encodeURIComponent(handle)}/products.json?limit=250`;
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(d.products)) throw new Error(`DeoDap collection fetch failed (${handle})`);
  return d.products;
}

async function findCategory(categories, aliases) {
  const wanted = aliases.map(x => x.toLowerCase());
  return categories.find(c => wanted.includes(String(c.name || "").trim().toLowerCase()))?.id || null;
}

function payloadForProduct(p, categoryIdValue) {
  const v = p.variants?.[0] || {};
  const price = moneyNumber(v.price || p.price || 0);
  const image = p.images?.[0]?.src || p.featured_image?.src || null;
  const stock = v.inventory_quantity != null ? Math.max(0, Number(v.inventory_quantity) || 0) : (v.available === false ? 0 : 0);
  return {
    name: p.title || "DeoDap Product",
    slug: p.handle || null,
    description: stripHtml(p.body_html),
    source: "DEODAP",
    source_product_id: String(p.id),
    source_sku: v.sku || null,
    category_id: categoryIdValue,
    image_url: image,
    cost_price: price,
    suggested_price: Number((price * 1.5).toFixed(2)),
    selling_price: Number((price * 1.5).toFixed(2)),
    stock,
    stock_mode: "AUTO",
    active: false,
    approved_by_admin: false,
    last_stock_sync_at: new Date().toISOString()
  };
}

export async function syncDeodap(env, supabase) {
  const catRes = await supabase(env, "categories?select=id,name&active=eq.true");
  const categories = await catRes.json();
  if (!Array.isArray(categories)) throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);

  const dailyId = await findCategory(categories, ["Daily Use Products", "Daily Use", "Daily Use Items", "Daily Essentials"]);
  const jewelleryId = await findCategory(categories, ["Artificial Jewellery", "Artificial Jewelry", "Jewellery", "Jewelry"]);
  if (!dailyId || !jewelleryId) {
    throw new Error(`DeoDap category mapping missing. Need Daily Use Products and Artificial Jewellery. Found: ${categories.map(c => c.name).join(", ")}`);
  }

  const dailyHandles = String(env.DEODAP_DAILY_COLLECTIONS || DEFAULT_DAILY_COLLECTIONS.join(","))
    .split(",").map(x => x.trim()).filter(Boolean);
  const jewelleryHandles = String(env.DEODAP_JEWELLERY_COLLECTIONS || JEWELLERY_COLLECTIONS.join(","))
    .split(",").map(x => x.trim()).filter(Boolean);

  const jewelleryIds = new Set();
  const allJewellery = [];
  for (const handle of jewelleryHandles) {
    for (const p of await fetchCollection(handle)) {
      const id = String(p.id);
      if (!jewelleryIds.has(id)) { jewelleryIds.add(id); allJewellery.push(p); }
    }
  }

  const imported = { jewellery: 0, daily: 0 };
  const seen = new Set();
  const upsert = async (p, categoryIdValue) => {
    const id = String(p.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const payload = payloadForProduct(p, categoryIdValue);
    const q = await supabase(env, `products?source=eq.DEODAP&source_product_id=eq.${encodeURIComponent(id)}&select=id`);
    const existing = await q.json();
    if (existing?.[0]) {
      await supabase(env, `products?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await supabase(env, "products", { method: "POST", body: JSON.stringify(payload) });
    }
  };

  for (const p of allJewellery) {
    await upsert(p, jewelleryId);
    imported.jewellery++;
  }

  for (const handle of dailyHandles) {
    for (const p of await fetchCollection(handle)) {
      if (jewelleryIds.has(String(p.id))) continue;
      await upsert(p, dailyId);
      imported.daily++;
    }
  }

  return { daily: imported.daily, jewellery: imported.jewellery, imported: imported.daily + imported.jewellery };
}

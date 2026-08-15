const DEODAP_BASE = "https://deodap.in";

const DEFAULT_DAILY_COLLECTIONS = [
  "kitchen-home-appliances",
  "cleaning-housekeeping",
  "household-supplies",
  "office-supplies",
  "stationery-school-supplies",
  "health-care",
  "home-utilities-safety"
];
const JEWELLERY_COLLECTIONS = ["jewellery", "jewellery-accessories", "womens-jewellery", "mens-jewellery"];

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
}

function moneyNumber(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function imageUrl(p) {
  const raw = p.images?.[0]?.src || p.featured_image?.src || p.variants?.[0]?.featured_image?.src || null;
  if (!raw) return null;
  return String(raw).startsWith("//") ? `https:${raw}` : String(raw);
}

async function fetchCollection(handle) {
  const u = `${DEODAP_BASE}/collections/${encodeURIComponent(handle)}/products.json?limit=250`;
  const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "Nexora-India/1.0" } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(d.products)) throw new Error(`collection '${handle}' unavailable (${r.status})`);
  return d.products;
}

async function fetchCollectionSafe(handle) {
  try { return await fetchCollection(handle); }
  catch (e) { return []; }
}

function findCategory(categories, aliases) {
  const wanted = aliases.map(x => x.toLowerCase());
  return categories.find(c => wanted.includes(String(c.name || "").trim().toLowerCase()))?.id || null;
}

function payloadForProduct(p, categoryIdValue) {
  const v = p.variants?.[0] || {};
  const price = moneyNumber(v.price || p.price || 0);
  const suggested = Number((price * 1.5).toFixed(2));
  const stock = v.inventory_quantity != null ? Math.max(0, Number(v.inventory_quantity) || 0) : 0;
  return {
    name: p.title || "DeoDap Product",
    slug: p.handle || null,
    description: stripHtml(p.body_html),
    source: "DEODAP",
    source_product_id: String(p.id),
    source_sku: v.sku || null,
    category_id: categoryIdValue,
    image_url: imageUrl(p),
    cost_price: price,
    suggested_price: suggested,
    selling_price: suggested,
    stock,
    stock_mode: "AUTO",
    active: false,
    approved_by_admin: false,
    last_stock_sync_at: new Date().toISOString()
  };
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
    throw new Error(`Supabase DeoDap batch upsert failed (${r.status}). Ensure products has a unique constraint on (source, source_product_id). ${text}`);
  }
}

async function getLiveProductIds(env, supabase) {
  const r = await supabase(env, "products?select=source_product_id&source=eq.DEODAP&active=eq.true");
  const d = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(d)) throw new Error(`Could not load live DeoDap products before sync: ${JSON.stringify(d)}`);
  return new Set(d.map(x => String(x.source_product_id || "")).filter(Boolean));
}

export async function syncDeodap(env, supabase) {
  const catRes = await supabase(env, "categories?select=id,name&active=eq.true");
  const categories = await catRes.json();
  if (!Array.isArray(categories)) throw new Error(`Could not load store categories: ${JSON.stringify(categories)}`);

  const dailyId = findCategory(categories, ["Daily Use Products", "Daily Use", "Daily Use Items", "Daily Essentials"]);
  const jewelleryId = findCategory(categories, ["Artificial Jewellery", "Artificial Jewelry", "Jewellery", "Jewelry"]);
  if (!dailyId || !jewelleryId) {
    throw new Error(`DeoDap category mapping missing. Need Daily Use Products and Artificial Jewellery. Found: ${categories.map(c => c.name).join(", ")}`);
  }

  const liveIds = await getLiveProductIds(env, supabase);
  const dailyHandles = String(env.DEODAP_DAILY_COLLECTIONS || DEFAULT_DAILY_COLLECTIONS.join(","))
    .split(",").map(x => x.trim()).filter(Boolean);
  const jewelleryHandles = String(env.DEODAP_JEWELLERY_COLLECTIONS || JEWELLERY_COLLECTIONS.join(","))
    .split(",").map(x => x.trim()).filter(Boolean);

  const jewelleryIds = new Set();
  const allJewellery = [];
  for (const handle of jewelleryHandles) {
    for (const p of await fetchCollectionSafe(handle)) {
      const id = String(p.id || "");
      if (id && !jewelleryIds.has(id)) { jewelleryIds.add(id); allJewellery.push(p); }
    }
  }

  const rows = { jewellery: [], daily: [] };
  const seen = new Set(liveIds);
  const MAX_PER_CATEGORY = 40;

  for (const p of allJewellery) {
    if (rows.jewellery.length >= MAX_PER_CATEGORY) break;
    const id = String(p.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.jewellery.push(payloadForProduct(p, jewelleryId));
  }

  for (const handle of dailyHandles) {
    if (rows.daily.length >= MAX_PER_CATEGORY) break;
    for (const p of await fetchCollectionSafe(handle)) {
      if (rows.daily.length >= MAX_PER_CATEGORY) break;
      const id = String(p.id || "");
      if (!id || seen.has(id) || jewelleryIds.has(id)) continue;
      seen.add(id);
      rows.daily.push(payloadForProduct(p, dailyId));
    }
  }

  await upsertBatch(env, supabase, [...rows.jewellery, ...rows.daily]);
  const imported = rows.daily.length + rows.jewellery.length;
  if (!imported) throw new Error("No new DeoDap products were returned. Existing live products are excluded from future syncs.");
  return { daily: rows.daily.length, jewellery: rows.jewellery.length, imported };
}

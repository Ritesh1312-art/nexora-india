// Dynamic category share landing pages:  /c/<category-slug>
//
// Link unfurlers (WhatsApp, Facebook, X/Twitter, LinkedIn, Telegram) cannot run
// the SPA or see hash routes, so this server-rendered page gives every category
// a shareable URL with a full Open Graph / Twitter "namecard":
//   - title/description come from the live category row in Supabase
//   - og:image prefers /images/share/<slug>-card.jpg when the file exists,
//     otherwise the category's own banner (banner-based), otherwise the
//     store-wide namecard — so FUTURE categories work automatically with no
//     code or image changes
// Human visitors are bounced straight into the storefront category view.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadCategory(env, slug) {
  const key = (env.SUPABASE_ANON_KEY || "").trim();
  if (!env.SUPABASE_URL || !key) return null;
  const url = `${env.SUPABASE_URL}/rest/v1/categories?slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=name,slug,description,image_url,icon_url,banner_url,seo_title,seo_description&limit=1`;
  try {
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const d = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(d) || !d[0]) return null;
    return d[0];
  } catch {
    return null;
  }
}

async function absolutize(origin, value) {
  const raw = String(value || "");
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return origin + raw;
  return null;
}

async function shareImage(env, request, slug, category) {
  const origin = new URL(request.url).origin;
  // 1) Dedicated share namecard for this category, if the file exists.
  try {
    if (env.ASSETS) {
      const probe = await env.ASSETS.fetch(new Request(`${origin}/images/share/${slug}-card.jpg`, { method: "HEAD" }));
      if (probe && probe.ok) return `${origin}/images/share/${slug}-card.jpg`;
    }
  } catch {}
  // 2) Banner-based fallback — future categories automatically get a share image.
  const banner = await absolutize(origin, category?.banner_url || category?.image_url);
  if (banner) return banner;
  // 3) Store-wide namecard.
  return `${origin}/images/share/website-card.jpg`;
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      ...extraHeaders
    }
  });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slug = String(params?.slug || "").toLowerCase();
  const origin = new URL(request.url).origin;
  if (!SLUG_RE.test(slug)) return Response.redirect(`${origin}/`, 302);

  const category = await loadCategory(env, slug);
  if (!category) {
    // Unknown / inactive category — send humans to the storefront homepage.
    return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nexora-India</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${origin}/">
<meta http-equiv="refresh" content="1;url=${esc(origin + "/")}">
</head><body style="font-family:system-ui;background:#0b1028;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center;padding:20px">
<h1 style="font-size:22px;margin:0 0 10px">This category is not available</h1>
<a style="color:#62e6d4;font-weight:700" href="${esc(origin + "/")}">Continue to Nexora-India →</a>
</div></body></html>`, 404);
  }

  const title = String(category.seo_title || category.name || "Category");
  const description = String(category.seo_description || category.description || `Explore ${category.name} on Nexora-India.`);
  const image = await shareImage(env, request, slug, category);
  const pageUrl = `${origin}/c/${encodeURIComponent(slug)}`;
  const storeUrl = `${origin}/#/category/${encodeURIComponent(slug)}`;
  const hero = (await absolutize(origin, category.banner_url || category.image_url)) || image;

  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · Nexora-India</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nexora-India">
<meta property="og:title" content="${esc(title)} · Nexora-India">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)} — Nexora-India">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} · Nexora-India">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="4;url=${esc(storeUrl)}">
<script>try{location.replace(${JSON.stringify(storeUrl)})}catch(e){}</script>
</head>
<body style="margin:0;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#0b1028;color:#fff;min-height:100vh;display:grid;place-items:center">
<main style="max-width:760px;width:100%;padding:32px 20px;text-align:center">
  <div style="border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.45)">
    <img src="${esc(hero)}" alt="${esc(title)}" style="display:block;width:100%;max-height:340px;object-fit:cover;background:#141b3d">
  </div>
  <p style="margin:26px 0 6px;font-size:11px;font-weight:800;letter-spacing:2px;color:#b7c0ff">NEXORA-INDIA · CATEGORY</p>
  <h1 style="margin:0 0 10px;font-size:clamp(28px,6vw,44px);letter-spacing:-1px">${esc(title)}</h1>
  <p style="margin:0 auto 22px;max-width:560px;color:#c9d1ea;line-height:1.55">${esc(description)}</p>
  <a href="${esc(storeUrl)}" style="display:inline-block;padding:13px 26px;border-radius:13px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-weight:800;text-decoration:none">Shop ${esc(category.name || "this category")} →</a>
  <p style="margin-top:18px;font-size:12px;color:#8b93b8">Opening the store… <a style="color:#62e6d4" href="${esc(storeUrl)}">tap here if nothing happens</a></p>
</main>
</body></html>`);
}

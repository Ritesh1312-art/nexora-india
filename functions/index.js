// Homepage share namecard: injects absolute Open Graph / Twitter meta tags into
// the static index.html so link unfurlers (WhatsApp, Facebook, X/Twitter,
// LinkedIn, Telegram) — which never run JavaScript — render a rich preview card
// for the store homepage. Absolute URLs are derived from the incoming request
// origin, so this works unchanged on the production domain, the pages.dev URL
// and preview deployments.
const CARD = "/images/share/website-card.jpg";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  let res;
  try {
    res = await env.ASSETS.fetch(request);
  } catch {
    return context.next();
  }
  if (!res || !res.ok) return res || context.next();
  const origin = new URL(request.url).origin;
  const card = origin + CARD;
  const tags = [
    `<meta property="og:url" content="${origin}/">`,
    `<meta property="og:image" content="${card}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Nexora-India — smart shopping across India">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="Nexora-India">`,
    `<meta name="twitter:description" content="Smart shopping with transparent pricing and secure checkout across five product categories.">`,
    `<meta name="twitter:image" content="${card}">`
  ].join("");
  return new HTMLRewriter()
    .on("head", { element(el) { el.append(tags, { html: true }); } })
    .transform(res);
}

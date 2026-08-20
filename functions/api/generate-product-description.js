import { isSafePublicUrl } from './_utils.js';
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function getAdminUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('Authentication required.');
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Supabase configuration is missing.');
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth }
  });
  if (!r.ok) throw new Error('Invalid or expired session.');
  const user = await r.json();
  const p = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active,is_blocked`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth }
  });
  if (!p.ok) throw new Error('Unable to verify admin access.');
  const rows = await p.json();
  const profile = rows[0];
  if (!profile || profile.role !== 'admin' || !profile.is_active || profile.is_blocked) throw new Error('Admin access required.');
  return user;
}

function cleanText(value, max=8000) { return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max); }

export async function onRequestPost({ request, env }) {
  try {
    await getAdminUser(request, env);
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY is not configured in Cloudflare Variables.' }, 503);
    const body = await request.json();
    const product = body.product || {};
    const imageUrl = cleanText(product.image_url, 2000);
    const productInfo = {
      name: cleanText(product.name, 500),
      sku: cleanText(product.sku, 200),
      category: cleanText(product.category_name || product.category || '', 300),
      brand: cleanText(product.brand || '', 300),
      mrp: product.mrp ?? '',
      selling_price: product.selling_price ?? '',
      stock: product.stock ?? '',
      current_description: cleanText(product.description, 6000)
    };

    const parts = [{ text: `You are an expert Indian e-commerce product copywriter and product analyst. Create the most useful, accurate, conversion-focused product description possible for the product below.\n\nPRODUCT DATA:\n${JSON.stringify(productInfo, null, 2)}\n\nRules:\n- Analyze the supplied product image if available. Use visible facts from the image such as product type, form factor, materials/finish, visible controls, ports, dimensions only when actually visible, color, design, accessories and apparent use cases.\n- Do NOT invent specifications, certifications, warranty, dimensions, battery capacity, wattage, compatibility, materials, health claims, ratings, or features that are not supported by the supplied data/image.\n- If a detail cannot be verified, omit it rather than guessing.\n- Write for Indian shoppers in clear, natural English.\n- Maximize useful information without keyword stuffing.\n- Return ONLY the ready-to-paste product description in plain text with clean headings and bullet points. No preface, no analysis, no markdown code fence.\n- Include, where supported: Overview; Key Features; Design/Build; How/Where to Use; Benefits; What\'s Included; Important Notes/Compatibility; and a concise purchase-oriented closing line.\n- Preserve factual uncertainty by using wording such as 'appears to' only when necessary.` }];

    if (imageUrl) {
      try {
        if (!isSafePublicUrl(imageUrl)) throw new Error('unsafe image url');
        const ir = await fetch(imageUrl, { redirect: 'follow' });
        if (ir.ok) {
          const ct = (ir.headers.get('content-type') || '').split(';')[0].toLowerCase();
          if (ct.startsWith('image/')) {
            const bytes = new Uint8Array(await ir.arrayBuffer());
            if (bytes.byteLength <= 8 * 1024 * 1024) {
              let binary = '';
              const chunk = 0x8000;
              for (let i=0; i<bytes.length; i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
              parts.push({ inline_data: { mime_type: ct, data: btoa(binary) } });
            }
          }
        }
      } catch (_) {}
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const gr = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.35, maxOutputTokens: 1800 } })
    });
    const gd = await gr.json();
    if (!gr.ok) return json({ error: gd?.error?.message || 'Gemini request failed.' }, gr.status);
    const text = gd?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('').trim();
    if (!text) return json({ error: 'Gemini returned no description.' }, 502);
    return json({ description: text, model: 'gemini-2.5-flash' });
  } catch (e) {
    return json({ error: e.message || 'Description generation failed.' }, 500);
  }
}

import {json,validAdmin,getSupabaseKey} from "./_utils.js";

// Nexora-India admin image upload endpoint.
// Uploads category favicon/banner images directly to Supabase Storage
// (public bucket "category-images") and returns the public URL.
// Only the logged-in admin can upload (same HttpOnly cookie as the rest
// of the admin API). Secrets come from env (SUPABASE_URL + service role key).

const BUCKET = "category-images";
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif"];

export async function onRequestPost({ request, env }) {
  try {
    if (!(await validAdmin(request, env)))
      return json({ error: "Admin login required" }, 401);

    const url = env.SUPABASE_URL || "";
    const key = getSupabaseKey(env);
    if (!url || !key)
      return json({ error: "Storage is not configured (SUPABASE_URL / service role key)" }, 500);

    let form;
    try { form = await request.formData(); }
    catch { return json({ error: "Expected multipart form data" }, 400); }

    const file = form.get("file");
    if (!file || typeof file === "string")
      return json({ error: "No file provided (field name: file)" }, 400);

    const original = String(file.name || "upload.png").toLowerCase();
    const m = original.match(/\.(jpe?g|png|webp|gif)$/);
    const ext = m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "";
    if (!ALLOWED.includes(ext))
      return json({ error: "Only JPG, PNG, WEBP or GIF images are allowed" }, 400);
    if (file.size > MAX_BYTES)
      return json({ error: "Image must be under 6 MB" }, 400);

    const buf = await file.arrayBuffer();
    const path = `category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": file.type || "application/octet-stream",
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000, immutable"
      },
      body: buf
    });

    if (!up.ok) {
      const detail = (await up.text()).slice(0, 300);
      return json({ error: `Upload failed (${up.status})`, details: detail }, 502);
    }

    return json({ url: `${url}/storage/v1/object/public/${BUCKET}/${path}` });
  } catch (e) {
    return json({ error: "Upload failed: " + (e && e.message ? e.message : "unknown error") }, 500);
  }
}

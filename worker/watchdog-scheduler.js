// Cloudflare Worker cron trigger for the Nexora-India watchdog.
//
// Deploy as a separate Worker (wrangler.toml in this directory) with:
//   - PAGES_URL        = your Cloudflare Pages deployment URL (e.g. https://nexora.pages.dev)
//   - WATCHDOG_SECRET  = the same secret configured on the Pages Functions
//
// Cron: 30 3,15 * * *  →  minute 30 of 03:00 and 15:00 (UTC) daily.

export default {
  async scheduled(event, env, ctx) {
    const base = (env.PAGES_URL || env.NEXORA_PAGES_URL || "").trim().replace(/\/+$/, "");
    const secret = (env.WATCHDOG_SECRET || "").trim();
    if (!base || !secret) {
      console.error("watchdog-scheduler: PAGES_URL and WATCHDOG_SECRET must be configured");
      return;
    }
    const url = new URL("/api/watchdog", base);
    url.searchParams.set("secret", secret);
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        console.error(`watchdog-scheduler: endpoint returned ${res.status}:`, body?.error || body);
        return;
      }
      if (body?.ok === false) {
        console.error("watchdog-scheduler: watchdog reported issues:", body.report?.issues);
      } else {
        console.log("watchdog-scheduler: watchdog run ok", body?.report?.ts);
      }
    } catch (e) {
      console.error("watchdog-scheduler: fetch to /api/watchdog failed:", e?.message || e);
    }
  }
};

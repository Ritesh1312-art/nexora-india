# Nexora-India

Deploy this repository as a Cloudflare Pages project with Functions.

## Required Cloudflare secrets/variables

- SUPABASE_URL
- SUPABASE_ANON_KEY (your Supabase Publishable key)
- SUPABASE_SERVICE_ROLE_KEY (or Supabase Secret key)
- ADMIN_PASSWORD
- JWT_SECRET
- CJ_API_KEY (preferred; the server automatically obtains the CJ access token)
- CJ_ACCESS_TOKEN (legacy/fallback only)
- CJ_USD_INR_RATE (optional, defaults to 90)
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

Optional DeoDap feed/collection variables:
- DEODAP_DAILY_COLLECTIONS
- DEODAP_JEWELLERY_COLLECTIONS

Never commit the Supabase Secret/service-role key, CJ token/API key, Telegram token, or ADMIN_PASSWORD to GitHub.

## Supabase

The database schema for this build is the Nexora-India schema created in Supabase SQL Editor. The browser uses the Publishable key; privileged writes happen in Pages Functions using the server-side secret.

## Supplier routing

- CJ → Footwear + Kitchen Appliances
- DeoDap → Daily Use Products + Artificial Jewellery
- Supplier syncs never intentionally cross these category mappings.
- Imported supplier products remain unpublished until admin review.

## Supplier sync

- CJ uses the official API 2.0 authentication flow. If `CJ_API_KEY` is configured, the server obtains the access token automatically; `CJ_ACCESS_TOKEN` is retained only as a fallback.
- DeoDap uses the public catalog collections by default. For a private/approved dropshipping CSV or JSON feed, configure `DEODAP_FEED_URL` in a future feed-specific integration rather than bypassing login/CAPTCHA/robots restrictions.
- Current DeoDap public-catalog sync is intended for product discovery/import; wholesale/drop-shipping cost data should come from an authorized DeoDap feed when available.

## Important current limitations

- UPI is intentionally UTR/manual verification. A plain UPI ID does not provide automatic bank confirmation.
- Supplier-imported products stay unpublished until admin review.
- DeoDap integration does not bypass CAPTCHA, login controls, robots restrictions, or supplier terms.
- Admin authentication is password-only via an HttpOnly cookie signed with JWT_SECRET.
- Favicon/banner are intentionally placeholders and can be added later.

# Nexora-India

Production e-commerce storefront for Cloudflare Pages + Functions + Supabase.

## Runtime configuration

Required Cloudflare secrets/variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (Supabase Publishable key)
- `SUPABASE_SERVICE_ROLE_KEY` (or Supabase Secret key)
- `ADMIN_PASSWORD_HASH` (PBKDF2-SHA256 format: `pbkdf2-sha256$iterations$base64salt$base64hash`)
- `ADMIN_PASSWORD` (optional; plain-text fallback accepted only when `ADMIN_PASSWORD_HASH` is not set — prefer the hash)
- `JWT_SECRET`
- `WATCHDOG_SECRET` (protects `GET /api/watchdog`; watchdog refuses to run if unset)
- `WATCHDOG_DEODAP_SYNC` (optional, `"true"` to run the DeoDap sync inside each watchdog run)
- `CJ_API_KEY` (preferred)
- `CJ_ACCESS_TOKEN` (legacy fallback)
- `CJ_REFRESH_TOKEN` (optional, used to renew access tokens)
- `CJ_OPEN_ID` (optional, CJ webhook HMAC signing secret)
- `CJ_AUTO_PAY` (optional, `"true"` to auto-pay CJ orders)
- `CJ_USD_INR_RATE` (optional, default 90)
- `GEMINI_API_KEY` (optional, for AI product descriptions)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional DeoDap variables:

- `DEODAP_DAILY_COLLECTIONS`
- `DEODAP_JEWELLERY_COLLECTIONS`

Never commit service-role/secret keys, supplier credentials, Telegram credentials or the admin password/hash to GitHub.

## Production storefront

`index.html` loads the canonical customer application (`store-v2.js` + `store-v2.css`) and the production hardening bridges. It provides:

- Homepage, categories, search, filtering and sorting
- Five main product categories, including Electrical Appliances
- Product detail, gallery, variants, stock and pricing
- Persistent guest cart with local storage
- Authenticated checkout with server-side price/stock validation
- Optional guest checkout when enabled in Admin → Settings
- Customer email/password authentication via Supabase Auth
- UPI intent/QR presentation and manual UTR verification
- Customer orders, payment history, addresses, wishlist and notifications
- Password reset and optional TOTP MFA enrollment/challenge
- Product reviews restricted to verified purchases and admin moderation
- Support tickets and privacy/account-deletion requests
- Shipping/returns/privacy/terms/contact/cancellation pages
- Responsive mobile/desktop UI and production security headers

## Admin console

`admin.html` loads the canonical operations console (`admin-v2.js` + `admin-v2.css`) and product editor bridges with:

- Dashboard statistics
- Product publishing, pricing, stock and variants
- Add Product (full form with Gemini description generation, Save Draft / Save & Live) and Edit Product workflows
- Gemini-assisted product descriptions
- Payment verification/rejection
- Supplier/shipping tracking updates with server-side status validation
- Users and account blocking
- Categories and SEO fields
- Review moderation
- Support ticket status
- Offers
- Store/payment/delivery settings
- CJ and DeoDap supplier sync

Admin operations use HttpOnly JWT authentication and server-side Supabase secrets.

## API abuse protection

Cloudflare Pages Functions middleware now applies server-side, database-backed per-IP rate limiting to API routes. Sensitive admin, order, payment and admin-operation routes use stricter limits, while the admin login endpoints are limited to five attempts per 15 minutes per IP. Supabase Auth also provides its own authentication endpoint rate limits. The limiter is **fail-open**: if the Supabase rate-limit counter is unavailable, requests are allowed through instead of returning 503, so the store stays reachable during database hiccups (the limit is simply not enforced during the outage).

## Database hardening

The production migrations add:

- Variant-aware atomic stock reservation/release
- Automatic `payment_records` synchronization from order payment state
- Verified-purchase review validation
- Review moderation/RLS
- One-default-address uniqueness
- Least-privilege customer RLS cleanup
- Removal of unnecessary public execution for backend-only stock/payment helpers
- Required indexes for review/order relationships
- Stale unpaid-order reservation expiry every five minutes
- Offer usage committed only when payment is actually verified, with concurrency-safe limits
- Database-backed API rate-limit counters with restricted service-role execution

## Supplier routing

- CJ → Footwear + Kitchen Appliances
- DeoDap → Daily Use Products + Artificial Jewellery
- Electrical Appliances remains available as a first-class storefront/admin category; products can be added manually or routed through a configured supplier workflow.
- Supplier imports remain unpublished until admin review.
- Supplier integrations do not bypass CAPTCHA, login controls, robots restrictions or supplier terms.
- Supplier auto-sync is not assumed to be running unless a scheduler is explicitly configured; manual supplier sync remains available from Admin.

## Payment model

UPI is intentionally manual-UTR verification because a plain UPI ID cannot independently confirm bank settlement. The storefront can present a configured UPI ID, UPI intent and QR; admin verifies the submitted UTR before fulfilment.

The store's real UPI ID must be entered in **Admin → Settings** before the QR/UPI payment panel can show a live destination. No placeholder UPI ID is hard-coded.

## Database setup

`supabase/COMPLETE_SETUP.sql` is the single-file **base schema** (tables, enums, triggers, RLS policies, stock/offer/payment RPCs, rate-limit counter, 5 seed categories and the `admin_settings` row). It is fully idempotent and must be run **first** in the Supabase SQL editor; then run the hardening migrations in `supabase/migrations/` in file order. The API and client code only ever reference objects created by this file plus the migrations.

## Watchdog

`GET /api/watchdog` (or POST) is an operational health check protected by `WATCHDOG_SECRET` (query param `?secret=` or `Authorization: Bearer`). It reports Supabase health, live/low-stock product counts, pending payments, stale unpaid orders, open support tickets and stuck supplier orders, optionally runs the DeoDap sync (`WATCHDOG_DEODAP_SYNC=true`) and sends a Telegram summary. It refuses to run (403) when `WATCHDOG_SECRET` is not configured.

The cron trigger lives in `worker/` (`watchdog-scheduler.js` + `wrangler.toml`, schedule `30 3,15 * * *` — minute 30 of 03:00 and 15:00 UTC). Deploy it as a separate Worker with `PAGES_URL` (the Pages deployment URL) and the same `WATCHDOG_SECRET`.

## Final external security setting

Supabase Security Advisor currently reports one remaining project-level item: **Leaked Password Protection is disabled**. This is an Auth dashboard setting rather than a database/function setting; enable it under Supabase Authentication password security before public launch. Supabase documents this protection as a HaveIBeenPwned-backed check against compromised passwords.

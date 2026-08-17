# Nexora-India

Production e-commerce storefront for Cloudflare Pages + Functions + Supabase.

## Runtime configuration

Required Cloudflare secrets/variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (Supabase Publishable key)
- `SUPABASE_SERVICE_ROLE_KEY` (or Supabase Secret key)
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `CJ_API_KEY` (preferred)
- `CJ_ACCESS_TOKEN` (legacy fallback)
- `CJ_USD_INR_RATE` (optional, default 90)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional DeoDap variables:

- `DEODAP_DAILY_COLLECTIONS`
- `DEODAP_JEWELLERY_COLLECTIONS`

Never commit service-role/secret keys, supplier credentials, Telegram credentials or admin password to GitHub.

## Production storefront

`index.html` loads the canonical customer application (`store-v2.js` + `store-v2.css`) and the production hardening bridges. It provides:

- Homepage, categories, search, filtering and sorting
- Five main product categories, including Electrical Appliances
- Product detail, gallery, variants, stock and pricing
- Persistent guest cart with local storage
- Authenticated checkout with server-side price/stock validation
- Optional guest checkout when enabled in Admin → Settings
- Google customer sign-in via Supabase OAuth, plus email/password authentication
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
- Add Product and Edit Product workflows
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

## Google OAuth configuration

The storefront contains the Google sign-in flow. Before customers can use it, enable the **Google provider** in Supabase Authentication and configure the Google OAuth client credentials plus the production redirect URL in Supabase. This is an external provider configuration and cannot be safely invented in code.

## Final external security setting

Supabase Security Advisor currently reports one remaining project-level item: **Leaked Password Protection is disabled**. This is an Auth dashboard setting rather than a database/function setting; enable it under Supabase Authentication password security before public launch. Supabase documents this protection as a HaveIBeenPwned-backed check against compromised passwords.

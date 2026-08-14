# Nexora-India

Deploy this repository as a Cloudflare Pages project with Functions.

## Required Cloudflare secrets/variables

- SUPABASE_URL
- SUPABASE_ANON_KEY (your Supabase Publishable key)
- SUPABASE_SERVICE_ROLE_KEY (or Supabase Secret key)
- ADMIN_PASSWORD
- JWT_SECRET
- CJ_ACCESS_TOKEN
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

Never commit the Supabase Secret/service-role key, CJ token, Telegram token, or ADMIN_PASSWORD to GitHub.

## Supabase

The database schema for this build is the Nexora-India schema created in Supabase SQL Editor. The browser uses the Publishable key; privileged writes happen in Pages Functions using the server-side secret.

## Important current limitations

- UPI is intentionally UTR/manual verification. A plain UPI ID does not provide automatic bank confirmation.
- CJ product import is server-side and imported products stay unpublished until admin review.
- DeoDap is designed for approved/manual feed or import; this project does not bypass CAPTCHA, login controls, robots restrictions, or supplier terms.
- Admin authentication is password-only via an HttpOnly cookie signed with JWT_SECRET.
- Favicon/banner are intentionally placeholders and can be added later.

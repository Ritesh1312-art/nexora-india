-- ============================================================
-- 20260821_affiliate_program.sql
-- Nexora-India affiliate / refer-and-earn program.
--
-- Flow:
--   1. A logged-in customer joins the program (My Account → Earn & Refer)
--      and gets a personal code + link (?ref=CODE).
--   2. Storefront captures ?ref=CODE (30-day window), counts the click via
--      /api/affiliate?track=CODE (service role), and attaches the code to
--      any order placed afterwards (orders.affiliate_code).
--   3. order.js creates a PENDING referral row (commission = % of
--      subtotal-after-discount; delivery never counts). Self-referrals are
--      ignored.
--   4. Payment VERIFIED  → referral QUALIFIED (payable)
--      Payment REJECTED  → referral CANCELLED
--   5. Admin marks payouts PAID manually (UPI) in the Affiliates tab.
--
-- All affiliate writes go through the service role; users can only READ
-- their own rows. Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  display_name text,
  payout_upi text,
  status text not null default 'active' check (status in ('active','blocked')),
  commission_percent numeric, -- null → store-wide default from admin_settings
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliates_user_unique unique (user_id),
  constraint affiliates_code_unique unique (code)
);

create table if not exists public.affiliate_clicks (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_clicks_aff_idx on public.affiliate_clicks(affiliate_id);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  order_number text,
  order_amount numeric not null default 0,
  commission_amount numeric not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING','QUALIFIED','PAID','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_referrals_order_unique unique (order_id)
);
create index if not exists affiliate_referrals_aff_idx on public.affiliate_referrals(affiliate_id);

-- Traceability on the order itself
alter table public.orders add column if not exists affiliate_code text;

-- Store-wide knobs
alter table public.admin_settings add column if not exists affiliate_enabled boolean not null default true;
alter table public.admin_settings add column if not exists affiliate_commission_percent numeric not null default 5;

-- RLS: read-own only; no direct user writes (service role does all writes)
alter table public.affiliates enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_referrals enable row level security;

drop policy if exists affiliates_own_read on public.affiliates;
create policy affiliates_own_read on public.affiliates
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists referrals_own_read on public.affiliate_referrals;
create policy referrals_own_read on public.affiliate_referrals
  for select to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = (select auth.uid())));
-- affiliate_clicks intentionally has NO policies: users must not be able
-- to inflate or read click data directly; /api/affiliate handles it.

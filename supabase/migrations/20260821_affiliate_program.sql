-- ============================================================
-- 20260821_affiliate_program.sql   (FINAL v2, production ready)
-- Nexora-India affiliate / refer-and-earn program.
--
-- Flow:
--   1. A logged-in customer joins (My Account, Earn and Refer tab) and gets
--      a personal UPPERCASE code like NX4F2A9C81 plus a link ?ref=CODE.
--   2. Storefront captures ?ref=CODE (30-day window), counts the click via
--      /api/affiliate?track=CODE (service role), and attaches the code to
--      any order placed afterwards (orders.affiliate_code).
--   3. order.js creates a PENDING referral row (commission = percent of
--      subtotal after discount; delivery never counts). Self-referrals are
--      ignored and affiliate errors can never block an order.
--   4. Payment VERIFIED  then referral becomes QUALIFIED (payable)
--      Payment REJECTED  then referral becomes CANCELLED
--   5. Admin marks payouts PAID manually (UPI) in the Affiliates tab.
--
-- All affiliate writes go through the service role; users can only READ
-- their own rows. Fully idempotent: safe to run on a fresh database or on
-- one where an older version of this script already ran (older tables are
-- upgraded in place via "add column if not exists").
--
-- NOTE: this script deliberately contains NO ASCII angle brackets and no
-- ampersands, so copy-pasting it from chat can never corrupt it into
-- HTML entities. That was the root cause of the earlier syntax errors.
-- ============================================================

begin;

-- ============================================================
-- 1. AFFILIATES
-- ============================================================

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  code text not null,
  display_name text,
  payout_upi text,

  status text not null default 'active',

  commission_percent numeric(5,2), -- null means use the store-wide default

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Column upgrades for databases where an older version of this script ran
alter table public.affiliates add column if not exists display_name text;
alter table public.affiliates add column if not exists payout_upi text;
alter table public.affiliates add column if not exists status text not null default 'active';
alter table public.affiliates add column if not exists commission_percent numeric(5,2);
alter table public.affiliates add column if not exists created_at timestamptz not null default now();
alter table public.affiliates add column if not exists updated_at timestamptz not null default now();

-- One affiliate account per user
create unique index if not exists affiliates_user_unique
on public.affiliates(user_id);

-- Codes are stored UPPERCASE (the app generates codes like NX4F2A9C81 and
-- uppercases every incoming code before lookup, so case can never clash)
update public.affiliates
set code = upper(trim(code))
where code is distinct from upper(trim(code));

-- Case-insensitive uniqueness of the code
create unique index if not exists affiliates_code_lower_unique
on public.affiliates (lower(code));

create index if not exists affiliates_status_idx
on public.affiliates(status);

-- Checks (drop then re-add, so re-runs stay clean)
alter table public.affiliates drop constraint if exists affiliates_status_check;
alter table public.affiliates add constraint affiliates_status_check
  check (status in ('active','blocked'));

alter table public.affiliates drop constraint if exists affiliates_commission_check;
alter table public.affiliates add constraint affiliates_commission_check
  check (commission_percent is null or (commission_percent between 0 and 100));

alter table public.affiliates drop constraint if exists affiliates_code_not_blank;
alter table public.affiliates add constraint affiliates_code_not_blank
  check (not (length(trim(code)) = 0));

-- ============================================================
-- 2. AFFILIATE CLICKS  (written only by the service role)
-- ============================================================

create table if not exists public.affiliate_clicks (
  id bigint generated always as identity primary key,

  affiliate_id uuid not null
    references public.affiliates(id)
    on delete cascade,

  created_at timestamptz not null default now()
);

alter table public.affiliate_clicks add column if not exists created_at timestamptz not null default now();

create index if not exists affiliate_clicks_aff_idx
on public.affiliate_clicks(affiliate_id);

create index if not exists affiliate_clicks_created_at_idx
on public.affiliate_clicks(created_at);

create index if not exists affiliate_clicks_aff_created_idx
on public.affiliate_clicks(affiliate_id, created_at);

-- ============================================================
-- 3. AFFILIATE REFERRALS
-- ============================================================

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),

  affiliate_id uuid not null
    references public.affiliates(id)
    on delete restrict, -- block affiliate deletion once referrals exist; use status blocked instead

  order_id uuid
    references public.orders(id)
    on delete set null,

  order_number text,

  order_amount numeric(12,2) not null default 0,
  commission_percent numeric(5,2),
  commission_amount numeric(12,2) not null default 0,

  status text not null default 'PENDING',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Column upgrades for older versions
alter table public.affiliate_referrals add column if not exists order_number text;
alter table public.affiliate_referrals add column if not exists order_amount numeric(12,2) not null default 0;
alter table public.affiliate_referrals add column if not exists commission_percent numeric(5,2);
alter table public.affiliate_referrals add column if not exists commission_amount numeric(12,2) not null default 0;
alter table public.affiliate_referrals add column if not exists status text not null default 'PENDING';
alter table public.affiliate_referrals add column if not exists created_at timestamptz not null default now();
alter table public.affiliate_referrals add column if not exists updated_at timestamptz not null default now();

-- One referral row per order (null order_id rows never clash)
create unique index if not exists affiliate_referrals_order_unique
on public.affiliate_referrals(order_id);

create index if not exists affiliate_referrals_aff_idx
on public.affiliate_referrals(affiliate_id);

create index if not exists affiliate_referrals_status_idx
on public.affiliate_referrals(status);

alter table public.affiliate_referrals drop constraint if exists affiliate_referrals_status_check;
alter table public.affiliate_referrals add constraint affiliate_referrals_status_check
  check (status in ('PENDING','QUALIFIED','PAID','CANCELLED'));

alter table public.affiliate_referrals drop constraint if exists affiliate_referrals_amounts_check;
alter table public.affiliate_referrals add constraint affiliate_referrals_amounts_check
  check (order_amount between 0 and 9999999999.99 and commission_amount between 0 and 9999999999.99);

alter table public.affiliate_referrals drop constraint if exists affiliate_referrals_pct_check;
alter table public.affiliate_referrals add constraint affiliate_referrals_pct_check
  check (commission_percent is null or (commission_percent between 0 and 100));

-- ============================================================
-- 4. ORDER TRACEABILITY + STORE-WIDE SETTINGS
-- ============================================================

alter table public.orders add column if not exists affiliate_code text;

alter table public.admin_settings add column if not exists affiliate_enabled boolean not null default true;
alter table public.admin_settings add column if not exists affiliate_commission_percent numeric not null default 5;

-- ============================================================
-- 5. ROW LEVEL SECURITY (users read their own rows only)
-- ============================================================

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

-- affiliate_clicks intentionally has NO policies: clicks are written only
-- by the service role through /api/affiliate, so users can never inflate
-- or read raw click data directly.

commit;

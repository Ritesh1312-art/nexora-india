-- ============================================================================
-- NEXORA-INDIA — COMPLETE DATABASE SETUP (idempotent)
-- ----------------------------------------------------------------------------
-- Single-file base schema for the Nexora-India store on Supabase.
--
-- This file is the *base* schema. The hardening migrations in
-- supabase/migrations/ build on top of it (atomic stock reservation, data
-- integrity checks, RPC revokes, indexes, targeted offers, rate limiting).
-- Run this file FIRST in the Supabase SQL editor (or `supabase db push`
-- equivalent), then run the migrations in supabase/migrations/.
--
-- Everything in this file is idempotent: it can be re-run safely.
--   - CREATE TABLE / TYPE / SEQUENCE / INDEX ... IF NOT EXISTS
--   - CREATE OR REPLACE FUNCTION
--   - DROP POLICY IF EXISTS + CREATE POLICY
--   - DROP TRIGGER IF EXISTS + CREATE TRIGGER
--   - INSERT ... ON CONFLICT ... DO UPDATE / DO NOTHING
--
-- The table/column/enum/trigger/RLS surface was derived from the production
-- API (functions/api/*.js), the storefront/admin client code and the
-- existing hardening migrations.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. ENUMS
-- (CREATE TYPE has no IF NOT EXISTS form, so guard each creation)
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('PENDING','SUBMITTED','VERIFIED','REJECTED');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'PENDING_PAYMENT','PAYMENT_SUBMITTED','PAID','PROCESSING','SUPPLIER_ORDERED',
      'SHIPPED','DELIVERED','CANCELLED','REFUNDED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'offer_target_type') then
    create type public.offer_target_type as enum (
      'ALL','ACTIVE_USERS','INACTIVE_USERS','SELECTED_USERS','NEW_USERS','EXISTING_CUSTOMERS','NO_ORDER_USERS','REPEAT_CUSTOMERS'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'offer_type') then
    create type public.offer_type as enum ('PERCENTAGE','FLAT','FIXED');
  end if;
end
$$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- ---------------------------------------------------------------- categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  parent_id uuid references public.categories(id) on delete set null,
  description text,
  image_url text,
  icon_url text,
  banner_url text,
  seo_title text,
  seo_description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  category_type text not null default 'OWN' check (category_type in ('OWN','SUPPLIER')),
  source_name text,
  source_category_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_unique unique (slug)
);

-- ------------------------------------------------------------------ products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sku text,
  description text,
  image_url text,
  gallery jsonb not null default '[]'::jsonb,
  mrp numeric,
  selling_price numeric not null default 0,
  cost_price numeric not null default 0,
  suggested_price numeric,
  stock integer not null default 0,
  stock_mode text not null default 'MANUAL' check (stock_mode in ('MANUAL','AUTO')),
  last_stock_sync_at timestamptz,
  min_order_qty integer not null default 1,
  low_stock_threshold integer not null default 5,
  delivery_charge numeric not null default 0,
  electrical_mrp numeric,
  electrical_delivery_charge numeric,
  category_id uuid references public.categories(id) on delete set null,
  source text not null default 'MANUAL',
  supplier_id uuid references public.suppliers(id) on delete set null,
  source_product_id text,
  source_sku text,
  source_url text,
  active boolean not null default false,
  approved_by_admin boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Supplier upserts use: products?on_conflict=source,source_product_id
  constraint products_source_identity unique (source, source_product_id)
);

-- ---------------------------------------------------------- product_variants
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  sku text,
  attributes jsonb not null default '{}'::jsonb,
  cost_price numeric not null default 0,
  selling_price numeric not null default 0,
  stock integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ profiles
-- One row per Supabase Auth user, created by the handle_new_user() trigger.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pincode text,
  landmark text,
  date_of_birth date,
  gender text,
  role text not null default 'customer' check (role in ('customer','admin')),
  is_active boolean not null default true,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- addresses
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  pincode text not null,
  landmark text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- offers
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  offer_type public.offer_type not null default 'PERCENTAGE',
  target_type public.offer_target_type not null default 'ALL',
  discount_percent numeric,
  discount_amount numeric,
  max_discount_amount numeric,
  min_order_amount numeric,
  min_quantity integer,
  max_uses integer,
  max_uses_per_user integer,
  used_count integer not null default 0,
  target_user_ids jsonb not null default '[]'::jsonb,
  category_id uuid references public.categories(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  active boolean not null default true,
  admin_approved boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offer_targets (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint offer_targets_offer_user_unique unique (offer_id, user_id)
);

create table if not exists public.offer_usage (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.offers(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  discount_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  user_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  pincode text not null,
  landmark text,
  customer_notes text,
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  shipping_amount numeric not null default 0,
  total_amount numeric not null default 0,
  estimated_supplier_cost numeric not null default 0,
  estimated_profit numeric not null default 0,
  offer_id uuid references public.offers(id) on delete set null,
  offer_code text,
  payment_method text not null default 'UPI',
  payment_status public.payment_status not null default 'PENDING',
  utr text,
  order_status public.order_status not null default 'PENDING_PAYMENT',
  stock_reserved boolean not null default false,
  stock_released boolean not null default false,
  admin_notes text,
  shipping_status text,
  tracking_number text,
  tracking_url text,
  carrier text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_order_number_unique unique (order_number)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text,
  sku text,
  quantity integer not null,
  unit_selling_price numeric not null default 0,
  unit_cost_price numeric not null default 0,
  total_selling_price numeric not null default 0,
  total_cost_price numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null default 'UPI',
  amount numeric,
  utr text,
  status text not null default 'PENDING',
  rejection_reason text,
  verified_by text,
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_records_order_unique unique (order_id)
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_status public.order_status,
  payment_status public.payment_status,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null default 'SYSTEM',
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null,
  active boolean not null default true,
  api_enabled boolean not null default false,
  api_base_url text,
  contact_name text,
  contact_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_order_number text,
  supplier_external_order_id text,
  supplier_cost numeric not null default 0,
  status text not null default 'PENDING',
  supplier_notes text,
  ordered_at timestamptz,
  submitted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  tracking_number text,
  tracking_url text,
  carrier text,
  tracking_status text,
  tracking_last_checked_at timestamptz,
  submission_attempts integer not null default 0,
  max_submission_attempts integer not null default 5,
  retryable boolean not null default false,
  next_retry_at timestamptz,
  last_submission_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The queue_supplier_orders_after_payment() trigger upserts with
  -- "on conflict (order_id, supplier_id)", which requires a plain unique
  -- constraint (a partial index alone would not satisfy the inference).
  constraint supplier_orders_order_supplier_unique unique (order_id, supplier_id)
);

create table if not exists public.product_sync_logs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  action text,
  status text,
  error text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_sync_logs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  source text,
  imported integer,
  error text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- storefront account
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  verified_purchase boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_product_user_unique unique (product_id, user_id)
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  message text,
  type text not null default 'info',
  order_id uuid references public.orders(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wishlists_user_product_unique unique (user_id, product_id)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'en',
  currency text not null default 'INR',
  email_notifications boolean not null default true,
  sms_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','rejected')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------- admin_settings
-- Single-row settings table addressed as admin_settings?id=eq.true
create table if not exists public.admin_settings (
  id boolean primary key,
  store_name text,
  store_email text,
  telegram_username text,
  upi_id text,
  currency text not null default 'INR',
  guest_checkout_enabled boolean not null default false,
  user_registration_enabled boolean not null default true,
  store_enabled boolean not null default true,
  auto_product_import_enabled boolean not null default false,
  auto_stock_sync_enabled boolean not null default false,
  auto_publish_products boolean not null default false,
  minimum_profit_amount numeric,
  minimum_profit_percent numeric,
  delivery_enabled boolean not null default true,
  default_delivery_charge numeric not null default 0,
  electrical_delivery_charge numeric not null default 0,
  free_delivery_min_amount numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- rate limiting
-- Counter table backing the consume_api_rate_limit() RPC (per-IP, per-route).
create table if not exists public.api_rate_limits (
  key text primary key,
  hits integer not null default 1,
  window_start timestamptz not null default now()
);

-- ============================================================================
-- 3. DATA-INTEGRITY CONSTRAINTS (mirrors 20260815_data_integrity_constraints)
-- ============================================================================
alter table public.products drop constraint if exists products_stock_nonnegative;
alter table public.products add constraint products_stock_nonnegative check (stock >= 0);
alter table public.products drop constraint if exists products_min_order_qty_positive;
alter table public.products add constraint products_min_order_qty_positive check (min_order_qty >= 1);
alter table public.products drop constraint if exists products_prices_nonnegative;
alter table public.products add constraint products_prices_nonnegative check (cost_price >= 0 and selling_price >= 0 and delivery_charge >= 0 and (electrical_delivery_charge is null or electrical_delivery_charge >= 0));
alter table public.product_variants drop constraint if exists product_variants_stock_nonnegative;
alter table public.product_variants add constraint product_variants_stock_nonnegative check (stock >= 0);
alter table public.offers drop constraint if exists offers_discount_percent_valid;
alter table public.offers add constraint offers_discount_percent_valid check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));
alter table public.orders drop constraint if exists orders_amounts_nonnegative;
alter table public.orders add constraint orders_amounts_nonnegative check (subtotal >= 0 and discount_amount >= 0 and shipping_amount >= 0 and total_amount >= 0 and estimated_supplier_cost >= 0);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================
create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists offers_category_id_idx on public.offers(category_id);
create index if not exists offers_product_id_idx on public.offers(product_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_variant_id_idx on public.order_items(variant_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists orders_offer_id_idx on public.orders(offer_id);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_order_status_idx on public.orders(order_status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists product_sync_logs_supplier_id_idx on public.product_sync_logs(supplier_id);
create index if not exists products_supplier_id_idx on public.products(supplier_id);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_live_idx on public.products(active, approved_by_admin);
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists product_reviews_product_id_idx on public.product_reviews(product_id);
create index if not exists product_reviews_user_id_idx on public.product_reviews(user_id);
create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists wishlists_user_id_idx on public.wishlists(user_id);
create index if not exists addresses_user_id_idx on public.addresses(user_id);
create index if not exists supplier_orders_supplier_id_idx on public.supplier_orders(supplier_id);
create index if not exists supplier_orders_order_id_idx on public.supplier_orders(order_id);
create index if not exists supplier_sync_logs_supplier_id_idx on public.supplier_sync_logs(supplier_id);
create index if not exists offer_usage_order_id_idx on public.offer_usage(offer_id, user_id);
-- One offer per order (mirrors 20260815_offer_usage_unique)
create unique index if not exists offer_usage_order_unique on public.offer_usage(order_id) where order_id is not null;
-- One default address per user
create unique index if not exists addresses_user_default_uidx on public.addresses(user_id) where is_default;
-- One supplier order per store order + supplier (mirrors 20260815_supplier_order_idempotency)
create unique index if not exists supplier_orders_order_supplier_uidx on public.supplier_orders(order_id, supplier_id) where supplier_id is not null;

-- ============================================================================
-- 5. SEQUENCES
-- ============================================================================
create sequence if not exists public.order_number_seq start 1;

-- ============================================================================
-- 6. FUNCTIONS
-- ============================================================================

-- ------------------------------------------------------------ set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
alter function public.set_updated_at() set search_path = public, pg_catalog;

-- -------------------------------------------------------- generate_order_number
-- BEFORE INSERT on orders: NEX-YYYYMMDD-000001 (zero-padded sequence)
create or replace function public.generate_order_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'NEX-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------ validate_electrical_product
-- Electrical products are flagged by electrical_mrp (nullable). Keep the
-- electrical delivery charge consistent with the flag.
create or replace function public.validate_electrical_product()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.electrical_mrp is not null and new.electrical_delivery_charge is null then
    new.electrical_delivery_charge := coalesce((select electrical_delivery_charge from public.admin_settings where id = true), 0);
  end if;
  if new.electrical_mrp is null then
    new.electrical_delivery_charge := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- handle_new_user
-- Creates the public.profiles row when a Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.phone,
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------- reserve_order_stock
-- Legacy product-level reservation (kept for backwards compatibility with the
-- original schema surface; reserve_product_stock is the canonical RPC).
create or replace function public.reserve_order_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  pid uuid;
  qty integer;
  reserved jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_STOCK_ITEMS';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    pid := nullif(item->>'product_id', '')::uuid;
    qty := greatest(1, coalesce((item->>'quantity')::integer, 1));
    if pid is null then
      raise exception 'INVALID_PRODUCT_ID';
    end if;
    update products
       set stock = stock - qty,
           updated_at = now()
     where id = pid
       and active = true
       and approved_by_admin = true
       and stock >= qty;
    if not found then
      raise exception 'INSUFFICIENT_STOCK:%', pid;
    end if;
    reserved := reserved || jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', qty));
  end loop;
  return reserved;
end;
$$;

-- ------------------------------------------------------- reserve_product_stock
-- Atomic product-level reservation (mirrors 20260815_atomic_stock_reservation).
create or replace function public.reserve_product_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  pid uuid;
  qty integer;
  reserved jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_STOCK_ITEMS';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    pid := nullif(item->>'product_id', '')::uuid;
    qty := greatest(1, coalesce((item->>'quantity')::integer, 1));
    if pid is null then
      raise exception 'INVALID_PRODUCT_ID';
    end if;
    update products
       set stock = stock - qty,
           updated_at = now()
     where id = pid
       and active = true
       and approved_by_admin = true
       and stock >= qty;
    if not found then
      raise exception 'INSUFFICIENT_STOCK:%', pid;
    end if;
    reserved := reserved || jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', qty));
  end loop;
  return reserved;
end;
$$;

-- -------------------------------------------------------- release_product_stock
create or replace function public.release_product_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  pid uuid;
  qty integer;
  released jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_STOCK_ITEMS';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    pid := nullif(item->>'product_id', '')::uuid;
    qty := greatest(1, coalesce((item->>'quantity')::integer, 1));
    if pid is null then
      raise exception 'INVALID_PRODUCT_ID';
    end if;
    update products
       set stock = greatest(0, stock + qty),
           updated_at = now()
     where id = pid;
    if found then
      released := released || jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', qty));
    end if;
  end loop;
  return released;
end;
$$;

-- -------------------------------------------------- handle_order_stock_after_payment
-- Safety net: if a payment is marked REJECTED while stock is still reserved,
-- release the reserved stock. The admin API already claims stock_released
-- before flipping the payment status, so this only fires for direct updates.
create or replace function public.handle_order_stock_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  items jsonb;
begin
  if new.payment_status = 'REJECTED'::payment_status
     and old.payment_status is distinct from 'REJECTED'::payment_status
     and new.stock_reserved
     and not new.stock_released then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity)), '[]'::jsonb)
      into items
      from public.order_items
     where order_id = new.id;
    if coalesce(items, '[]'::jsonb) <> '[]'::jsonb then
      perform public.release_product_stock(items);
    end if;
    new.stock_released := true;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------ queue_supplier_orders_after_payment
-- Mirrors 20260815_harden_supplier_queue_trigger.
create or replace function public.queue_supplier_orders_after_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', pg_catalog
as $$
declare
  grp record;
  sid uuid;
  sname text;
  stype text;
  notes jsonb;
begin
  if new.payment_status <> 'VERIFIED'::payment_status or old.payment_status = 'VERIFIED'::payment_status then
    return new;
  end if;
  for grp in
    select p.supplier_id, upper(coalesce(p.source::text,'MANUAL')) as source,
      sum(oi.total_cost_price) as supplier_cost,
      jsonb_agg(jsonb_build_object('order_item_id',oi.id,'product_id',p.id,'source_product_id',p.source_product_id,'source_sku',p.source_sku,'quantity',oi.quantity,'product_name',oi.product_name,'sku',coalesce(p.source_sku,oi.sku))) as items
    from order_items oi join products p on p.id=oi.product_id where oi.order_id=new.id group by p.supplier_id,p.source
  loop
    sid:=grp.supplier_id;
    if sid is null then
      select s.id,s.name,s.source_type::text into sid,sname,stype from suppliers s where upper(s.source_type::text)=grp.source and s.active=true order by s.created_at limit 1;
    else
      select s.name,s.source_type::text into sname,stype from suppliers s where s.id=sid;
    end if;
    if sid is null then continue; end if;
    notes:=jsonb_build_object('source',grp.source,'items',grp.items,'api_enabled',exists(select 1 from suppliers s where s.id=sid and s.api_enabled=true));
    insert into supplier_orders(order_id,supplier_id,supplier_cost,status,ordered_at,supplier_notes)
    values(new.id,sid,coalesce(grp.supplier_cost,0),case when grp.source='MANUAL' then 'MANUAL_FULFILLMENT' else 'PENDING' end,null,case when grp.source='MANUAL' then 'Manual fulfilment required for this order.' else notes::text end)
    on conflict (order_id,supplier_id) do update set supplier_notes=case when supplier_orders.supplier_external_order_id is null then excluded.supplier_notes else supplier_orders.supplier_notes end,supplier_cost=excluded.supplier_cost,updated_at=now();
  end loop;
  update orders set order_status='PROCESSING'::order_status,updated_at=now() where id=new.id and order_status='PAID'::order_status;
  return new;
end;
$$;

-- -------------------------------------------- record_offer_usage_on_verified_payment
-- Mirrors 20260815_offer_usage_atomicity.
create or replace function public.record_offer_usage_on_verified_payment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare target_id uuid;
begin
  if new.payment_status='VERIFIED'
     and old.payment_status is distinct from 'VERIFIED'
     and new.offer_id is not null then
    if not exists (
      select 1 from public.offer_usage
      where offer_id=new.offer_id and order_id=new.id
    ) then
      insert into public.offer_usage(offer_id,user_id,order_id,discount_amount)
      values(new.offer_id,new.user_id,new.id,coalesce(new.discount_amount,0));

      update public.offers
      set used_count=used_count+1,updated_at=now()
      where id=new.offer_id;

      select id into target_id
      from public.offer_targets
      where offer_id=new.offer_id and user_id=new.user_id
      limit 1;

      if target_id is not null then
        update public.offer_targets
        set used_count=used_count+1
        where id=target_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------- redeem_offer
-- Mirrors 20260815_offer_usage_atomicity.
create or replace function public.redeem_offer(
  p_offer_id uuid,
  p_user_id uuid,
  p_subtotal numeric,
  p_total_quantity integer
)
returns table(discount_amount numeric, offer_code text)
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.offers%rowtype;
  target public.offer_targets%rowtype;
  d numeric;
begin
  select * into o
  from public.offers
  where id=p_offer_id and active=true and admin_approved=true
  for update;

  if not found then raise exception 'Offer is not active'; end if;
  if o.starts_at is not null and now()<o.starts_at then raise exception 'Offer has not started'; end if;
  if o.ends_at is not null and now()>o.ends_at then raise exception 'Offer has expired'; end if;
  if o.min_order_amount is not null and p_subtotal<o.min_order_amount then raise exception 'Minimum order amount not met'; end if;
  if o.min_quantity is not null and p_total_quantity<o.min_quantity then raise exception 'Minimum quantity not met'; end if;
  if o.max_uses is not null and o.used_count>=o.max_uses then raise exception 'Offer usage limit reached'; end if;

  if upper(o.target_type::text)='SELECTED_USERS' then
    select * into target
    from public.offer_targets
    where offer_id=o.id and user_id=p_user_id
    for update;
    if not found then raise exception 'Offer is not available for this user'; end if;
    if o.max_uses_per_user is not null and target.used_count>=o.max_uses_per_user then
      raise exception 'Per-user offer usage limit reached';
    end if;
  end if;

  if upper(o.offer_type::text)='FIXED' then
    d=coalesce(o.discount_amount,0);
  else
    d=round(p_subtotal*coalesce(o.discount_percent,0)/100,2);
  end if;
  if o.max_discount_amount is not null then d=least(d,o.max_discount_amount); end if;
  d=greatest(0,least(d,p_subtotal));

  return query select d,o.code;
end;
$$;

-- ------------------------------------------------------------- claim_offer_usage
-- Called by /api/order after stock reservation. Concurrency-safe: the unique
-- partial index on offer_usage(order_id) plus FOR UPDATE locking on the offer
-- row commit usage for at most one order.
create or replace function public.claim_offer_usage(
  p_offer_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_discount_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.offers%rowtype;
  target public.offer_targets%rowtype;
begin
  select * into o from public.offers where id=p_offer_id for update;
  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;
  if o.max_uses is not null and o.used_count >= o.max_uses then
    raise exception 'OFFER_MAX_USES_REACHED';
  end if;
  if upper(o.target_type::text) = 'SELECTED_USERS' then
    select * into target from public.offer_targets
     where offer_id=o.id and user_id=p_user_id
     for update;
    if not found then
      raise exception 'OFFER_USER_LIMIT_REACHED';
    end if;
    if o.max_uses_per_user is not null and target.used_count >= o.max_uses_per_user then
      raise exception 'OFFER_USER_LIMIT_REACHED';
    end if;
  end if;

  insert into public.offer_usage(offer_id,user_id,order_id,discount_amount)
  values (p_offer_id,p_user_id,p_order_id,coalesce(p_discount_amount,0));

  update public.offers set used_count=used_count+1,updated_at=now() where id=p_offer_id;
  if target.id is not null then
    update public.offer_targets set used_count=used_count+1 where id=target.id;
  end if;
  return jsonb_build_object('claimed',true,'offer_id',p_offer_id);
end;
$$;

-- ------------------------------------------------------------- sync_payment_record
-- Keeps payment_records in sync with the order's payment state so the
-- customer payment history always reflects the latest UTR/status.
create or replace function public.sync_payment_record()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.payment_records(order_id,method,amount,utr,status,submitted_at,verified_at)
  values (
    new.id,
    coalesce(new.payment_method,'UPI'),
    new.total_amount,
    nullif(new.utr,''),
    case new.payment_status
      when 'PENDING'::payment_status then 'PENDING'
      when 'SUBMITTED'::payment_status then 'SUBMITTED'
      when 'VERIFIED'::payment_status then 'VERIFIED'
      else 'REJECTED'
    end,
    case when new.utr is not null and new.utr <> '' then new.updated_at end,
    case when new.payment_status = 'VERIFIED'::payment_status then new.updated_at end
  )
  on conflict (order_id) do update set
    method = excluded.method,
    amount = excluded.amount,
    utr = coalesce(excluded.utr, payment_records.utr),
    status = excluded.status,
    submitted_at = coalesce(excluded.submitted_at, payment_records.submitted_at),
    verified_at = case when excluded.status = 'VERIFIED' then coalesce(excluded.verified_at, payment_records.verified_at) else payment_records.verified_at end,
    updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------ audit_order_security_event
-- Mirrors 20260815_order_audit_log and additionally appends to
-- order_status_history for the customer-facing timeline.
create or replace function public.audit_order_security_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.payment_status is distinct from new.payment_status
     or old.order_status is distinct from new.order_status then
    insert into public.activity_logs(
      actor_type,actor_id,action,entity_type,entity_id,metadata
    ) values(
      'SYSTEM',null,'ORDER_STATUS_CHANGED','ORDER',new.id::text,
      jsonb_build_object(
        'payment_status_before',old.payment_status::text,
        'payment_status_after',new.payment_status::text,
        'order_status_before',old.order_status::text,
        'order_status_after',new.order_status::text
      )
    );
    insert into public.order_status_history(order_id,order_status,payment_status,notes)
    values (
      new.id,
      new.order_status,
      new.payment_status,
      case when old.order_status is distinct from new.order_status
        then 'order_status: '||coalesce(old.order_status::text,'(null)')||' -> '||coalesce(new.order_status::text,'(null)')
        else null end
    );
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------ validate_review_purchase
-- Reviews are restricted to verified purchases: the user must have a VERIFIED
-- order containing this product. Approved is always left to admin moderation.
create or replace function public.validate_review_purchase()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  has_purchase boolean;
begin
  if new.user_id is null then
    raise exception 'REVIEW_USER_REQUIRED';
  end if;
  select exists(
    select 1
    from public.orders o
    where o.user_id = new.user_id
      and o.payment_status = 'VERIFIED'::payment_status
      and exists (
        select 1 from public.order_items oi
        where oi.order_id = o.id and oi.product_id = new.product_id
      )
  ) into has_purchase;
  if not has_purchase then
    raise exception 'VERIFIED_PURCHASE_REQUIRED';
  end if;
  new.verified_purchase := true;
  if new.approved is null then
    new.approved := false;
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------- consume_api_rate_limit
-- Database-backed per-IP/per-route rate limiter used by functions/_middleware.js.
create or replace function public.consume_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hits integer;
  v_window_start timestamptz;
  v_retry integer;
begin
  if p_limit is null or p_limit <= 0 then p_limit := 120; end if;
  if p_window_seconds is null or p_window_seconds <= 0 then p_window_seconds := 60; end if;

  update public.api_rate_limits
     set hits = case when window_start <= now() - make_interval(secs => p_window_seconds) then 1 else hits + 1 end,
         window_start = case when window_start <= now() - make_interval(secs => p_window_seconds) then now() else window_start end
   where key = p_key
  returning hits, window_start into v_hits, v_window_start;

  if not found then
    insert into public.api_rate_limits(key,hits,window_start)
    values (p_key,1,now())
    returning hits, window_start into v_hits, v_window_start;
  end if;

  if v_hits <= p_limit then
    allowed := true;
    retry_after_seconds := 0;
  else
    allowed := false;
    v_retry := ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())));
    retry_after_seconds := greatest(1, coalesce(v_retry, 1));
  end if;
  return new;
end;
$$;

-- --------------------------------------------------- expire_stale_order_reservations
-- Cancels unpaid orders that have been sitting with reserved stock for too
-- long and releases the stock. Intended to be scheduled every 5 minutes
-- (pg_cron schedule is added at the end of this file when the extension is
-- available; otherwise run it manually / from an edge function).
create or replace function public.expire_stale_order_reservations(p_max_age_minutes integer default 30)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  rec record;
  items jsonb;
  v_count integer := 0;
begin
  for rec in
    select o.id
    from public.orders o
    where o.payment_status = 'PENDING'::payment_status
      and o.stock_reserved = true
      and o.stock_released = false
      and o.created_at < now() - make_interval(mins => greatest(0, coalesce(p_max_age_minutes, 30)))
    for update
  loop
    select coalesce(jsonb_agg(jsonb_build_object('product_id', oi.product_id, 'quantity', oi.quantity)), '[]'::jsonb)
      into items
      from public.order_items oi
     where oi.order_id = rec.id;
    if coalesce(items, '[]'::jsonb) <> '[]'::jsonb then
      perform public.release_product_stock(items);
    end if;
    update public.orders
       set order_status = 'CANCELLED'::order_status,
           stock_released = true,
           admin_notes = 'Auto-cancelled: payment not completed in time; reserved stock released.',
           updated_at = now()
     where id = rec.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------- rls_auto_enable
-- Maintenance utility: enable RLS on any public table that lacks it.
create or replace function public.rls_auto_enable()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end;
$$;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- updated_at bookkeeping
drop trigger if exists trg_products_set_updated_at on public.products;
create trigger trg_products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists trg_product_variants_set_updated_at on public.product_variants;
create trigger trg_product_variants_set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
drop trigger if exists trg_categories_set_updated_at on public.categories;
create trigger trg_categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists trg_offers_set_updated_at on public.offers;
create trigger trg_offers_set_updated_at before update on public.offers for each row execute function public.set_updated_at();
drop trigger if exists trg_orders_set_updated_at on public.orders;
create trigger trg_orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists trg_supplier_orders_set_updated_at on public.supplier_orders;
create trigger trg_supplier_orders_set_updated_at before update on public.supplier_orders for each row execute function public.set_updated_at();
drop trigger if exists trg_support_tickets_set_updated_at on public.support_tickets;
create trigger trg_support_tickets_set_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();
drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_addresses_set_updated_at on public.addresses;
create trigger trg_addresses_set_updated_at before update on public.addresses for each row execute function public.set_updated_at();
drop trigger if exists trg_product_reviews_set_updated_at on public.product_reviews;
create trigger trg_product_reviews_set_updated_at before update on public.product_reviews for each row execute function public.set_updated_at();
drop trigger if exists trg_user_preferences_set_updated_at on public.user_preferences;
create trigger trg_user_preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
drop trigger if exists trg_admin_settings_set_updated_at on public.admin_settings;
create trigger trg_admin_settings_set_updated_at before update on public.admin_settings for each row execute function public.set_updated_at();

-- order number + electrical consistency
drop trigger if exists trg_generate_order_number on public.orders;
create trigger trg_generate_order_number before insert on public.orders for each row execute function public.generate_order_number();
drop trigger if exists trg_validate_electrical_product on public.products;
create trigger trg_validate_electrical_product before insert or update on public.products for each row execute function public.validate_electrical_product();

-- auth user -> profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- payment lifecycle
drop trigger if exists trg_handle_order_stock_after_payment on public.orders;
create trigger trg_handle_order_stock_after_payment before update of payment_status on public.orders for each row execute function public.handle_order_stock_after_payment();
drop trigger if exists trg_queue_supplier_orders_after_payment on public.orders;
create trigger trg_queue_supplier_orders_after_payment after update of payment_status on public.orders for each row execute function public.queue_supplier_orders_after_payment();
drop trigger if exists trg_record_offer_usage_on_verified_payment on public.orders;
create trigger trg_record_offer_usage_on_verified_payment after update of payment_status on public.orders for each row execute function public.record_offer_usage_on_verified_payment();
drop trigger if exists trg_sync_payment_record on public.orders;
create trigger trg_sync_payment_record after insert or update of payment_status,utr,total_amount,payment_method on public.orders for each row execute function public.sync_payment_record();
drop trigger if exists trg_audit_order_status on public.orders;
create trigger trg_audit_order_status after update of payment_status,order_status on public.orders for each row execute function public.audit_order_security_event();

-- verified-purchase review gate
drop trigger if exists trg_review_verified_purchase on public.product_reviews;
create trigger trg_review_verified_purchase before insert on public.product_reviews for each row execute function public.validate_review_purchase();

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.offers enable row level security;
alter table public.offer_targets enable row level security;
alter table public.offer_usage enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_records enable row level security;
alter table public.order_status_history enable row level security;
alter table public.activity_logs enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_orders enable row level security;
alter table public.product_sync_logs enable row level security;
alter table public.supplier_sync_logs enable row level security;
alter table public.product_reviews enable row level security;
alter table public.support_tickets enable row level security;
alter table public.notifications enable row level security;
alter table public.wishlists enable row level security;
alter table public.user_preferences enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.admin_settings enable row level security;
alter table public.api_rate_limits enable row level security;
-- service_role has BYPASSRLS; all writes above flow through service-role RPCs/APIs.
-- Tables without policies (activity_logs, suppliers, supplier_orders, sync logs,
-- offer_usage, api_rate_limits) are effectively read/write via service role only.

-- ---- products / variants / categories (public read of live catalogue)
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (active = true and approved_by_admin = true);

drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_variants.product_id and p.active = true and p.approved_by_admin = true));

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (active = true);

-- ---- offers (visible only when live and targeting the caller)
-- Mirrors 20260815_optimize_rls_auth_calls.
drop policy if exists offers_visible_to_users on public.offers;
create policy offers_visible_to_users on public.offers
  for select to anon, authenticated
  using (
    active = true
    and admin_approved = true
    and starts_at <= now()
    and (ends_at is null or ends_at >= now())
    and (
      target_type = 'ALL'::offer_target_type
      or (
        target_type = 'SELECTED_USERS'::offer_target_type
        and exists (
          select 1 from public.offer_targets ot
          where ot.offer_id = offers.id
            and ot.user_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists offer_targets_own_read on public.offer_targets;
create policy offer_targets_own_read on public.offer_targets
  for select to anon, authenticated
  using (user_id = (select auth.uid()));

-- ---- orders & order lifecycle (own rows only)
-- Mirrors 20260815_optimize_rls_auth_calls.
drop policy if exists orders_own_read on public.orders;
create policy orders_own_read on public.orders
  for select to anon, authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists order_items_own_read on public.order_items;
create policy order_items_own_read on public.order_items
  for select to anon, authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = (select auth.uid())));

drop policy if exists payment_records_own_read on public.payment_records;
create policy payment_records_own_read on public.payment_records
  for select to anon, authenticated
  using (exists (select 1 from public.orders o where o.id = payment_records.order_id and o.user_id = (select auth.uid())));

drop policy if exists order_history_own_read on public.order_status_history;
create policy order_history_own_read on public.order_status_history
  for select to anon, authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id and o.user_id = (select auth.uid())));

-- ---- profiles & addresses (own only)
-- Mirrors 20260815_optimize_rls_auth_calls.
drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read on public.profiles
  for select to anon, authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
  for update to anon, authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists addresses_own_read on public.addresses;
create policy addresses_own_read on public.addresses
  for select to anon, authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists addresses_own_insert on public.addresses;
create policy addresses_own_insert on public.addresses
  for insert to anon, authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists addresses_own_update on public.addresses;
create policy addresses_own_update on public.addresses
  for update to anon, authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists addresses_own_delete on public.addresses;
create policy addresses_own_delete on public.addresses
  for delete to anon, authenticated
  using ((select auth.uid()) = user_id);

-- ---- notifications (own only)
drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications
  for select to anon, authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update to anon, authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- reviews: public can read approved, owners can read their own and insert
drop policy if exists product_reviews_public_read on public.product_reviews;
create policy product_reviews_public_read on public.product_reviews
  for select to anon, authenticated
  using (approved = true);

drop policy if exists product_reviews_own_read on public.product_reviews;
create policy product_reviews_own_read on public.product_reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists product_reviews_own_insert on public.product_reviews;
create policy product_reviews_own_insert on public.product_reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- The BEFORE INSERT trigger enforces the verified-purchase rule.

-- ---- support / wishlist / preferences / account deletion (own only)
drop policy if exists support_tickets_own_read on public.support_tickets;
create policy support_tickets_own_read on public.support_tickets
  for select to anon, authenticated
  using (user_id = (select auth.uid()));

drop policy if exists support_tickets_own_insert on public.support_tickets;
create policy support_tickets_own_insert on public.support_tickets
  for insert to anon, authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists wishlists_own_read on public.wishlists;
create policy wishlists_own_read on public.wishlists
  for select to anon, authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wishlists_own_insert on public.wishlists;
create policy wishlists_own_insert on public.wishlists
  for insert to anon, authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists wishlists_own_update on public.wishlists;
create policy wishlists_own_update on public.wishlists
  for update to anon, authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists wishlists_own_delete on public.wishlists;
create policy wishlists_own_delete on public.wishlists
  for delete to anon, authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_preferences_own_read on public.user_preferences;
create policy user_preferences_own_read on public.user_preferences
  for select to anon, authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_preferences_own_insert on public.user_preferences;
create policy user_preferences_own_insert on public.user_preferences
  for insert to anon, authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_preferences_own_update on public.user_preferences;
create policy user_preferences_own_update on public.user_preferences
  for update to anon, authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists account_deletion_requests_own_read on public.account_deletion_requests;
create policy account_deletion_requests_own_read on public.account_deletion_requests
  for select to anon, authenticated
  using (user_id = (select auth.uid()));

drop policy if exists account_deletion_requests_own_insert on public.account_deletion_requests;
create policy account_deletion_requests_own_insert on public.account_deletion_requests
  for insert to anon, authenticated
  with check (user_id = (select auth.uid()));

-- ---- admin settings: storefront reads the public row directly (RLS path);
-- writes always go through the admin API (service role).
drop policy if exists admin_settings_public_read on public.admin_settings;
create policy admin_settings_public_read on public.admin_settings
  for select to anon, authenticated
  using (id = true);

-- ============================================================================
-- 9. RPC EXECUTION PRIVILEGES
-- (Mirrors 20260815_revoke_public_rpc_execute + 20260815_harden_security_definer_functions)
-- ============================================================================
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_order_stock_after_payment() from public, anon, authenticated;
revoke all on function public.queue_supplier_orders_after_payment() from public, anon, authenticated;
revoke all on function public.record_offer_usage_on_verified_payment() from public, anon, authenticated;
revoke all on function public.redeem_offer(uuid, uuid, numeric, integer) from public, anon, authenticated;
revoke all on function public.reserve_order_stock(jsonb) from public, anon, authenticated;
revoke all on function public.reserve_product_stock(jsonb) from public, anon, authenticated;
revoke all on function public.release_product_stock(jsonb) from public, anon, authenticated;
revoke all on function public.claim_offer_usage(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.sync_payment_record() from public, anon, authenticated;
revoke all on function public.audit_order_security_event() from public, anon, authenticated;
revoke all on function public.validate_review_purchase() from public, anon, authenticated;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.expire_stale_order_reservations(integer) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.handle_new_user() to service_role;
grant execute on function public.handle_order_stock_after_payment() to service_role;
grant execute on function public.queue_supplier_orders_after_payment() to service_role;
grant execute on function public.record_offer_usage_on_verified_payment() to service_role;
grant execute on function public.redeem_offer(uuid, uuid, numeric, integer) to service_role;
grant execute on function public.reserve_order_stock(jsonb) to service_role;
grant execute on function public.reserve_product_stock(jsonb) to service_role;
grant execute on function public.release_product_stock(jsonb) to service_role;
grant execute on function public.claim_offer_usage(uuid, uuid, uuid, numeric) to service_role;
grant execute on function public.sync_payment_record() to service_role;
grant execute on function public.audit_order_security_event() to service_role;
grant execute on function public.validate_review_purchase() to service_role;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
grant execute on function public.expire_stale_order_reservations(integer) to service_role;
grant execute on function public.rls_auto_enable() to service_role;

-- ============================================================================
-- 10. OPTIONAL SCHEDULE (pg_cron, when enabled in the Supabase project)
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('nexora-stale-order-expiry');
    exception when others then
      null; -- job did not exist yet
    end;
    perform cron.schedule(
      'nexora-stale-order-expiry',
      '*/5 * * * *',
      $cron$select public.expire_stale_order_reservations(30)$cron$
    );
  end if;
end
$$;

-- ============================================================================
-- 11. SEED DATA
-- ============================================================================
insert into public.categories (name, slug, description, active, sort_order, category_type)
values
  ('Footwear', 'footwear', 'Shoes, sneakers, sandals and slippers for men, women and kids.', true, 1, 'OWN'),
  ('Kitchen Appliances', 'kitchen-appliances', 'Blenders, mixers, juicers, air fryers and kitchen essentials.', true, 2, 'OWN'),
  ('Daily Use Products', 'daily-use-products', 'Household essentials, cleaning supplies, stationery and daily needs.', true, 3, 'OWN'),
  ('Artificial Jewellery', 'artificial-jewellery', 'Artificial jewellery and accessories for every occasion.', true, 4, 'OWN'),
  ('Electrical Appliances', 'electrical-appliances', 'Home electrical appliances with transparent MRP and delivery pricing.', true, 5, 'OWN')
on conflict (slug) do update
  set name = excluded.name,
      active = true;

-- Single settings row (addressed as admin_settings?id=eq.true)
insert into public.admin_settings
  (id, store_name, currency, store_enabled, user_registration_enabled, delivery_enabled,
   default_delivery_charge, electrical_delivery_charge, free_delivery_min_amount, updated_at)
values
  (true, 'Nexora-India', 'INR', true, true, true, 0, 0, 0, now())
on conflict (id) do nothing;

-- Default suppliers used by the supplier queue trigger and manual syncs.
-- Keep api_enabled=true; the actual supplier credentials come from Cloudflare
-- env vars (CJ_*, DeoDap public catalogue), never from the database.
insert into public.suppliers (name, source_type, active, api_enabled)
values
  ('CJ Dropshipping', 'CJ', true, true),
  ('DeoDap', 'DEODAP', true, true)
on conflict (name) do nothing;

-- ============================================================================
-- DONE. After this file, run the migrations in supabase/migrations/ in order.
-- ============================================================================

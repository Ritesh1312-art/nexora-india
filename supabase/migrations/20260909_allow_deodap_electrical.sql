-- Allow supplier-synced Electrical products from DeoDap.
alter table public.products drop constraint if exists products_electrical_source_check;
alter table public.products add constraint products_electrical_source_check check (
  category_id <> '0da61b0a-df83-4546-948c-2fdcb730ccda'::uuid
  or (
    (source = 'MANUAL'::product_source and stock_mode = 'MANUAL'::stock_mode)
    or (source = 'DEODAP'::product_source and stock_mode = 'AUTO'::stock_mode)
  )
);

-- DeoDap does not expose a reliable MRP in this feed, so only manual Electrical
-- products require MRP >= selling price. Supplier-synced products still require
-- non-negative cost/selling prices through the general product checks.
alter table public.products drop constraint if exists products_electrical_price_check;
alter table public.products add constraint products_electrical_price_check check (
  category_id <> '0da61b0a-df83-4546-948c-2fdcb730ccda'::uuid
  or (
    selling_price >= 0 and cost_price >= 0
    and (
      source = 'DEODAP'::product_source
      or (mrp is not null and mrp >= selling_price)
    )
  )
);
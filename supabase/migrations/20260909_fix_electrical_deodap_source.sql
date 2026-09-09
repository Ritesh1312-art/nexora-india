-- Fix the live electrical-product validation trigger.
-- The previous function used coalesce(new.source, '') on an enum, which makes
-- PostgreSQL try to cast '' to product_source and fail before the intended
-- validation. Electrical is a DeoDap supplier category in Nexora-India, so
-- DEODAP must also be accepted alongside MANUAL.
create or replace function public.validate_electrical_product()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  electrical_category uuid;
begin
  select id into electrical_category
  from public.categories
  where slug = 'electrical'
  limit 1;

  if new.category_id = electrical_category then
    if coalesce(new.source::text, '') not in ('MANUAL','DEODAP') then
      raise exception 'Electrical products must use MANUAL or DEODAP source';
    end if;
    if new.mrp is not null and new.mrp < new.selling_price then
      raise exception 'Electrical product MRP cannot be lower than selling price';
    end if;
    if new.min_order_qty < 1 then
      raise exception 'Electrical product minimum order quantity must be at least 1';
    end if;
    if new.delivery_charge < 0 then
      raise exception 'Electrical product delivery charge cannot be negative';
    end if;
    if new.stock < 0 then
      raise exception 'Electrical product stock cannot be negative';
    end if;
  end if;
  return new;
end;
$$;
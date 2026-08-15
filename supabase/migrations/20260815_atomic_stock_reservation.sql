-- Atomic inventory reservation for concurrent checkout requests.
-- The RPCs run in PostgreSQL so two checkouts cannot both consume the same stock.

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
    pid := nullif(item->>'product_id','')::uuid;
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

    reserved := reserved || jsonb_build_array(
      jsonb_build_object('product_id', pid, 'quantity', qty)
    );
  end loop;

  return reserved;
end;
$$;

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
    pid := nullif(item->>'product_id','')::uuid;
    qty := greatest(1, coalesce((item->>'quantity')::integer, 1));
    if pid is null then
      raise exception 'INVALID_PRODUCT_ID';
    end if;

    update products
       set stock = greatest(0, stock + qty),
           updated_at = now()
     where id = pid;

    if found then
      released := released || jsonb_build_array(
        jsonb_build_object('product_id', pid, 'quantity', qty)
      );
    end if;
  end loop;

  return released;
end;
$$;

revoke all on function public.reserve_product_stock(jsonb) from public;
revoke all on function public.release_product_stock(jsonb) from public;
grant execute on function public.reserve_product_stock(jsonb) to service_role;
grant execute on function public.release_product_stock(jsonb) to service_role;

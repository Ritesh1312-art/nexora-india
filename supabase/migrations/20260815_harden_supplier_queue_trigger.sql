CREATE OR REPLACE FUNCTION public.queue_supplier_orders_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', pg_catalog
AS $$
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
REVOKE EXECUTE ON FUNCTION public.queue_supplier_orders_after_payment() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_supplier_orders_after_payment() TO service_role;

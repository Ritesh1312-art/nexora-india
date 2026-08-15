-- Prevent duplicate supplier routing records for the same store order + supplier.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_orders_order_supplier_uidx
ON public.supplier_orders(order_id, supplier_id)
WHERE supplier_id IS NOT NULL;
